alter table public.titles add column episode_collection text check(episode_collection is null or length(episode_collection)<=200);
create function public.gaia_save_structured_catalog(changes jsonb) returns jsonb language plpgsql set search_path='' as $$
declare c jsonb;s jsonb;t public.titles;parent public.titles;result jsonb;kind text;parent_id uuid;season integer;episode integer;
begin
if (auth.jwt()->>'role') is distinct from 'service_role' then raise exception 'Service only' using errcode='42501';end if;
if jsonb_typeof(changes) is distinct from 'array' or jsonb_array_length(changes)>500 then raise exception 'Elenco modifiche non valido';end if;
perform pg_advisory_xact_lock(hashtextextended('gaia-catalog-identification',0));
result:=public.gaia_save_identified_catalog(changes);
-- Promote new series first, so a batch may attach episodes to a series created in that batch.
for c in select value from jsonb_array_elements(changes) order by case when value->'structure'->>'kind'='series' then 0 else 1 end,value->>'id' loop
 s:=c->'structure';if s is null or s='null'::jsonb then continue;end if;
 if jsonb_typeof(s)<>'object' or coalesce(s->>'kind','') not in('movie','series','episode') then raise exception 'Tipo del contenuto non valido';end if;
 select * into strict t from public.titles where id=(c->>'id')::uuid for update;
 kind:=s->>'kind';parent_id:=nullif(s->>'series_id','')::uuid;season:=nullif(s->>'season_number','')::integer;episode:=nullif(s->>'episode_number','')::integer;
 if length(coalesce(s->>'collection_name',''))>200 then raise exception 'Il nome della raccolta è troppo lungo';end if;
 if season is not null and season not between 0 and 999 then raise exception 'Stagione non valida: usa 0 per gli speciali oppure lascia vuoto';end if;
 if episode is not null and episode not between 1 and 9999 then raise exception 'Numero episodio non valido';end if;
 if kind<>'series' and exists(select 1 from public.titles where series_id=t.id) then raise exception 'Questa serie contiene episodi: spostali prima di cambiarne il tipo';end if;
 if kind='episode' then
  if parent_id is null or parent_id=t.id then raise exception 'Scegli una serie di appartenenza diversa dall’episodio';end if;
  select * into parent from public.titles where id=parent_id for update;
  if not found or parent.media_type<>'series' or parent.series_id is not null then raise exception 'La serie di appartenenza non è valida';end if;
  if t.media_type='series' and t.tmdb_id is not null then raise exception 'Questa scheda è collegata a una serie TMDb: usa una scheda episodio separata';end if;
  update public.titles set media_type='movie',series_id=parent_id,season_number=season,episode_number=episode,episode_collection=nullif(trim(s->>'collection_name'),'') where id=t.id;
 else
  if parent_id is not null or season is not null or episode is not null then raise exception 'Stagione e numero richiedono il tipo Episodio';end if;
  if t.tmdb_id is not null and t.media_type<>kind then raise exception 'Il tipo non coincide con TMDb. Seleziona il corretto risultato TMDb prima di cambiare tipo';end if;
  update public.titles set media_type=kind,series_id=null,season_number=null,episode_number=null,episode_collection=null,runtime_minutes=case when kind='series' then null else runtime_minutes end where id=t.id;
 end if;
end loop;
return result;
end;$$;
revoke all on function public.gaia_save_structured_catalog(jsonb) from public,anon,authenticated;
grant execute on function public.gaia_save_structured_catalog(jsonb) to service_role;
