-- Additive: historical rows remain NULL, because their consultation history is unknown.
alter table public.sessions
  add column if not exists consulted_title_ids uuid[],
  add column if not exists browse_steps integer check (browse_steps is null or browse_steps >= 1);
alter table public.selections
  add column if not exists consulted_title_ids uuid[],
  add column if not exists titles_consulted integer check (titles_consulted is null or titles_consulted >= 1),
  add column if not exists browse_steps integer check (browse_steps is null or browse_steps >= titles_consulted);

create or replace function gaia_private.track_session_consultations()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    if NEW.current_title_id is not null then
      NEW.consulted_title_ids := array[NEW.current_title_id];
      NEW.browse_steps := 1;
    else
      NEW.consulted_title_ids := null;
      NEW.browse_steps := null;
    end if;
  else
    NEW.consulted_title_ids := OLD.consulted_title_ids;
    NEW.browse_steps := OLD.browse_steps;
    if OLD.browse_steps is not null and NEW.current_title_id is distinct from OLD.current_title_id and NEW.current_title_id is not null then
      if not (NEW.current_title_id = any(NEW.consulted_title_ids)) then
        NEW.consulted_title_ids := array_append(NEW.consulted_title_ids,NEW.current_title_id);
      end if;
      NEW.browse_steps := OLD.browse_steps + 1;
    end if;
  end if;
  return NEW;
end;
$$;
revoke all on function gaia_private.track_session_consultations() from public,anon,authenticated;
create trigger track_session_consultations before insert or update on public.sessions
for each row execute function gaia_private.track_session_consultations();

create or replace function gaia_private.snapshot_choice_consultations()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  ids uuid[];
  steps integer;
begin
  select s.consulted_title_ids,s.browse_steps into ids,steps
    from public.sessions s where s.id=NEW.session_id and s.device_id=NEW.device_id;
  if steps is not null then
    if not (NEW.title_id = any(ids)) then
      ids := array_append(ids,NEW.title_id);
      steps := steps + 1;
    end if;
    NEW.consulted_title_ids := ids;
    NEW.titles_consulted := cardinality(ids);
    NEW.browse_steps := steps;
  else
    NEW.consulted_title_ids := null;
    NEW.titles_consulted := null;
    NEW.browse_steps := null;
  end if;
  return NEW;
end;
$$;
revoke all on function gaia_private.snapshot_choice_consultations() from public,anon,authenticated;
create trigger snapshot_choice_consultations before insert on public.selections
for each row execute function gaia_private.snapshot_choice_consultations();
