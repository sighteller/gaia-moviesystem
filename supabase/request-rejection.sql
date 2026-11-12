-- Preserve IDs/history; rejection is reversible and separate from archive.
alter table public.titles add column request_rejected_at timestamptz;
alter table public.titles alter column request_status set expression as (case when requested_at is null then 'none'::text when request_rejected_at is not null then 'rejected'::text when request_resolved_at is not null then 'fulfilled'::text else 'pending'::text end);
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
  if c ? 'request_rejected' then
   if jsonb_typeof(c->'request_rejected') is distinct from 'boolean' then raise exception 'Stato richiesta non valido'; end if;
   if (c->>'request_rejected')::boolean is distinct from (t.request_rejected_at is not null) then
    if t.request_status not in ('pending','rejected') or (c->>'active')::boolean then raise exception 'Solo le richieste non disponibili possono essere rifiutate o ripristinate'; end if;
   end if;
  end if;
  update public.titles set request_rejected_at=case when not(c ? 'request_rejected') then t.request_rejected_at when (c->>'request_rejected')::boolean then coalesce(t.request_rejected_at,clock_timestamp()) else null end,name=trim(c->>'name'),category=c->>'category',release_year=(c->>'release_year')::integer,dvd_cover_url=nullif(c->>'dvd_cover_url',''),active=(c->>'active')::boolean,quote_override=nullif(c->'quote_override','null'::jsonb),updated_at=clock_timestamp() where id=t.id;
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
