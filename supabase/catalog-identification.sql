alter table public.titles add column manually_identified boolean not null default false;
create table gaia_private.tmdb_identifications(
 id uuid primary key default gen_random_uuid(),tmdb_id integer not null check(tmdb_id>0),
 media_type text not null check(media_type in('movie','series')),metadata jsonb not null,
 created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '7 days'
);
alter table gaia_private.tmdb_identifications enable row level security;
grant select,insert on gaia_private.tmdb_identifications to service_role;

create function public.gaia_cache_tmdb_identification(provider_id integer,provider_type text,provider_metadata jsonb) returns uuid
language plpgsql set search_path='' as $$
declare matched uuid;
begin
if (auth.jwt()->>'role') is distinct from 'service_role' then raise exception 'Service only' using errcode='42501';end if;
insert into gaia_private.tmdb_identifications(tmdb_id,media_type,metadata) values(provider_id,provider_type,provider_metadata) returning id into matched;
return matched;
end;$$;
revoke all on function public.gaia_cache_tmdb_identification(integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.gaia_cache_tmdb_identification(integer,text,jsonb) to service_role;

create function public.gaia_save_identified_catalog(changes jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare c jsonb; t public.titles; matched gaia_private.tmdb_identifications; result jsonb;
begin
if (auth.jwt()->>'role') is distinct from 'service_role' then raise exception 'Service only' using errcode='42501';end if;
if jsonb_typeof(changes) is distinct from 'array' or jsonb_array_length(changes)>500 then raise exception 'Elenco modifiche non valido';end if;
perform pg_advisory_xact_lock(hashtextextended('gaia-catalog-identification',0));
-- Existing editor validation, optimistic concurrency and batch transaction are preserved.
result:=public.gaia_save_catalog(changes);
for c in select value from jsonb_array_elements(changes) order by value->>'id' loop
 if c->'identification' is null or c->'identification'='null'::jsonb then continue;end if;
 select * into strict t from public.titles where id=(c->>'id')::uuid for update;
 if c->'identification' = '{"manual":true}'::jsonb then
  if t.tmdb_id is not null then raise exception 'Questo titolo ha già un collegamento TMDb';end if;
  update public.titles set manually_identified=true where id=t.id;
 elsif jsonb_typeof(c->'identification')='object' and c->'identification' ? 'match_id' and (select count(*) from jsonb_object_keys(c->'identification'))=1 then
  select * into matched from gaia_private.tmdb_identifications where id=(c->'identification'->>'match_id')::uuid and expires_at>now();
  if not found then raise exception 'La ricerca TMDb è scaduta. Ripeti la ricerca: le altre modifiche restano in bozza.';end if;
  if exists(select 1 from public.titles where tmdb_id=matched.tmdb_id and media_type=matched.media_type and id<>t.id) then raise exception 'Il risultato TMDb è già associato a un altro titolo del catalogo';end if;
  if t.series_id is not null and matched.media_type='series' then raise exception 'Un episodio non può diventare una serie: seleziona il titolo corretto';end if;
  if matched.media_type<>'series' and exists(select 1 from public.titles where series_id=t.id) then raise exception 'Questa serie contiene episodi e non può diventare un film';end if;
  update public.titles set tmdb_id=matched.tmdb_id,media_type=matched.media_type,
   canonical_title=matched.metadata->>'original_title',
   release_year=(matched.metadata->>'release_year')::integer,
   runtime_minutes=(matched.metadata->>'runtime_minutes')::integer,
   overview=matched.metadata->>'overview',genres=coalesce(matched.metadata->'genres','[]'::jsonb),
   original_language=matched.metadata->>'original_language',
   production_companies=coalesce(matched.metadata->'production_companies','[]'::jsonb),
   production_companies_checked_at=case when matched.metadata ? 'production_companies' then now() else null end,
   poster_url=case when t.dvd_cover_url is null and t.custom_image_url is null and t.poster_url is not null then t.poster_url else matched.metadata->>'poster_url' end,backdrop_url=matched.metadata->>'backdrop_url',
   metadata_status='reviewed',manually_identified=false
  where id=t.id;
 else raise exception 'Identificazione non valida';end if;
end loop;
return result;
end;$$;
revoke all on function public.gaia_save_identified_catalog(jsonb) from public,anon,authenticated;
grant execute on function public.gaia_save_identified_catalog(jsonb) to service_role;
