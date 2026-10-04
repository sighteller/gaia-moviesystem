-- User confirmed proceeding on 4 October after being informed that anonymous shared catalog changes risk public tampering.
-- Only the explicitly requested editable columns, no deletions, no sessions/selections access.
alter table public.titles add column if not exists quote_override jsonb;
revoke update on public.titles from anon;
grant update(name,category,release_year,dvd_cover_url,active,quote_override,updated_at) on public.titles to anon;
create policy "catalog archive readable" on public.titles for select to anon using(true);
create policy "catalog requested fields editable" on public.titles for update to anon using(true) with check(length(trim(name)) between 1 and 300 and category in ('film','animation') and (release_year is null or release_year between 1800 and 2200) and (dvd_cover_url is null or dvd_cover_url ~ '^https://') and (quote_override is null or jsonb_typeof(quote_override)='object'));
create policy "catalog all links readable" on public.title_platforms for select to anon using(true);
create policy "catalog allowed links insert" on public.title_platforms for insert to anon with check(exists(select 1 from public.platforms p where p.id=platform_id and p.slug in ('jellyfin','netflix','disney-plus','prime-video','rai-play')));
create policy "catalog allowed links edit" on public.title_platforms for update to anon using(exists(select 1 from public.platforms p where p.id=platform_id and p.slug in ('jellyfin','netflix','disney-plus','prime-video','rai-play'))) with check(exists(select 1 from public.platforms p where p.id=platform_id and p.slug in ('jellyfin','netflix','disney-plus','prime-video','rai-play')));


create or replace function public.gaia_catalog_editor() returns jsonb language sql security invoker set search_path='' as $$
select jsonb_build_object('titles',(select coalesce(jsonb_agg(to_jsonb(t)||jsonb_build_object('revision',md5(t::text||coalesce((select string_agg(l::text,',' order by l.platform_id) from public.title_platforms l where l.title_id=t.id),''))) order by t.name),'[]'::jsonb) from public.titles t),'platforms',(select coalesce(jsonb_agg(p order by p.name),'[]'::jsonb) from public.platforms p where p.active and p.slug in ('jellyfin','netflix','disney-plus','prime-video','rai-play')),'links',(select coalesce(jsonb_agg(l),'[]'::jsonb) from public.title_platforms l));
$$;
create or replace function public.gaia_save_catalog(changes jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
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
$$;
revoke all on function public.gaia_catalog_editor() from public;
revoke all on function public.gaia_save_catalog(jsonb) from public;
grant execute on function public.gaia_catalog_editor() to anon,authenticated;
grant execute on function public.gaia_save_catalog(jsonb) to anon,authenticated;
