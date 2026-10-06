"""Normalize an existing Google Sheets snapshot; no catalog lookups or uploads."""
import argparse,hashlib,json,re
from collections import Counter
from datetime import datetime
from pathlib import Path

def duration_seconds(value,allow_placeholder=False):
    if value in ('',None) or (allow_placeholder and value=='Not latest view'):return None
    m=re.fullmatch(r'(\d+):([0-5]\d):([0-5]\d)',str(value))
    if not m:raise ValueError('Invalid Netflix duration: '+str(value))
    h,m,s=map(int,m.groups());return h*3600+m*60+s

def normalize(snapshot):
    original=snapshot['original'];organized=snapshot['organized']
    if original[0][:10]!=['Duration','Start Time','Bookmark','Latest Bookmark','Profile Name','Country','Supplemental Video Type','Attributes','Device Type','Title']:
        raise ValueError('Unexpected original headers')
    if organized[0][:8]!=['Riga CSV','Profilo','Inizio originale','Data originale','Titolo','Film o serie','Tipo stimato','Secondi guardati']:
        raise ValueError('Unexpected organized headers')
    events={};selected=excluded=kept=duplicates=0;used_rows=set()
    for r in organized[1:]:
        if not r:continue
        row_id=int(r[0]);o=list(original[row_id-1])+['']*10;o=o[:10]
        if row_id in used_rows:raise ValueError('Duplicate original row reference')
        used_rows.add(row_id)
        if (r[1],r[2],r[4])!=(o[4],o[1],o[9]):raise ValueError('Original/organized mismatch at '+str(row_id))
        if o[4].strip().casefold()!='gaia':continue
        selected+=1
        if re.search(r'harry[\s._-]*potter',o[9],re.I):excluded+=1;continue
        kept+=1
        datetime.strptime(o[1],'%Y-%m-%d %H:%M:%S')
        duration=duration_seconds(o[0]);bookmark=duration_seconds(o[2],True);latest=duration_seconds(o[3],True)
        if duration is not None and int(r[7])!=duration:raise ValueError('Duration mismatch at '+str(row_id))
        kind={'Film / titolo autonomo':'movie','Episodio':'episode','Anteprima / extra':'other'}.get(r[6])
        if kind is None:raise ValueError('Unknown classification '+r[6])
        flags=[]
        if o[6].strip() or kind=='other':kind='other';flags.append('supplemental_video')
        if duration is None:flags.append('missing_duration')
        elif duration==0:flags.append('zero_duration')
        # Stable across repeated exports: row number, duration and bookmarks may change.
        identity=[o[4].strip().casefold(),o[1],o[9],o[8],o[6]]
        key=hashlib.sha256(json.dumps(identity,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
        event={'source':'netflix','event_key':key,'subject':'gaia','source_user_id':o[4],
            'source_item_id':None,'source_timestamp':o[1],'occurred_local_at':o[1],'time_zone':None,
            'content_kind':kind,'title_id':None,'source_title':o[9],'duration_seconds':duration,
            'match_status':'unmatched','quality_flags':flags,
            'raw_fields':{'original':dict(zip(original[0][:10],o)),'derived':{'group_title':r[5],
                'estimated_kind':r[6],'bookmark_seconds':bookmark,'latest_bookmark_seconds':latest,
                'original_csv_row':row_id}}}
        if key in events:
            duplicates+=1
            if (duration or 0)<=(events[key]['duration_seconds'] or 0):continue
        events[key]=event
    if len(used_rows)!=len(original)-1:raise ValueError('Incomplete organized sheet')
    return {'events':list(events.values()),'report':{'original_events':len(original)-1,'profile':'GAIA',
        'profile_rows':selected,'harry_potter_excluded':excluded,'retained_rows':kept,
        'unique_events':len(events),'duplicate_events':duplicates,'types':dict(Counter(e['content_kind'] for e in events.values())),
        'first_source_time':min(e['source_timestamp'] for e in events.values()),
        'last_source_time':max(e['source_timestamp'] for e in events.values())}}

def json_literal(value):
    text=json.dumps(value,ensure_ascii=False,separators=(',',':'));tag='$gaia_netflix$'
    while tag in text:tag=tag[:-1]+'x$'
    return tag+text+tag+'::jsonb'

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('snapshot',type=Path);p.add_argument('output',type=Path);a=p.parse_args()
    snapshot=json.loads(a.snapshot.read_text());result=normalize(snapshot)
    filehash=hashlib.sha256(a.snapshot.read_bytes()).hexdigest()
    info={'file_sha256':filehash,'source':'netflix','filename':'Google Sheets: Netflix - Gaia / Originale','row_count':result['report']['retained_rows']}
    a.output.mkdir(parents=True,exist_ok=True)
    (a.output/'normalized.json').write_text(json.dumps({**info,**result},ensure_ascii=False,indent=2))
    (a.output/'summary.json').write_text(json.dumps(result['report'],ensure_ascii=False,indent=2))
    sql_template="""with incoming as (select * from jsonb_to_recordset(%s) as e(event_key text,source text,subject text,source_user_id text,source_item_id text,source_timestamp text,occurred_local_at timestamp,time_zone text,content_kind text,title_id uuid,source_title text,duration_seconds integer,match_status text,quality_flags jsonb,raw_fields jsonb)), saved as (
insert into gaia_private.imported_playback_events(source,event_key,subject,first_import_sha256,source_user_id,source_item_id,source_timestamp,occurred_local_at,time_zone,content_kind,title_id,source_title,duration_seconds,match_status,quality_flags,raw_fields)
select source,event_key,subject,'%s',source_user_id,source_item_id,source_timestamp,occurred_local_at,time_zone,content_kind,title_id,source_title,duration_seconds,match_status,quality_flags,raw_fields from incoming
on conflict(source,event_key) do update set
 duration_seconds=greatest(gaia_private.imported_playback_events.duration_seconds,excluded.duration_seconds),
 quality_flags=case when coalesce(excluded.duration_seconds,0)>=coalesce(gaia_private.imported_playback_events.duration_seconds,0) then excluded.quality_flags else gaia_private.imported_playback_events.quality_flags end,
 raw_fields=case when coalesce(excluded.duration_seconds,0)>=coalesce(gaia_private.imported_playback_events.duration_seconds,0) then excluded.raw_fields else gaia_private.imported_playback_events.raw_fields end
returning event_key)
select count(*) as verified_batch_rows from saved;
"""
    registry="insert into gaia_private.playback_history_imports(file_sha256,source,filename,row_count) select d->>'file_sha256',d->>'source',d->>'filename',(d->>'row_count')::integer from (select "+json_literal(info)+" as d) x on conflict(file_sha256) do nothing;\n"
    for i,start in enumerate(range(0,len(result['events']),200),1):
        events=result['events'][start:start+200]
        (a.output/f'batch-{i:03d}.sql').write_text('begin;\n'+registry+sql_template%(json_literal(events),filehash)+'commit;\n')
    print(json.dumps({**result['report'],'batches':i},ensure_ascii=False))
