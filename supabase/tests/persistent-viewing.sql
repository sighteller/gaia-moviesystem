begin;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$
declare t uuid;p uuid;d uuid;s uuid;v uuid;r jsonb;sec integer;
begin
 select l.title_id,l.platform_id into t,p from public.title_platforms l join public.titles x on x.id=l.title_id where x.media_type='movie' and x.runtime_minutes>0 limit 1;
 foreach sec in array array[499,500,799,800,1000] loop
  d:=gen_random_uuid();s:=gen_random_uuid();
  insert into public.sessions(id,device_id,category,enabled_platform_ids,current_title_id,navigation_history,status) values(s,d,'film',array[p],t,array[t],'completed');
  insert into public.selections(session_id,device_id,title_id,platform_id,selection_mode,selected_at,viewing_status) values(s,d,t,p,'unlimited',clock_timestamp()-sec*interval '1 second','in_progress') returning id into v;
  update public.selections set runtime_seconds=1000,expected_end_at=selected_at+interval '1000 seconds',completion_threshold_at=selected_at+interval '800 seconds' where id=v;
  r:=public.gaia_viewing_state(d);
  if r->'viewing'->>'id'<>v::text then raise exception 'Restore failed';end if;
  if (select viewing_status from public.selections where id=v)<>(case when sec>=800 then 'presumed_completed' else 'in_progress' end) then raise exception 'Read threshold failed %',sec;end if;
  perform public.gaia_check_viewing(d);
  if (select viewing_dismissed_at from public.selections where id=v) is not null then raise exception 'Legacy read dismissed';end if;
  r:=public.gaia_viewing_state(d,v,true);
  if (r->'result'->>'wrongChoice')::boolean<>(sec<500) then raise exception '50 percent failed %',sec;end if;
  if r->'result'->>'status'<>(case when sec>=800 then 'presumed_completed' else 'interrupted' end) then raise exception '80 percent failed %',sec;end if;
  r:=public.gaia_viewing_state(d);
  if r->'viewing'<>'null'::jsonb then raise exception 'Dismiss did not persist';end if;
 end loop;
end $$;
rollback;