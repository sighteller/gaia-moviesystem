-- Active site configuration. Read/write only through the existing catalog Edge API.
create table if not exists public.gaia_camera_model (
  id text primary key check (id = 'gaia'),
  revision bigint not null check (revision > 0),
  model jsonb not null check (jsonb_typeof(model) = 'object' and octet_length(model::text) <= 65536),
  model_sha256 text not null check (model_sha256 ~ '^[a-f0-9]{64}$'),
  file_name text not null check (length(file_name) between 1 and 200),
  updated_at timestamptz not null default now(),
  previous_model jsonb
);
alter table public.gaia_camera_model enable row level security;
revoke all on table public.gaia_camera_model from public, anon, authenticated;
grant select,insert,update on table public.gaia_camera_model to service_role;

create or replace function public.gaia_replace_camera_model(
  p_model jsonb, p_sha256 text, p_file_name text, p_expected_revision bigint
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare current_model public.gaia_camera_model%rowtype;
begin
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'Expected revision is required' using errcode = '22023';
  end if;
  select * into current_model from public.gaia_camera_model where id='gaia' for update;
  if found then
    -- Retries of the same upload are idempotent, including after a lost response.
    if current_model.model_sha256=p_sha256 then
      return to_jsonb(current_model)-'previous_model'-'id';
    end if;
    if current_model.revision<>p_expected_revision then
      raise exception 'Model revision conflict' using errcode='PT409';
    end if;
    update public.gaia_camera_model set
      previous_model=jsonb_build_object('model',current_model.model,'model_sha256',current_model.model_sha256,'file_name',current_model.file_name,'revision',current_model.revision,'updated_at',current_model.updated_at),
      model=p_model,model_sha256=p_sha256,file_name=p_file_name,
      revision=current_model.revision+1,updated_at=clock_timestamp()
    where id='gaia' returning * into current_model;
  else
    if p_expected_revision<>0 then
      raise exception 'Model revision conflict' using errcode='PT409';
    end if;
    insert into public.gaia_camera_model(id,revision,model,model_sha256,file_name)
      values('gaia',1,p_model,p_sha256,p_file_name) returning * into current_model;
  end if;
  return to_jsonb(current_model)-'previous_model'-'id';
end;
$$;
revoke all on function public.gaia_replace_camera_model(jsonb,text,text,bigint) from public, anon, authenticated;
grant execute on function public.gaia_replace_camera_model(jsonb,text,text,bigint) to service_role;
notify pgrst, 'reload schema';
