create schema if not exists gaia_private;
create table if not exists gaia_private.playback_history_imports(
 file_sha256 text primary key check(file_sha256 ~ '^[0-9a-f]{64}$'),
 source text not null check(source in ('jellyfin','netflix','disney')),
 filename text not null,row_count integer not null check(row_count>=0),
 imported_at timestamptz not null default now());
create table if not exists gaia_private.imported_playback_events(
 id uuid primary key default gen_random_uuid(),
 subject text not null default 'gaia',source text not null check(source in ('jellyfin','netflix','disney')),
 event_key text not null,first_import_sha256 text not null references gaia_private.playback_history_imports(file_sha256),
 source_user_id text,source_item_id text,source_timestamp text not null,
 occurred_local_at timestamp not null,time_zone text,
 content_kind text not null check(content_kind in ('movie','episode','musicvideo','other')),
 title_id uuid references public.titles(id) on delete set null,
 source_title text not null,duration_seconds integer check(duration_seconds>=0),
 match_status text not null check(match_status in ('mapped','unmatched','ambiguous')),
 quality_flags jsonb not null default '[]'::jsonb check(jsonb_typeof(quality_flags)='array'),
 raw_fields jsonb not null,imported_at timestamptz not null default now(),
 unique(source,event_key));
create index if not exists imported_playback_events_subject_title_time on gaia_private.imported_playback_events(subject,title_id,occurred_local_at);
create index if not exists imported_playback_events_import_file on gaia_private.imported_playback_events(first_import_sha256);
alter table gaia_private.playback_history_imports enable row level security;
alter table gaia_private.imported_playback_events enable row level security;
revoke all on gaia_private.playback_history_imports,gaia_private.imported_playback_events from public,anon,authenticated;
grant usage on schema gaia_private to service_role;
grant select,insert,update on gaia_private.playback_history_imports,gaia_private.imported_playback_events to service_role;
