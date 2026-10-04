alter table public.titles
 add column series_id uuid references public.titles(id) on delete restrict,
 add column season_number integer check (season_number >= 0),
 add column episode_number integer check (episode_number > 0),
 add column season_collections jsonb not null default '[]'::jsonb,
 add constraint titles_episode_parent_valid check (series_id is null or (series_id <> id and media_type <> 'series')),
 add constraint titles_episode_numbers_have_parent check ((season_number is null and episode_number is null) or series_id is not null),
 add constraint titles_season_collections_array check (jsonb_typeof(season_collections) = 'array');
create index titles_series_episode_idx on public.titles(series_id,season_number,episode_number) where series_id is not null;
comment on column public.titles.series_id is 'Parent series for a separately identified episode. Does not merge records or viewing history.';
comment on column public.titles.season_collections is 'Known season-level Jellyfin collections. Does not imply individual episodes have been identified.';

-- Verified associations; run after the schema migration.
with identified as (
 select t.id, p.id as parent_id, regexp_match(j.data->>'name','(?:^|[[:space:]])([0-9]{1,2})x([0-9]{1,3})(?:[^0-9]|$)','i') as numbers
 from public.titles t join public.jellyfin_items j on t.external_source='jellyfin' and t.external_id=j.item_id
 join public.titles p on p.id=j.title_id and p.media_type='series' and p.id<>t.id
 where t.series_id is null
)
update public.titles t set series_id=i.parent_id,season_number=(i.numbers[1])::integer,episode_number=(i.numbers[2])::integer
 from identified i where t.id=i.id and i.numbers is not null;
with named as (
 select t.id,regexp_match(t.name,'^(.*?)[[:space:]]+([0-9]{1,2})x([0-9]{1,3})(?:[[:space:]]|$)','i') as parts
 from public.titles t where t.series_id is null and t.media_type<>'series'
), matched as (
 select n.id,p.id parent_id,(n.parts[2])::integer season_number,(n.parts[3])::integer episode_number
 from named n join public.titles p on p.media_type='series' and lower(regexp_replace(trim(p.name),'[[:space:]]+',' ','g'))=lower(regexp_replace(trim(n.parts[1]),'[[:space:]]+',' ','g'))
 where n.parts is not null
)
update public.titles t set series_id=m.parent_id,season_number=m.season_number,episode_number=m.episode_number
 from matched m where t.id=m.id;
with seasons as (
 select j.title_id,regexp_match(j.data->>'name','[[:space:]]-[[:space:]]S([0-9]{1,2})$','i') as parts,j.item_id,j.data->>'name' as name
 from public.jellyfin_items j join public.titles p on p.id=j.title_id and p.media_type='series'
 where j.present
), inventories as (
 select title_id,jsonb_agg(jsonb_build_object('season_number',(parts[1])::integer,'name',name,'jellyfin_item_id',item_id) order by (parts[1])::integer,item_id) as collections
 from seasons where parts is not null group by title_id
)
update public.titles p set season_collections=i.collections from inventories i where p.id=i.title_id;
