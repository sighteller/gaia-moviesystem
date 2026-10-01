-- Follow-up to schema-image-curator.sql. Public UI; controlled writes through Edge only.
begin;
create schema if not exists gaia_private;
revoke all on schema gaia_private from public,anon,authenticated;
grant usage on schema gaia_private to service_role;
create or replace function gaia_private.tmdb_token() returns text
language plpgsql security definer set search_path='' as $$
begin
  if (auth.jwt()->>'role') is distinct from 'service_role' then
    raise exception 'Service only' using errcode='42501';
  end if;
  return (select decrypted_secret from vault.decrypted_secrets where name='GAIA_TMDB_READ_ACCESS_TOKEN' limit 1);
end $$;
revoke all on function gaia_private.tmdb_token() from public,anon,authenticated;
grant execute on function gaia_private.tmdb_token() to service_role;
create or replace function public.curator_provider_token() returns text
language sql security invoker set search_path='' as $$ select gaia_private.tmdb_token() $$;
revoke all on function public.curator_provider_token() from public,anon,authenticated;
grant execute on function public.curator_provider_token() to service_role;

alter table public.cover_candidates alter column created_by drop not null;
alter table public.cover_candidates add column if not exists title_id uuid references public.titles(id);
create unique index if not exists title_cover_candidate_unique on public.cover_candidates(title_id,url);

create or replace function public.add_public_curated_title(candidate_id uuid,title_category text,platform_ids uuid[])
returns uuid language plpgsql security invoker set search_path='' as $$
declare c public.cover_candidates; new_id uuid;
begin
  if (auth.jwt()->>'role') is distinct from 'service_role' then raise exception 'Service only' using errcode='42501'; end if;
  if title_category is null or title_category not in ('animation','film') then raise exception 'Invalid category'; end if;
  if coalesce(cardinality(platform_ids),0)=0 or cardinality(platform_ids)>5 then raise exception 'Choose platforms'; end if;
  if exists(select 1 from unnest(platform_ids) p where not exists(
    select 1 from public.platforms where id=p and active and slug in ('jellyfin','netflix','disney-plus','prime-video','rai-play')
  )) then raise exception 'Invalid platform'; end if;
  select * into c from public.cover_candidates where id=candidate_id and title_id is null and expires_at>now();
  if not found then raise exception 'Cover expired'; end if;
  insert into public.titles(name,canonical_title,category,media_type,release_year,runtime_minutes,
    external_source,external_id,tmdb_id,poster_url,dvd_cover_url,backdrop_url,image_mode,metadata_status,overview,genres,original_language)
  values(c.metadata->>'name',c.metadata->>'original_title',title_category,c.media_type,
    (c.metadata->>'release_year')::integer,(c.metadata->>'runtime_minutes')::integer,
    'tmdb',c.tmdb_id::text,c.tmdb_id,c.metadata->>'poster_url',c.url,c.metadata->>'backdrop_url',
    'dvd','reviewed',c.metadata->>'overview',coalesce(c.metadata->'genres','[]'),c.metadata->>'original_language')
  returning id into new_id;
  insert into public.title_platforms(title_id,platform_id,active)
    select new_id,p,true from (select distinct unnest(platform_ids) p) x;
  update public.cover_candidates set title_id=new_id,expires_at=now()+interval '365 days'
    where tmdb_id=c.tmdb_id and media_type=c.media_type and title_id is null and expires_at>now();
  return new_id;
end $$;
revoke all on function public.add_public_curated_title(uuid,text,uuid[]) from public,anon,authenticated;
grant execute on function public.add_public_curated_title(uuid,text,uuid[]) to service_role;

create or replace function public.choose_curated_cover(target_title_id uuid,candidate_id uuid,expected_url text)
returns text language plpgsql security invoker set search_path='' as $$
declare c public.cover_candidates; saved_url text;
begin
  if (auth.jwt()->>'role') is distinct from 'service_role' then raise exception 'Service only' using errcode='42501'; end if;
  select cc.* into c from public.cover_candidates cc join public.titles t on t.id=target_title_id
    where cc.id=candidate_id and cc.title_id=t.id and cc.tmdb_id=t.tmdb_id and cc.media_type=t.media_type and cc.expires_at>now() and t.active;
  if not found then raise exception 'Invalid cover for title'; end if;
  update public.titles set dvd_cover_url=c.url,image_mode='dvd',updated_at=now()
    where id=target_title_id and dvd_cover_url is not distinct from expected_url
    returning dvd_cover_url into saved_url;
  if not found then raise exception 'Cover changed: reload title' using errcode='40001'; end if;
  return saved_url;
end $$;
revoke all on function public.choose_curated_cover(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.choose_curated_cover(uuid,uuid,text) to service_role;
commit;
