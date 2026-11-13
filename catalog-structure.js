export const recordKind=t=>t.series_id?'episode':t.media_type==='series'?'series':'movie';
export function updateStructure(d,name,value){
 if(name==='record_kind'){
  d.record_kind=value;
  if(value!=='episode'){d.series_id=null;d.season_number=null;d.episode_number=null;d.episode_collection=null;}
 }else if(name==='series_id')d.series_id=value||null;
 else if(name==='season_number'||name==='episode_number')d[name]=value===''?null:Number(value);
 else if(name==='episode_collection')d.episode_collection=value;
 d.structure={kind:d.record_kind,series_id:d.series_id,season_number:d.season_number,episode_number:d.episode_number,collection_name:d.episode_collection};
}
