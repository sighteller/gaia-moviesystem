alter table public.selections
 add column runtime_seconds integer check (runtime_seconds > 0),
 add column completion_threshold_at timestamptz,
 add column watched_seconds integer check (watched_seconds >= 0),
 add column watched_fraction numeric(5,4) check (watched_fraction between 0 and 1),
 add column viewing_ended_at timestamptz;
alter table public.selections drop constraint selections_viewing_status_check;
alter table public.selections add constraint selections_viewing_status_check check (viewing_status in ('in_progress','presumed_completed','changed','interrupted'));

create function public.gaia_viewing_snapshot() returns trigger
language plpgsql security invoker set search_path=''
as $$
declare duration integer;
begin
 select runtime_minutes*60 into duration from public.titles where id=new.title_id and media_type='movie';
 new.runtime_seconds:=duration;
 new.expected_end_at:=case when duration is not null then new.selected_at+duration*interval '1 second' else null end;
 new.completion_threshold_at:=case when duration is not null then new.selected_at+duration*0.8*interval '1 second' else null end;
 new.watched_seconds:=null;new.watched_fraction:=null;new.viewing_ended_at:=null;
 return new;
end $$;
revoke all on function public.gaia_viewing_snapshot() from public,anon,authenticated;
create trigger gaia_selection_runtime_snapshot before insert on public.selections
 for each row execute function public.gaia_viewing_snapshot();

create function public.gaia_check_viewing(target_device uuid) returns jsonb
language plpgsql security invoker set search_path=''
as $$
declare r public.selections%rowtype; checked_at timestamptz:=clock_timestamp();
 duration integer; elapsed integer; progress numeric; result_status text; results jsonb:='[]'::jsonb;
begin
 if target_device is null then raise exception 'Dispositivo non valido'; end if;
 for r in select * from public.selections where device_id=target_device and viewing_status='in_progress' order by id for update loop
  duration:=r.runtime_seconds;
  if duration is null and r.completion_threshold_at is null then
   select runtime_minutes*60 into duration from public.titles where id=r.title_id and media_type='movie';
  end if;
  elapsed:=greatest(0,floor(extract(epoch from checked_at-r.selected_at)))::integer;
  if duration is not null then
   elapsed:=least(elapsed,duration);
   progress:=elapsed::numeric/duration;
   result_status:=case when elapsed>=duration*0.8 then 'presumed_completed' else 'interrupted' end;
  else
   progress:=null;result_status:='interrupted';
  end if;
  update public.selections set runtime_seconds=duration,watched_seconds=elapsed,watched_fraction=progress,
   completion_threshold_at=case when duration is not null then r.selected_at+duration*0.8*interval '1 second' else null end,
   viewing_ended_at=checked_at,viewing_status=result_status,status_updated_at=checked_at
   where id=r.id and device_id=target_device and viewing_status='in_progress';
  results:=results||jsonb_build_array(jsonb_build_object('id',r.id,'titleId',r.title_id,'status',result_status,'watchedSeconds',elapsed,'watchedFraction',progress));
 end loop;
 return jsonb_build_object('ok',true,'viewings',results);
end $$;
revoke all on function public.gaia_check_viewing(uuid) from public;
grant execute on function public.gaia_check_viewing(uuid) to anon,authenticated;
comment on column public.selections.watched_seconds is 'Estimated elapsed viewing time on first return to Gaia; not a player-reported position.';
