"""Read-only TSV normalization. Produces private artifacts; never uploads by itself."""
import argparse,csv,hashlib,json,re
from collections import Counter,defaultdict
from datetime import datetime
from pathlib import Path

def item_key(value):
    value=value.replace('-','').lower()
    if not re.fullmatch(r'[0-9a-f]{1,32}',value):
        raise ValueError('Invalid Jellyfin identifier')
    return value.zfill(32)

def normalize(tsv,catalog):
    raw=tsv.read_bytes()
    by_id={}
    for item in catalog:
        key=item_key(item['item_id'])
        if key in by_id and by_id[key]['title_id']!=item['title_id']:
            raise ValueError('Ambiguous catalog identifier')
        by_id[key]=item
    events={}
    with tsv.open(encoding='utf-8-sig',newline='') as stream:
        for line_no,row in enumerate(csv.reader(stream,delimiter='\t'),1):
            if len(row)!=9:raise ValueError(f'Row {line_no}: expected 9 columns')
            timestamp,user,item,kind,title,method,client,device,duration=row
            if not re.fullmatch(r'\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,7})?',timestamp):raise ValueError(f'Row {line_no}: invalid date')
            datetime.fromisoformat(timestamp)
            seconds=int(duration)
            if seconds<0:raise ValueError(f'Row {line_no}: negative duration')
            user=item_key(user);item=item_key(item)
            fraction=(timestamp.partition('.')[2]+'0000000')[:7]
            identity=timestamp[:19]+'.'+fraction
            key=hashlib.sha256(json.dumps([identity,user,item],separators=(',',':')).encode()).hexdigest()
            match=by_id.get(item)
            flags=[]
            if seconds==0:flags.append('zero_duration')
            runtime=match.get('runtime_minutes') if match else None
            if kind=='Movie' and runtime and seconds>runtime*60*2:flags.append('duration_over_twice_runtime')
            event={'event_key':key,'source':'jellyfin','subject':'gaia','source_user_id':user,'source_item_id':item,
                'source_timestamp':timestamp,'occurred_local_at':identity[:26],
                'time_zone':None,'content_kind':{'Movie':'movie','Episode':'episode','MusicVideo':'musicvideo'}.get(kind,'other'),
                'title_id':match['title_id'] if match else None,'source_title':title,'duration_seconds':seconds,
                'match_status':'mapped' if match and match['title_id'] else 'unmatched',
                'quality_flags':flags,'raw_fields':row}
            # A later snapshot can extend the duration of an already known session.
            if key not in events or seconds>events[key]['duration_seconds']:events[key]=event
    return {'file_sha256':hashlib.sha256(raw).hexdigest(),'filename':tsv.name,'source':'jellyfin',
        'row_count':line_no,'events':list(events.values())}

def summary(batch,catalog):
    names={x['title_id']:x['catalog_title'] for x in catalog}
    totals=defaultdict(lambda:{'events':0,'seconds':0,'qualified_days':set(),'last':''})
    daily=defaultdict(int)
    for e in batch['events']:
        if e['content_kind']!='movie' or e['match_status']!='mapped' or e['quality_flags']:continue
        day=e['source_timestamp'][:10]
        x=totals[e['title_id']];x['events']+=1;x['seconds']+=e['duration_seconds'];x['last']=max(x['last'],e['source_timestamp'])
        daily[(e['title_id'],day)]+=e['duration_seconds']
    for (tid,day),seconds in daily.items():
        if seconds>=600:totals[tid]['qualified_days'].add(day)
    ranked=[{'title_id':tid,'title':names[tid],'events':x['events'],'seconds':x['seconds'],
        'days_at_least_10_minutes':len(x['qualified_days']),'last_source_time':x['last']} for tid,x in totals.items()]
    ranked.sort(key=lambda x:(-x['days_at_least_10_minutes'],-x['seconds'],x['title']))
    return {'rows':batch['row_count'],'unique_events':len(batch['events']),
        'types':dict(Counter(e['content_kind'] for e in batch['events'])),
        'mapped_movie_events':sum(e['content_kind']=='movie' and e['match_status']=='mapped' for e in batch['events']),
        'flagged_events':[{'title':e['source_title'],'seconds':e['duration_seconds'],'flags':e['quality_flags']} for e in batch['events'] if e['quality_flags']],
        'first_source_time':min(e['source_timestamp'] for e in batch['events']),
        'last_source_time':max(e['source_timestamp'] for e in batch['events']),
        'ranking':ranked}

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('tsv',type=Path);parser.add_argument('catalog',type=Path);parser.add_argument('output',type=Path)
    args=parser.parse_args();catalog=json.loads(args.catalog.read_text());batch=normalize(args.tsv,catalog)
    args.output.mkdir(parents=True,exist_ok=True)
    (args.output/'normalized.json').write_text(json.dumps(batch,ensure_ascii=False,indent=2))
    report=summary(batch,catalog);(args.output/'summary.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    # Dollar-quoted JSON is data. A delimiter cannot occur inside the payload.
    def literal(value):
        text=json.dumps(value,ensure_ascii=False,separators=(',',':'));tag='$gaia_import$'
        while tag in text:tag=tag[:-1]+'x$'
        return tag+text+tag+'::jsonb'
    for offset in range(0,len(batch['events']),30):
        events=batch['events'][offset:offset+30]
        sql="""begin;
insert into gaia_private.playback_history_imports(file_sha256,source,filename,row_count)
select data->>'file_sha256',data->>'source',data->>'filename',(data->>'row_count')::integer from (select %s as data) x
on conflict(file_sha256) do nothing;
with incoming as (select * from jsonb_to_recordset(%s) as e(event_key text,source text,subject text,source_user_id text,source_item_id text,source_timestamp text,occurred_local_at timestamp,time_zone text,content_kind text,title_id uuid,source_title text,duration_seconds integer,match_status text,quality_flags jsonb,raw_fields jsonb)), saved as (
insert into gaia_private.imported_playback_events(source,event_key,subject,first_import_sha256,source_user_id,source_item_id,source_timestamp,occurred_local_at,time_zone,content_kind,title_id,source_title,duration_seconds,match_status,quality_flags,raw_fields)
select source,event_key,subject,'%s',source_user_id,source_item_id,source_timestamp,occurred_local_at,time_zone,content_kind,title_id,source_title,duration_seconds,match_status,quality_flags,raw_fields from incoming
on conflict(source,event_key) do update set
 duration_seconds=greatest(gaia_private.imported_playback_events.duration_seconds,excluded.duration_seconds),
 title_id=coalesce(gaia_private.imported_playback_events.title_id,excluded.title_id),
 match_status=case when gaia_private.imported_playback_events.title_id is not null or excluded.title_id is not null then 'mapped' else excluded.match_status end,
 quality_flags=case when excluded.duration_seconds>=gaia_private.imported_playback_events.duration_seconds then excluded.quality_flags else gaia_private.imported_playback_events.quality_flags end,
 raw_fields=case when excluded.duration_seconds>=gaia_private.imported_playback_events.duration_seconds then excluded.raw_fields else gaia_private.imported_playback_events.raw_fields end
returning event_key)
select count(*) as verified_batch_rows from saved;
commit;
"""%(literal({k:v for k,v in batch.items() if k!='events'}),literal(events),batch['file_sha256'])
        (args.output/f'batch-{offset//30+1}.sql').write_text(sql)
    print(json.dumps({k:v for k,v in report.items() if k!='ranking'},ensure_ascii=False))
    print(json.dumps(report['ranking'][:8],ensure_ascii=False))
