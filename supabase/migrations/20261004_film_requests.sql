alter table public.titles add column requested_at timestamptz, add column request_status text generated always as (case when requested_at is null then 'none' when active then 'fulfilled' else 'pending' end) stored;
create table public.film_request_notifications(
 title_id uuid primary key references public.titles(id), created_at timestamptz not null default now(),
 status text not null default 'pending' check(status in ('pending','sent','failed')),
 sent_at timestamptz, last_error text);
alter table public.film_request_notifications enable row level security;
revoke all on public.film_request_notifications from public,anon,authenticated;
grant all on public.film_request_notifications to service_role;
CREATE OR REPLACE FUNCTION public.request_public_curated_title(candidate_id uuid, title_category text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare c public.cover_candidates; new_id uuid;
begin
  if (auth.jwt()->>'role') is distinct from 'service_role' then raise exception 'Service only' using errcode='42501'; end if;
  if title_category is null or title_category not in ('animation','film') then raise exception 'Invalid category'; end if;
  select * into c from public.cover_candidates where id=candidate_id and title_id is null and expires_at>now();
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
    where tmdb_id=c.tmdb_id and media_type=c.media_type and title_id is null and expires_at>now();
  insert into public.film_request_notifications(title_id) values(new_id);
  return jsonb_build_object('titleId',new_id,'created',true,'notification','not_configured');
end $function$;

revoke all on function public.request_public_curated_title(uuid,text) from public,anon,authenticated;
grant execute on function public.request_public_curated_title(uuid,text) to service_role;
CREATE OR REPLACE FUNCTION public.gaia_save_catalog(changes jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare c jsonb; t public.titles%rowtype; l jsonb; rev text; n integer:=0; pid uuid; u text;
begin
 if jsonb_typeof(changes) is distinct from 'array' or jsonb_array_length(changes)>500 then raise exception 'Elenco modifiche non valido'; end if;
 if (select count(*) from jsonb_array_elements(changes))<>(select count(distinct x->>'id') from jsonb_array_elements(changes) x) then raise exception 'Titoli duplicati'; end if;
 for c in select value from jsonb_array_elements(changes) order by value->>'id' loop
  select * into t from public.titles where id=(c->>'id')::uuid for update;
  if not found then raise exception 'Titolo non trovato'; end if;
  perform 1 from public.title_platforms where title_id=t.id for update;
  select md5(t::text||coalesce(string_agg(tp::text,',' order by tp.platform_id),'')) into rev from public.title_platforms tp where tp.title_id=t.id;
  if rev is distinct from c->>'revision' then raise exception 'Il catalogo è cambiato per %. Le tue bozze sono conservate.',t.name; end if;
  if coalesce(length(trim(c->>'name')),0) not between 1 and 300 or coalesce(c->>'category','') not in ('film','animation') or jsonb_typeof(c->'active') is distinct from 'boolean' then raise exception 'Titolo o categoria non validi'; end if;
  if c->>'release_year' is not null and (c->>'release_year')::integer not between 1800 and 2200 then raise exception 'Anno non valido'; end if;
  u=nullif(c->>'dvd_cover_url','');
  if u is not null and (u !~ '^https://' or length(u)>2000) then raise exception 'Copertina: usa un indirizzo HTTPS'; end if;
  if c->'quote_override' is distinct from 'null'::jsonb and c ? 'quote_override' then
   if jsonb_typeof(c->'quote_override')<>'object' or length(c->'quote_override'->>'text')>500 or length(c->'quote_override'->>'speaker')>100 then raise exception 'Citazione non valida'; end if;
   u=nullif(c->'quote_override'->>'source','');
   if u is not null and (u !~ '^https://' or length(u)>2000) then raise exception 'Fonte: usa un indirizzo HTTPS'; end if;
  end if;
  if jsonb_typeof(c->'links') is distinct from 'array' or jsonb_array_length(c->'links')>5 then raise exception 'Piattaforme non valide'; end if;
  if (select count(*) from jsonb_array_elements(c->'links'))<>(select count(distinct x->>'platform_id') from jsonb_array_elements(c->'links') x) then raise exception 'Piattaforme duplicate'; end if;
  if t.requested_at is not null and (c->>'active')::boolean and not exists(select 1 from jsonb_array_elements(c->'links') x where x->>'active'='true') then raise exception 'Scegli almeno una piattaforma per rendere disponibile il titolo'; end if;
  update public.titles set name=trim(c->>'name'),category=c->>'category',release_year=(c->>'release_year')::integer,dvd_cover_url=nullif(c->>'dvd_cover_url',''),active=(c->>'active')::boolean,quote_override=nullif(c->'quote_override','null'::jsonb),updated_at=clock_timestamp() where id=t.id;
  for l in select value from jsonb_array_elements(c->'links') loop
   pid=(l->>'platform_id')::uuid;
   if not exists(select 1 from public.platforms where id=pid and active and slug in ('jellyfin','netflix','disney-plus','prime-video','rai-play')) or jsonb_typeof(l->'active') is distinct from 'boolean' then raise exception 'Piattaforma non valida'; end if;
   u=nullif(l->>'url','');
   if u is not null and (u !~ '^https?://' or length(u)>2000) then raise exception 'Link della piattaforma non valido'; end if;
   insert into public.title_platforms(title_id,platform_id,url,active,last_verified_at) values(t.id,pid,u,(l->>'active')::boolean,case when (l->>'active')::boolean then clock_timestamp() else null end) on conflict(title_id,platform_id) do update set url=excluded.url,active=excluded.active,last_verified_at=case when public.title_platforms.url is distinct from excluded.url or public.title_platforms.active is distinct from excluded.active then excluded.last_verified_at else public.title_platforms.last_verified_at end;
  end loop;
  n=n+1;
 end loop;
 return jsonb_build_object('saved',n);
end;
$function$
;
alter table public.titles add column request_resolved_at timestamptz;
alter table public.titles drop column request_status;
alter table public.titles add column request_status text generated always as (case when requested_at is null then 'none' when request_resolved_at is not null then 'fulfilled' else 'pending' end) stored;
create function public.gaia_resolve_requested_title() returns trigger language plpgsql security invoker set search_path='' as $$ begin
 if new.requested_at is not null and new.active and new.request_resolved_at is null then new.request_resolved_at:=clock_timestamp();end if;return new;end $$;
revoke all on function public.gaia_resolve_requested_title() from public,anon,authenticated;
create trigger gaia_resolve_requested_title before update of active on public.titles for each row execute function public.gaia_resolve_requested_title();
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
    where tmdb_id=c.tmdb_id and media_type=c.media_type and title_id is null and expires_at>now();
  insert into public.film_request_notifications(title_id) values(new_id);
  return jsonb_build_object('titleId',new_id,'created',true,'notification','not_configured');
end $function$;

