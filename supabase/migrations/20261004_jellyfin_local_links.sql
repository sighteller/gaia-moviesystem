CREATE OR REPLACE FUNCTION public.jellyfin_finish_sync(run uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare s public.jellyfin_sync_state; row record; d jsonb; tid uuid; old public.jellyfin_items;
 pid uuid; ids uuid[]; added integer:=0; linked integer:=0; review integer:=0; removed integer:=0; result jsonb;
begin
 select * into s from public.jellyfin_sync_state where id for update;
 if s.run_id is distinct from run then raise exception 'Expired run'; end if;
 if (select count(*) from public.jellyfin_sync_stage where run_id=run)<>s.expected_count then raise exception 'Incomplete snapshot'; end if;
 -- A major reduction requires an operator check; never silently remove most availability.
 if s.expected_count < (select count(*)*0.7 from public.jellyfin_items where present) then raise exception 'Catalog reduced by more than 30 percent: check libraries'; end if;
 select id into strict pid from public.platforms where slug='jellyfin';
 for row in select * from public.jellyfin_sync_stage where run_id=run loop
  d:=row.data; tid:=null; ids:=null;
  select * into old from public.jellyfin_items where item_id=row.item_id;
  tid:=old.title_id;
  if tid is null and d->>'tmdb_id' is not null then
   select array_agg(id) into ids from public.titles where tmdb_id=(d->>'tmdb_id')::integer and media_type=d->>'media_type';
  end if;
  if tid is null and coalesce(cardinality(ids),0)=0 then
   select array_agg(id) into ids from public.titles where media_type=d->>'media_type'
    and release_year=(d->>'year')::integer and lower(trim(name))=lower(trim(d->>'name'))
    and (tmdb_id is null or d->>'tmdb_id' is null or tmdb_id=(d->>'tmdb_id')::integer);
  end if;
  if tid is null and cardinality(ids)>1 then
   review:=review+1;
  else
   if tid is null and cardinality(ids)=1 then tid:=ids[1]; end if;
   if tid is null then
    insert into public.titles(name,canonical_title,category,media_type,release_year,runtime_minutes,external_source,external_id,
      tmdb_id,poster_url,overview,genres,metadata_status)
    values(d->>'name',d->>'original_title',d->>'category',d->>'media_type',(d->>'year')::integer,
      (d->>'runtime')::integer,'jellyfin',row.item_id,(d->>'tmdb_id')::integer,d->>'cover_url',
      d->>'overview',coalesce(d->'genres','[]'::jsonb),'needs_review') returning id into tid;
    added:=added+1;
   else
    -- Fill missing metadata; respect manual edits and selected artwork.
    update public.titles set overview=coalesce(nullif(overview,''),d->>'overview'),
     runtime_minutes=case when media_type=d->>'media_type' then coalesce(runtime_minutes,(d->>'runtime')::integer) else runtime_minutes end,
     poster_url=coalesce(poster_url,d->>'cover_url'),updated_at=now() where id=tid;
    linked:=linked+1;
   end if;
   insert into public.title_platforms(title_id,platform_id,active,last_verified_at,url)
    values(tid,pid,true,now(),case when exists(select 1 from public.titles where id=tid and media_type=d->>'media_type') then 'http://localhost:8096/web/index.html#/details?id='||row.item_id||'&serverId='||s.server_id else null end)
    on conflict(title_id,platform_id) do update set active=true,last_verified_at=now(),
     url=coalesce(nullif(trim(public.title_platforms.url),''),excluded.url);
  end if;
  insert into public.jellyfin_items(item_id,title_id,data,present,last_seen_at) values(row.item_id,tid,d,true,now())
   on conflict(item_id) do update set title_id=excluded.title_id,data=excluded.data,present=true,last_seen_at=now();
 end loop;
 update public.jellyfin_items i set present=false where present and not exists(select 1 from public.jellyfin_sync_stage st where st.run_id=run and st.item_id=i.item_id);
 update public.title_platforms p set active=false,last_verified_at=now() where p.platform_id=pid and p.active
  and exists(select 1 from public.jellyfin_items i where i.title_id=p.title_id and not i.present)
  and not exists(select 1 from public.jellyfin_items i where i.title_id=p.title_id and i.present);
 get diagnostics removed=row_count;
 result:=jsonb_build_object('total',s.expected_count,'added',added,'linked',linked,'review',review,'removed',removed);
 update public.jellyfin_sync_state set run_id=null,last_success_at=now(),last_seen_at=now(),last_error=null,
  fulfilled_at=s.request_cutoff,summary=result where id;
 delete from public.jellyfin_sync_stage where run_id=run;
 return result;
end $function$
;

-- Fill only empty links; preserve availability, archives, history and manual links.
with matched as (
 select distinct on(t.id) t.id as title_id,i.item_id from public.titles t join public.jellyfin_items i on i.title_id=t.id
 where i.present and i.item_id ~ '^[a-fA-F0-9]{32}$' and i.data->>'media_type'=t.media_type
 order by t.id,(i.item_id=t.external_id) desc,i.last_seen_at desc,i.item_id
), sources as (
 select * from matched
 union all
 select t.id,t.external_id from public.titles t where t.external_source='jellyfin' and t.external_id ~ '^[a-fA-F0-9]{32}$'
 and not exists(select 1 from matched m where m.title_id=t.id)
), changes as (
 update public.title_platforms tp set url='http://localhost:8096/web/index.html#/details?id='||src.item_id||'&serverId='||s.server_id
 from sources src,public.platforms p,public.jellyfin_sync_state s
 where tp.title_id=src.title_id and tp.platform_id=p.id and p.slug='jellyfin' and s.id
 and s.server_id ~ '^[a-fA-F0-9]{32}$' and nullif(trim(tp.url),'') is null
 returning tp.title_id,tp.active
)
select count(*) as links_added,count(*) filter(where active) as available_links from changes;