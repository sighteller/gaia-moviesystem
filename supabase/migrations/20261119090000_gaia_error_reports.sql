create table public.gaia_error_reports (
  id uuid primary key,
  reporter_name text not null check (char_length(reporter_name) between 1 and 100),
  report_page text not null check (char_length(report_page) between 1 and 180),
  description text not null check (char_length(description) between 10 and 4000),
  created_at timestamptz not null default now(),
  notification text not null default 'pending' check (notification in ('pending','failed','sent'))
);

alter table public.gaia_error_reports enable row level security;
revoke all on public.gaia_error_reports from public, anon, authenticated, service_role;
grant select, insert, update on public.gaia_error_reports to service_role;
create index gaia_error_reports_created_at_idx on public.gaia_error_reports (created_at desc);

create function public.submit_gaia_error_report(report_id uuid, name text, page text, problem text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  existing public.gaia_error_reports%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(741941919);
  select * into existing from public.gaia_error_reports where id = report_id;
  if found then
    if existing.reporter_name <> name or existing.report_page <> page or existing.description <> problem then
      return jsonb_build_object('conflict', true);
    end if;
    return jsonb_build_object('created', false, 'notification', existing.notification);
  end if;
  if (select count(*) from public.gaia_error_reports where created_at > now() - interval '1 hour') >= 12 then
    return jsonb_build_object('limited', true);
  end if;
  insert into public.gaia_error_reports(id, reporter_name, report_page, description)
    values (report_id, name, page, problem);
  return jsonb_build_object('created', true, 'notification', 'pending');
end;
$$;

revoke all on function public.submit_gaia_error_report(uuid, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.submit_gaia_error_report(uuid, text, text, text) to service_role;
