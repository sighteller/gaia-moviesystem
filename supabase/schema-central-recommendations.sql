create extension if not exists unaccent with schema extensions;
create table gaia_private.recommendation_epochs (
 id uuid primary key default gen_random_uuid(),subject text not null,mode text not null default 'test' check(mode in ('test','live')),
 revision bigint not null default 0,model jsonb not null default '{"version":1,"mode":"test","totalShown":0,"exposures":[],"choices":[],"previousSpecials":[]}'::jsonb,
 last_session_id uuid,created_at timestamptz not null default now());
create table gaia_private.recommendation_profiles(subject text primary key,active_epoch uuid not null references gaia_private.recommendation_epochs(id));
create table gaia_private.recommendation_devices(device_id uuid primary key,subject text not null references gaia_private.recommendation_profiles(subject));
create table gaia_private.recommendation_sessions(
 session_id uuid primary key references public.sessions(id),epoch uuid not null references gaia_private.recommendation_epochs(id),
 device_id uuid not null,model jsonb not null,created_at timestamptz not null default now());
create table gaia_private.recommendation_exposures(
 epoch uuid not null references gaia_private.recommendation_epochs(id),session_id uuid not null references gaia_private.recommendation_sessions(session_id),
 title_id uuid not null references public.titles(id),kind text not null check(kind in ('regular','inspiration','underdog')),
 sequence bigint not null,shown_at timestamptz not null,cost numeric not null,recent boolean not null,
 rejected boolean not null default false,chosen boolean not null default false,
 primary key(epoch,session_id,title_id),unique(epoch,sequence));
create table gaia_private.recommendation_choices(
 epoch uuid not null references gaia_private.recommendation_epochs(id),session_id uuid not null references gaia_private.recommendation_sessions(session_id),
 title_id uuid not null references public.titles(id),selected_at timestamptz not null,expected_end_at timestamptz,changed boolean not null default false,
 primary key(epoch,session_id));
create index recommendation_sessions_epoch on gaia_private.recommendation_sessions(epoch);
create index recommendation_exposures_title on gaia_private.recommendation_exposures(epoch,title_id);
create index recommendation_choices_title on gaia_private.recommendation_choices(epoch,title_id);
do $$ declare e uuid; begin
 insert into gaia_private.recommendation_epochs(subject) values('gaia') returning id into e;
 insert into gaia_private.recommendation_profiles values('gaia',e);
end $$;
do $$ declare t text; begin foreach t in array array['recommendation_epochs','recommendation_profiles','recommendation_devices','recommendation_sessions','recommendation_exposures','recommendation_choices'] loop
 execute format('alter table gaia_private.%I enable row level security',t);
 execute format('revoke all on gaia_private.%I from public,anon,authenticated',t);
 execute format('grant select,insert,update on gaia_private.%I to service_role',t);
end loop; end $$;

create function public.gaia_recommendation_load(target_device uuid,target_session uuid default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare e gaia_private.recommendation_epochs;subject_name text;cur jsonb;ss jsonb;
begin
 select coalesce((select subject from gaia_private.recommendation_devices where device_id=target_device),'gaia') into subject_name;
 select x.* into strict e from gaia_private.recommendation_epochs x join gaia_private.recommendation_profiles p on p.active_epoch=x.id where p.subject=subject_name;
 if target_session is not null then
  select s.model,to_jsonb(l) into cur,ss from gaia_private.recommendation_sessions s join public.sessions l on l.id=s.session_id
  where s.session_id=target_session and s.device_id=target_device and s.epoch=e.id;
 else
  select model into cur from gaia_private.recommendation_sessions where session_id=e.last_session_id;
 end if;
 return jsonb_build_object('subject',subject_name,'epoch',e.id,'revision',e.revision,'mode',e.mode,'model',e.model||jsonb_build_object('current',cur),'session',ss);
end $$;

create function public.gaia_recommendation_commit(target_device uuid,target_session uuid,expected_epoch uuid,expected_revision bigint,updated_model jsonb,new_session jsonb default null,choice jsonb default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare e gaia_private.recommendation_epochs;subject_name text;cur jsonb:=updated_model->'current';item jsonb;stamp timestamptz:=clock_timestamp();
begin
 select coalesce((select subject from gaia_private.recommendation_devices where device_id=target_device),'gaia') into subject_name;
 select x.* into strict e from gaia_private.recommendation_epochs x join gaia_private.recommendation_profiles p on p.active_epoch=x.id where p.subject=subject_name for update of x;
 if e.id<>expected_epoch or e.revision<>expected_revision then return jsonb_build_object('conflict',true);end if;
 if (cur->>'id')::uuid<>target_session then raise exception 'Session mismatch';end if;
 if new_session is not null then
  insert into gaia_private.recommendation_devices values(target_device,subject_name) on conflict do nothing;
  insert into public.sessions(id,device_id,category,enabled_platform_ids,current_title_id,navigation_history,status,started_at,last_interaction_at,expires_at)
  values(target_session,target_device,new_session->>'category',array(select jsonb_array_elements_text(new_session->'platformIds')::uuid),null,'{}','active',stamp,stamp,stamp+interval '20 minutes');
  insert into gaia_private.recommendation_sessions values(target_session,e.id,target_device,cur,stamp);
 else
  if not exists(select 1 from gaia_private.recommendation_sessions where session_id=target_session and device_id=target_device and epoch=e.id) then raise exception 'Unknown session';end if;
  update gaia_private.recommendation_sessions set model=cur where session_id=target_session;
 end if;
 update gaia_private.recommendation_epochs set revision=revision+1,model=updated_model-'current'-'_shownTitleId'-'_navigationHistory',last_session_id=case when updated_model->>'_shownTitleId' is not null then target_session else last_session_id end where id=e.id;
 for item in select value from jsonb_array_elements(updated_model->'exposures') where value->>'sessionId'=target_session::text loop
  insert into gaia_private.recommendation_exposures(epoch,session_id,title_id,kind,sequence,shown_at,cost,recent,rejected,chosen)
  values(e.id,target_session,(item->>'titleId')::uuid,item->>'kind',(item->>'sequence')::bigint,(item->>'at')::timestamptz,(item->>'cost')::numeric,(item->>'recent')::boolean,(item->>'rejected')::boolean,(item->>'chosen')::boolean)
  on conflict(epoch,session_id,title_id) do update set rejected=excluded.rejected,chosen=excluded.chosen;
 end loop;
 if updated_model->>'_shownTitleId' is not null then
  update public.sessions set current_title_id=(updated_model->>'_shownTitleId')::uuid,navigation_history=coalesce(array(select jsonb_array_elements_text(updated_model->'_navigationHistory')::uuid),'{}'::uuid[]),last_interaction_at=stamp,expires_at=stamp+interval '20 minutes' where id=target_session;
 end if;
 for item in select value from jsonb_array_elements(updated_model->'exposures') where value->>'sessionId'=target_session::text loop
  if (item->>'rejected')::boolean then
   insert into public.session_rejections(session_id,title_id) values(target_session,(item->>'titleId')::uuid) on conflict(session_id,title_id) do nothing;
  else
   delete from public.session_rejections where session_id=target_session and title_id=(item->>'titleId')::uuid;
  end if;
 end loop;
 for item in select value from jsonb_array_elements(updated_model->'choices') loop
  insert into gaia_private.recommendation_choices values(e.id,(item->>'sessionId')::uuid,(item->>'titleId')::uuid,(item->>'at')::timestamptz,(item->>'expectedEndAt')::timestamptz,coalesce((item->>'changed')::boolean,false))
  on conflict(epoch,session_id) do update set changed=excluded.changed;
 end loop;
 if choice is not null then
  if coalesce((choice->>'isNew')::boolean,false) and not exists(select 1 from public.selections where session_id=target_session) then
   insert into public.selections(session_id,device_id,title_id,platform_id,selection_mode,selected_at,viewing_status,status_updated_at)
   values(target_session,target_device,(choice->>'titleId')::uuid,(choice->>'platformId')::uuid,choice->>'mode',(choice->>'at')::timestamptz,'in_progress',stamp);
  end if;
  update public.sessions set status='completed',completed_at=stamp,last_interaction_at=stamp where id=target_session;
 end if;
 return jsonb_build_object('ok',true);
end $$;

create function public.gaia_recommendation_imported_seeds() returns jsonb language sql stable security invoker set search_path='' as $$
with names as materialized (
 select id,lower(regexp_replace(extensions.unaccent(name),'[^[:alnum:]]','','g')) as key from public.titles where active and media_type='movie'
 union
 select id,lower(regexp_replace(extensions.unaccent(canonical_title),'[^[:alnum:]]','','g')) as key from public.titles where active and media_type='movie' and canonical_title is not null
), aliases as materialized (
 select key,(array_agg(distinct id))[1] as id from names where key<>'' group by key having count(distinct id)=1
),eligible as materialized (
 select h.*,lower(regexp_replace(extensions.unaccent(coalesce(h.raw_fields->'derived'->>'group_title',h.source_title)),'[^[:alnum:]]','','g')) as title_key
 from gaia_private.imported_playback_events h where subject='gaia' and content_kind='movie' and duration_seconds>0 and quality_flags='[]'::jsonb
),matched as (
 select h.*,coalesce(h.title_id,a.id) as matched_id from eligible h left join aliases a on h.title_id is null and a.key=h.title_key
),daily as (
 select matched_id,occurred_local_at::date as day,sum(duration_seconds) as seconds from matched where matched_id is not null group by matched_id,occurred_local_at::date having sum(duration_seconds)>=600
),stats as (
 select matched_id,count(*) as days,max(day) as last_day,array_agg(day order by day) filter(where day>=current_date-30) as recent_days from daily group by matched_id
)
select coalesce(jsonb_agg(jsonb_build_object('titleId',matched_id,'days',days,'lastDay',last_day,'recentDays',coalesce(recent_days,'{}'))),'[]'::jsonb) from stats;
$$;
revoke all on function public.gaia_recommendation_load(uuid,uuid),public.gaia_recommendation_commit(uuid,uuid,uuid,bigint,jsonb,jsonb,jsonb),public.gaia_recommendation_imported_seeds() from public,anon,authenticated;
grant execute on function public.gaia_recommendation_load(uuid,uuid),public.gaia_recommendation_commit(uuid,uuid,uuid,bigint,jsonb,jsonb,jsonb),public.gaia_recommendation_imported_seeds() to service_role;

create or replace function public.gaia_recommendation_stats(target_device uuid) returns jsonb language sql stable security invoker set search_path='' as $$
with scope as (select p.active_epoch as epoch from gaia_private.recommendation_profiles p where p.subject=coalesce((select subject from gaia_private.recommendation_devices where device_id=target_device),'gaia')),
x as (select title_id,count(*) filter(where rejected and not chosen) as no from gaia_private.recommendation_exposures where epoch=(select epoch from scope) group by title_id),
y as (select c.title_id,count(*) as chosen,count(*) filter(where c.changed) as changed,count(*) filter(where s.selection_mode='limited') as limited,count(*) filter(where s.selection_mode='unlimited') as unlimited,count(*) filter(where s.viewing_status='presumed_completed') as completed,count(*) filter(where s.viewing_status='interrupted') as interrupted from gaia_private.recommendation_choices c left join public.selections s on s.session_id=c.session_id where c.epoch=(select epoch from scope) group by c.title_id),
h as (select (value->>'titleId')::uuid as title_id,(value->>'days')::integer as days from jsonb_array_elements(public.gaia_recommendation_imported_seeds()))
select coalesce(jsonb_agg(jsonb_build_object('title',jsonb_build_object('id',t.id,'name',t.name),'chosen',coalesce(y.chosen,0),'no',coalesce(x.no,0),'changed',coalesce(y.changed,0),'limited',coalesce(y.limited,0),'unlimited',coalesce(y.unlimited,0),'completed',coalesce(y.completed,0),'interrupted',coalesce(y.interrupted,0),'historyDays',coalesce(h.days,0)) order by coalesce(y.chosen,0) desc,t.name),'[]'::jsonb) from public.titles t left join x on x.title_id=t.id left join y on y.title_id=t.id left join h on h.title_id=t.id where t.active;
$$;
revoke all on function public.gaia_recommendation_stats(uuid) from public,anon,authenticated;
grant execute on function public.gaia_recommendation_stats(uuid) to service_role;
