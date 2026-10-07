-- Keep one cached candidate per URL when linking a newly requested title.
CREATE OR REPLACE FUNCTION public.request_public_curated_title(candidate_id uuid, title_category text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare c public.cover_candidates; new_id uuid;
begin
  if (auth.jwt()->>'role') is distinct from 'service_role' then raise exception 'Service only' using errcode='42501'; end if;
  if title_category is null or title_category not in ('animation','film') then raise exception 'Invalid category'; end if;
  select * into c from public.cover_candidates where id=candidate_id and expires_at>now();
  if not found then raise exception 'Cover expired'; end if;
  select id into new_id from public.titles where tmdb_id=c.tmdb_id and media_type=c.media_type;
  if found then
   if exists(select 1 from public.titles where id=new_id and request_status='pending') then
    return jsonb_build_object('titleId',new_id,'created',false,'notification','not_configured');
   end if;
   raise exception 'Titolo già nel catalogo';
  end if;
  insert into public.titles(name,canonical_title,category,media_type,release_year,runtime_minutes,
    external_source,external_id,tmdb_id,poster_url,dvd_cover_url,backdrop_url,image_mode,metadata_status,overview,genres,original_language,active,requested_at)
  values(c.metadata->>'name',c.metadata->>'original_title',title_category,c.media_type,
    (c.metadata->>'release_year')::integer,(c.metadata->>'runtime_minutes')::integer,
    'tmdb',c.tmdb_id::text,c.tmdb_id,c.metadata->>'poster_url',c.url,c.metadata->>'backdrop_url',
    'dvd','reviewed',c.metadata->>'overview',coalesce(c.metadata->'genres','[]'),c.metadata->>'original_language',false,now())
  returning id into new_id;
  update public.cover_candidates set title_id=new_id,expires_at=now()+interval '365 days'
    where id in (select distinct on (url) id from public.cover_candidates where tmdb_id=c.tmdb_id and media_type=c.media_type and title_id is null and expires_at>now() order by url,(id=c.id) desc,created_at desc);
  insert into public.film_request_notifications(title_id) values(new_id);
  return jsonb_build_object('titleId',new_id,'created',true,'notification','not_configured');
end $function$
