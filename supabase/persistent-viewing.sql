alter table public.selections add column if not exists wrong_choice boolean not null default false;
alter table public.selections add column if not exists viewing_dismissed_at timestamptz;

-- Server time and the duration snapshot determine progress. No browser-supplied percentages.
create or replace function public.gaia_viewing_state(target_device uuid, target_selection uuid default null, stop_viewing boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.selections%rowtype; stamp timestamptz:=clock_timestamp(); elapsed integer; progress numeric; title_data jsonb;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Service role required';end if;
 if target_device is null then raise exception 'Dispositivo non valido';end if;
 select * into r from public.selections where device_id=target_device order by selected_at desc,id desc limit 1 for update;
 if not found then return jsonb_build_object('viewing',null,'serverNow',stamp);end if;
 if target_selection is not null and target_selection<>r.id then raise exception 'La visione è cambiata. Ricarica la pagina.';end if;
 if r.viewing_dismissed_at is not null or r.viewing_status not in ('in_progress','presumed_completed') then
  return jsonb_build_object('viewing',null,'lastViewing',jsonb_build_object('sessionId',r.session_id,'endedAt',r.viewing_ended_at,'dismissed',r.viewing_dismissed_at is not null),'serverNow',stamp);
 end if;
 elapsed:=greatest(0,floor(extract(epoch from stamp-r.selected_at)))::integer;
 if r.runtime_seconds is not null then
  elapsed:=least(elapsed,r.runtime_seconds);progress:=elapsed::numeric/r.runtime_seconds;
 end if;
 if stop_viewing then
  update public.selections set watched_seconds=elapsed,watched_fraction=progress,
   viewing_status=case when progress>=0.8 then 'presumed_completed' else 'interrupted' end,
   wrong_choice=coalesce(progress<0.5,false),viewing_ended_at=stamp,viewing_dismissed_at=stamp,status_updated_at=stamp
   where id=r.id returning * into r;
 elsif progress>=0.8 and r.viewing_status='in_progress' then
  update public.selections set watched_seconds=elapsed,watched_fraction=progress,viewing_status='presumed_completed',
   viewing_ended_at=completion_threshold_at,status_updated_at=stamp where id=r.id returning * into r;
 end if;
 select to_jsonb(t) into title_data from public.titles t where t.id=r.title_id;
 return jsonb_build_object('serverNow',stamp,'viewing',case when stop_viewing then null else
  jsonb_build_object('id',r.id,'sessionId',r.session_id,'titleId',r.title_id,'platformId',r.platform_id,'startedAt',r.selected_at,
  'expectedEndAt',r.expected_end_at,'runtimeSeconds',r.runtime_seconds,'status',r.viewing_status,'title',title_data) end,
  'result',case when stop_viewing then jsonb_build_object('status',r.viewing_status,'wrongChoice',r.wrong_choice,'watchedSeconds',r.watched_seconds,'watchedFraction',r.watched_fraction) else null end);
end $$;
revoke all on function public.gaia_viewing_state(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.gaia_viewing_state(uuid,uuid,boolean) to service_role;

-- Compatibility: old tabs may still call this RPC when returning. Reading must not interrupt.
create or replace function public.gaia_check_viewing(target_device uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if target_device is null then raise exception 'Dispositivo non valido';end if;
 return jsonb_build_object('ok',true,'viewings','[]'::jsonb);
end $$;
