-- Apply once to the remote project; non-destructive catalog extension.
begin;
alter table public.titles add column if not exists overview text;
alter table public.titles add column if not exists genres jsonb not null default '[]';
alter table public.titles add column if not exists original_language text;
create unique index if not exists titles_tmdb_media_unique on public.titles(tmdb_id,media_type) where tmdb_id is not null;

create table if not exists public.cover_candidates (
  id uuid primary key default gen_random_uuid(),
  tmdb_id integer not null,
  media_type text not null check (media_type in ('movie','series')),
  provider text not null check (provider in ('tmdb','fanart')),
  url text not null,
  preview_url text not null,
  width integer not null check (width >= 650),
  height integer not null check (height >= 1000),
  language text,
  metadata jsonb not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  check (width::numeric / height between 0.64 and 0.75)
);
alter table public.cover_candidates enable row level security;
grant select,insert,delete on public.cover_candidates to authenticated;
create policy "admins curate own candidates" on public.cover_candidates for all to authenticated
using ((select auth.jwt()->'app_metadata'->>'role') = 'admin' and created_by = (select auth.uid()))
with check ((select auth.jwt()->'app_metadata'->>'role') = 'admin' and created_by = (select auth.uid()));
grant select,insert,update on public.titles,public.title_platforms to authenticated;
create policy "admins manage titles" on public.titles for all to authenticated
using ((select auth.jwt()->'app_metadata'->>'role') = 'admin')
with check ((select auth.jwt()->'app_metadata'->>'role') = 'admin');
create policy "admins manage title links" on public.title_platforms for all to authenticated
using ((select auth.jwt()->'app_metadata'->>'role') = 'admin')
with check ((select auth.jwt()->'app_metadata'->>'role') = 'admin');

create or replace function public.import_curated_title(candidate_id uuid, title_category text, platform_ids uuid[])
returns uuid language plpgsql security invoker set search_path = '' as $$
declare c public.cover_candidates; new_id uuid;
begin
  if auth.uid() is null or (auth.jwt()->'app_metadata'->>'role') is distinct from 'admin' then
    raise exception 'Administrator required' using errcode = '42501';
  end if;
  if title_category not in ('animation','film') then raise exception 'Invalid category'; end if;
  if coalesce(cardinality(platform_ids),0) = 0 or cardinality(platform_ids) > 5 then raise exception 'Choose platforms'; end if;
  if exists(select 1 from unnest(platform_ids) p where not exists(
    select 1 from public.platforms where id=p and active and slug in ('jellyfin','netflix','disney-plus','prime-video','rai-play')
  )) then raise exception 'Invalid platform'; end if;
  select * into c from public.cover_candidates where id=candidate_id and created_by=auth.uid() and expires_at>now();
  if not found then raise exception 'Cover expired: retrieve candidates again'; end if;
  insert into public.titles(name,canonical_title,category,media_type,release_year,runtime_minutes,
    external_source,external_id,tmdb_id,poster_url,dvd_cover_url,backdrop_url,image_mode,metadata_status,overview,genres,original_language)
  values(c.metadata->>'name',c.metadata->>'original_title',title_category,c.media_type,
    (c.metadata->>'release_year')::integer,(c.metadata->>'runtime_minutes')::integer,
    'tmdb',c.tmdb_id::text,c.tmdb_id,c.metadata->>'poster_url',c.url,c.metadata->>'backdrop_url',
    'dvd','reviewed',c.metadata->>'overview',coalesce(c.metadata->'genres','[]'),c.metadata->>'original_language')
  returning id into new_id;
  insert into public.title_platforms(title_id,platform_id,active)
    select new_id,p,true from (select distinct unnest(platform_ids) p) x;
  return new_id;
end $$;
revoke all on function public.import_curated_title(uuid,text,uuid[]) from public,anon;
grant execute on function public.import_curated_title(uuid,text,uuid[]) to authenticated;
update public.platforms set active=false where slug not in ('jellyfin','netflix','disney-plus','prime-video','rai-play');
commit;
