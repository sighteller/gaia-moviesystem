begin;
create table public.jellyfin_sync_state (
 id boolean primary key default true check(id), connector_hash text,
 server_id text, requested_at timestamptz, fulfilled_at timestamptz,
 last_seen_at timestamptz, last_success_at timestamptz, last_error text,
 run_id uuid, run_started_at timestamptz, run_heartbeat_at timestamptz, expected_count integer,
 request_cutoff timestamptz, summary jsonb
);
insert into public.jellyfin_sync_state(id) values(true);
create table public.jellyfin_sync_stage (
 run_id uuid not null, item_id text not null, data jsonb not null,
 created_at timestamptz not null default now(),
 primary key(run_id,item_id)
);
create table public.jellyfin_items (
 item_id text primary key, title_id uuid references public.titles(id),
 data jsonb not null, present boolean not null default true,
 last_seen_at timestamptz not null default now()
);
alter table public.jellyfin_sync_state enable row level security;
alter table public.jellyfin_sync_stage enable row level security;
alter table public.jellyfin_items enable row level security;
revoke all on public.jellyfin_sync_state,public.jellyfin_sync_stage,public.jellyfin_items from public,anon,authenticated;
grant all on public.jellyfin_sync_state,public.jellyfin_sync_stage,public.jellyfin_items to service_role;

create function public.jellyfin_request_sync() returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.jellyfin_sync_state;
begin
 select * into s from public.jellyfin_sync_state where id for update;
 if s.connector_hash is null then raise exception 'Connector not configured'; end if;
 if s.requested_at is null or (s.requested_at <= s.fulfilled_at and s.requested_at < now()-interval '15 minutes') then
  update public.jellyfin_sync_state set requested_at=now() where id;
 end if;
 return jsonb_build_object('queued',true);
end $$;

create function public.jellyfin_begin_sync(server text,total integer) returns uuid language plpgsql security invoker set search_path='' as $$
declare s public.jellyfin_sync_state; r uuid := gen_random_uuid();
begin
 select * into s from public.jellyfin_sync_state where id for update;
 if total<1 or total>10000 then raise exception 'Empty or excessive catalog: no changes'; end if;
 if s.server_id is not null and s.server_id<>server then raise exception 'Different Jellyfin server'; end if;
 if s.run_id is not null and s.run_heartbeat_at>now()-interval '30 minutes' then raise exception 'Sync already running'; end if;
 -- Remove only the replaced run or genuinely stale temporary data.
 delete from public.jellyfin_sync_stage where run_id=s.run_id or created_at<now()-interval '1 day';
 update public.jellyfin_sync_state set server_id=server,run_id=r,run_started_at=now(),run_heartbeat_at=now(),last_seen_at=now(),
  expected_count=total,request_cutoff=now(),last_error=null where id;
 return r;
end $$;

-- Diagnostic through the same HTTP/RPC path as Windows. Always rolls back its run.
create function public.jellyfin_probe_sync(server text,total integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 begin
  perform public.jellyfin_begin_sync(server,total);
  raise exception using errcode='P0999',message='probe rollback';
 exception when sqlstate 'P0999' then return jsonb_build_object('ok',true);
 end;
end $$;
revoke all on function public.jellyfin_probe_sync(text,integer) from public,anon,authenticated;
grant execute on function public.jellyfin_probe_sync(text,integer) to service_role;

create function public.jellyfin_stage_sync(run uuid,items jsonb) returns void language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.jellyfin_sync_state where id and run_id=run for update;
 if not found then raise exception 'Expired run'; end if;
 insert into public.jellyfin_sync_stage(run_id,item_id,data)
 select run,x->>'id',x from jsonb_array_elements(items) x
 on conflict(run_id,item_id) do update set data=excluded.data;
 update public.jellyfin_sync_state set last_seen_at=now(),run_heartbeat_at=now() where id;
end $$;

create function public.jellyfin_finish_sync(run uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
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
   insert into public.title_platforms(title_id,platform_id,active,last_verified_at)
    values(tid,pid,true,now()) on conflict(title_id,platform_id) do update set active=true,last_verified_at=now();
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
end $$;
revoke all on function public.jellyfin_request_sync(),public.jellyfin_begin_sync(text,integer),public.jellyfin_stage_sync(uuid,jsonb),public.jellyfin_finish_sync(uuid) from public,anon,authenticated;
grant execute on function public.jellyfin_request_sync(),public.jellyfin_begin_sync(text,integer),public.jellyfin_stage_sync(uuid,jsonb),public.jellyfin_finish_sync(uuid) to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('jellyfin-covers','jellyfin-covers',true,1048576,array['image/jpeg','image/png']) on conflict(id) do nothing;
commit;
