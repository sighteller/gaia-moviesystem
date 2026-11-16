create table gaia_private.title_audio_assets(
 id uuid primary key,title_id uuid not null references public.titles(id) on delete restrict,
 object_path text not null unique,public_url text not null,
 mime_type text not null,byte_size integer not null check(byte_size between 32 and 2097152),
 created_at timestamptz not null default now()
);
alter table gaia_private.title_audio_assets enable row level security;
grant select,insert on gaia_private.title_audio_assets to service_role;
create function public.gaia_register_title_audio(asset_id uuid,target_title uuid,asset_path text,asset_url text,asset_mime text,asset_size integer)
returns uuid language plpgsql set search_path='' as $$
begin
 if (auth.jwt()->>'role') is distinct from 'service_role' then raise exception 'Service only' using errcode='42501';end if;
 if asset_path not like 'title-names/'||target_title::text||'/'||asset_id::text||'.%' or asset_url !~ '^https://' or asset_mime not in('audio/webm','audio/mp4','audio/ogg','audio/mpeg','audio/wav') then raise exception 'Audio non valido';end if;
 insert into gaia_private.title_audio_assets(id,title_id,object_path,public_url,mime_type,byte_size) values(asset_id,target_title,asset_path,asset_url,asset_mime,asset_size);
 return asset_id;
end;$$;
revoke all on function public.gaia_register_title_audio(uuid,uuid,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.gaia_register_title_audio(uuid,uuid,text,text,text,integer) to service_role;
create function public.gaia_save_audio_catalog(changes jsonb) returns jsonb language plpgsql set search_path='' as $$
declare c jsonb;asset gaia_private.title_audio_assets;result jsonb;
begin
 if (auth.jwt()->>'role') is distinct from 'service_role' then raise exception 'Service only' using errcode='42501';end if;
 if jsonb_typeof(changes) is distinct from 'array' or jsonb_array_length(changes)>500 then raise exception 'Elenco modifiche non valido';end if;
 result:=public.gaia_save_structured_catalog(changes);
 for c in select value from jsonb_array_elements(changes) loop
  if c->'audio_change' is null or c->'audio_change'='null'::jsonb then continue;end if;
  if jsonb_typeof(c->'audio_change')<>'object' or not(c->'audio_change' ? 'asset_id') then raise exception 'Audio non ancora caricato: riprova Salva modifiche';end if;
  select * into asset from gaia_private.title_audio_assets where id=(c->'audio_change'->>'asset_id')::uuid and title_id=(c->>'id')::uuid;
  if not found then raise exception 'Audio non valido per questo titolo';end if;
  update public.titles set audio_url=asset.public_url where id=asset.title_id;
 end loop;
 return result;
end;$$;
revoke all on function public.gaia_save_audio_catalog(jsonb) from public,anon,authenticated;
grant execute on function public.gaia_save_audio_catalog(jsonb) to service_role;
