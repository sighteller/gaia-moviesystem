create or replace function gaia_private.algorithm_ranking(m jsonb,seeds jsonb,titles jsonb,at_time timestamptz)
returns jsonb language sql stable set search_path='' as $$
with scored as (
 select t->>'id' as id,
 greatest(case when last_c.c is not null then coalesce(40*power(2,-greatest(0,extract(epoch from(at_time-(last_c.c->>'at')::timestamptz))/86400)/4)*case when coalesce((last_c.c->>'changed')::boolean,false) then .25 else 1 end,0) else 0 end,
 case when seed.s->>'lastDay' is not null then coalesce(40*power(2,-greatest(0,(at_time at time zone 'Europe/Rome')::date-(seed.s->>'lastDay')::date)::double precision/4),0) else 0 end) as recent,
 30*(1-exp(-greatest(0,coalesce(reps.n,0)+coalesce(imp.n,0)-1)/2)) as repeat_points,
 20*least(1,ln(1+coalesce((seed.s->>'days')::double precision,0)+coalesce(reps.cnt,0))/ln(72)) as history,
 case when seed.s is not null then 10*least(1,sqrt((seed.s->>'days')::double precision/71)) else 0 end as initial,
 coalesce(pen.n,0) as penalty
 from jsonb_array_elements(titles) as ts(t)
 left join lateral(select s from jsonb_array_elements(seeds) as ss(s) where s->>'titleId'=t->>'id') seed on true
 left join lateral(select c from jsonb_array_elements(coalesce(m->'choices','[]')) with ordinality x(c,ord) where c->>'titleId'=t->>'id' order by ord desc limit 1) last_c on true
 left join lateral(select count(*)::double precision as cnt,sum(case when coalesce((c->>'changed')::boolean,false) then .25 else 1 end *power(2,-greatest(0,extract(epoch from(at_time-(c->>'at')::timestamptz))/86400)/7)) as n from jsonb_array_elements(coalesce(m->'choices','[]')) as cs(c) where c->>'titleId'=t->>'id') reps on true
 left join lateral(select sum(power(2,-greatest(0,(at_time at time zone 'Europe/Rome')::date-d::date)::double precision/7)) as n from jsonb_array_elements_text(coalesce(seed.s->'recentDays','[]')) as ds(d) where not exists(select 1 from jsonb_array_elements(coalesce(m->'choices','[]')) as cs(c) where c->>'titleId'=t->>'id' and ((c->>'at')::timestamptz at time zone 'Europe/Rome')::date=d::date)) imp on true
 left join lateral(select sum(((e->>'cost')::double precision+case when coalesce((e->>'rejected')::boolean,false) then case when coalesce((e->>'recent')::boolean,false) then 4 else 1 end else 0 end)*power(2,-greatest(0,extract(epoch from(at_time-(e->>'at')::timestamptz))/86400)/14)) as n from jsonb_array_elements(coalesce(m->'exposures','[]')) as es(e) where e->>'titleId'=t->>'id' and not coalesce((e->>'chosen')::boolean,false) and (last_c.c is null or (e->>'at')::timestamptz>(last_c.c->>'at')::timestamptz) and (seed.s->>'lastDay' is null or ((e->>'at')::timestamptz at time zone 'Europe/Rome')::date >= (seed.s->>'lastDay')::date)) pen on true
),ranked as(select *,recent+repeat_points+history+initial-penalty as score from scored),
positions as(select *,row_number() over(order by score desc,id) as position from ranked)
select coalesce(jsonb_agg(jsonb_build_object('titleId',id,'rank',position,'score',score,'recent',recent,'repeatPoints',repeat_points,'history',history,'initial',initial,'penalty',penalty) order by position),'[]'::jsonb) from positions;
$$;
revoke all on function gaia_private.algorithm_ranking(jsonb,jsonb,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function gaia_private.algorithm_ranking(jsonb,jsonb,jsonb,timestamptz) to service_role;
create or replace function gaia_private.ranking_imported_days() returns table(title_id uuid,day date) language sql stable set search_path='' as $$
with names as materialized (
 select id,media_type,lower(regexp_replace(extensions.unaccent(name),'[^[:alnum:]]','','g')) as key from public.titles where active and series_id is null and media_type in ('movie','series')
 union
 select id,media_type,lower(regexp_replace(extensions.unaccent(canonical_title),'[^[:alnum:]]','','g')) as key from public.titles where active and series_id is null and media_type in ('movie','series') and canonical_title is not null
),aliases as materialized (
 select key,media_type,(array_agg(distinct id))[1] as id from names where key<>'' group by key,media_type having count(distinct id)=1
),eligible as materialized (
 select h.*,case when content_kind='episode' then 'series' else 'movie' end as target_type,
 lower(regexp_replace(extensions.unaccent(coalesce(h.raw_fields->'derived'->>'group_title',h.source_title)),'[^[:alnum:]]','','g')) as title_key
 from gaia_private.imported_playback_events h where subject='gaia' and content_kind in ('movie','episode') and (match_status<>'ambiguous' or exists(select 1 from gaia_private.imported_event_title_attributions a where a.event_id=h.id)) and quality_flags='[]'::jsonb
 and ((source<>'disney' and duration_seconds>0) or (source='disney' and raw_fields->'derived'->>'preference_day_eligible'='true'))
),matched as (
 select h.*,coalesce(t.series_id,t.id,a.id) as matched_id from eligible h
 left join gaia_private.imported_event_title_attributions attribution on attribution.event_id=h.id
 left join public.titles t on t.id=coalesce(attribution.title_id,h.title_id) and (t.media_type=h.target_type or (h.target_type='series' and t.series_id is not null))
 left join aliases a on coalesce(attribution.title_id,h.title_id) is null and a.key=h.title_key and a.media_type=h.target_type
),daily as (
 select matched_id,occurred_local_at::date as day from matched where matched_id is not null
 group by matched_id,occurred_local_at::date
 having bool_or(source='disney') or sum(case when source<>'disney' then duration_seconds else 0 end)>=600
)
select matched_id,day from daily;
$$;
revoke all on function gaia_private.ranking_imported_days() from public,anon,authenticated;
grant execute on function gaia_private.ranking_imported_days() to service_role;

create table gaia_private.ranking_snapshots(
 epoch uuid not null references gaia_private.recommendation_epochs(id) on delete restrict,
 day date not null, captured_at timestamptz not null default now(),
 model_version integer not null default 2,
 rankings jsonb not null check(jsonb_typeof(rankings)='array'),
 primary key(epoch,day,model_version)
);
alter table gaia_private.ranking_snapshots enable row level security;
grant select,insert on gaia_private.ranking_snapshots to service_role;

create or replace function gaia_private.ranking_titles() returns jsonb language sql stable set search_path='' as $$
select coalesce(jsonb_agg(jsonb_build_object('id',t.id) order by t.id),'[]'::jsonb) from public.titles t
where t.active and t.series_id is null and exists(select 1 from public.title_platforms l join public.platforms p on p.id=l.platform_id where l.title_id=t.id and l.active and p.active and p.slug in('jellyfin','netflix','disney-plus','prime-video','rai-play'));
$$;
revoke all on function gaia_private.ranking_titles() from public,anon,authenticated;
grant execute on function gaia_private.ranking_titles() to service_role;

create or replace function gaia_private.capture_ranking_snapshot() returns void language plpgsql set search_path='' as $$
declare e gaia_private.recommendation_epochs; today date:=(now() at time zone 'Europe/Rome')::date;
begin
select x.* into strict e from gaia_private.recommendation_epochs x join gaia_private.recommendation_profiles p on p.active_epoch=x.id where p.subject='gaia';
if exists(select 1 from gaia_private.ranking_snapshots where epoch=e.id and day=today and model_version=2) then return;end if;
insert into gaia_private.ranking_snapshots(epoch,day,model_version,rankings)
values(e.id,today,2,gaia_private.algorithm_ranking(e.model,public.gaia_recommendation_imported_seeds(),gaia_private.ranking_titles(),now()))
on conflict do nothing;
end;$$;
revoke all on function gaia_private.capture_ranking_snapshot() from public,anon,authenticated;
grant execute on function gaia_private.capture_ranking_snapshot() to service_role;

create or replace function public.gaia_ranking_stats() returns jsonb language plpgsql set search_path='' as $$
declare e gaia_private.recommendation_epochs; rows jsonb; favorites jsonb; previous jsonb; previous_at timestamptz; today date:=(now() at time zone 'Europe/Rome')::date;
begin
if (auth.jwt()->>'role') is distinct from 'service_role' then raise exception 'Service only' using errcode='42501';end if;
select x.* into strict e from gaia_private.recommendation_epochs x join gaia_private.recommendation_profiles p on p.active_epoch=x.id where p.subject='gaia';
perform gaia_private.capture_ranking_snapshot();
rows:=gaia_private.algorithm_ranking(e.model,public.gaia_recommendation_imported_seeds(),gaia_private.ranking_titles(),now());
select rankings,captured_at into previous,previous_at from gaia_private.ranking_snapshots where epoch=e.id and day=today-1 and model_version=2;
with imported as(select * from gaia_private.ranking_imported_days()),
choices as(
 select coalesce(t.series_id,t.id) as title_id,s.selected_at, (s.selected_at at time zone 'Europe/Rome')::date as day
 from public.selections s join public.titles t on t.id=s.title_id
 where not exists(select 1 from gaia_private.recommendation_devices d where d.device_id=s.device_id and d.subject<>'gaia')
), events as(
 select title_id,day,1 as chosen,0 as imported from choices
 union all select i.title_id,i.day,0,1 from imported i where not exists(select 1 from choices c where c.title_id=i.title_id and c.day=i.day)
), windows as(select unnest(array['week','month','all']) as period),
counts as(
 select w.period,v.title_id,sum(v.chosen) as chosen,sum(v.imported) as imported,sum(v.chosen+v.imported) as total
 from windows w cross join events v join public.titles t on t.id=v.title_id
 where t.active and t.series_id is null and (w.period='all' or v.day>=today-case when w.period='week' then 6 else 29 end)
 group by w.period,v.title_id
), ranked as(select *,row_number() over(partition by period order by total desc,title_id) as position from counts)
select coalesce(jsonb_agg(jsonb_build_object('period',period,'titleId',title_id,'rank',position,'count',total,'choices',chosen,'importedDays',imported) order by period,position),'[]'::jsonb) into favorites from ranked where position<=30;
return jsonb_build_object('calculatedAt',now(),'mode',e.mode,'algorithm',rows,'previous',previous,'previousAt',previous_at,'favorites',favorites,'day',today);
end;$$;
revoke all on function public.gaia_ranking_stats() from public,anon,authenticated;
grant execute on function public.gaia_ranking_stats() to service_role;
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('gaia-daily-ranking-snapshot','5 * * * *',$job$do $body$begin if extract(hour from now() at time zone 'Europe/Rome')=0 then perform gaia_private.capture_ranking_snapshot();end if;end $body$;$job$);
select gaia_private.capture_ranking_snapshot();
