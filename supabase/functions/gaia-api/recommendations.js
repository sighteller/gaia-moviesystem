// Intent signals only. No legacy app statistics enter this model.
export const RULES = Object.freeze({recent:40,repeats:30,history:20,seed:10,
  recentHalfLifeDays:4,repeatHalfLifeDays:7,penaltyHalfLifeDays:14,
  recentExposure:8,otherExposure:2,recentNo:4,otherNo:1,
  inspirationEvery:4,underdogEvery:20});
const DAY=86400000;
const dayFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'});
const dayKey=at=>dayFormatter.format(new Date(at));
const dayAge=(day,now)=>Math.max(0,(Date.parse(dayKey(now)+'T00:00:00Z')-Date.parse(day+'T00:00:00Z'))/DAY);
const age=(at,now)=>Math.max(0,(now-Date.parse(at))/DAY);
const decay=(days,halfLife)=>Math.pow(2,-days/halfLife);
export const titleKey=name=>String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function emptyModel(now=Date.now()){
  return {version:1,mode:'test',startedAt:new Date(now).toISOString(),totalShown:0,
    exposures:[],choices:[],previousSpecials:[],current:null};
}
export function scoreTitle(title,model,seeds=[],now=Date.now()){
  const matches=seeds.filter(s=>s.titleId? s.titleId===title.id : titleKey(s.name)===titleKey(title.name)||titleKey(s.name)===titleKey(title.canonical_title));
  const seed=matches.length===1?matches[0]:null;
  const choices=model.choices.filter(c=>c.titleId===title.id);
  const last=choices.at(-1);
  const importedDay=seed?.lastDay;
  const importedAt=importedDay?importedDay+'T12:00:00Z':null;
  const recent=Math.max(last?RULES.recent*decay(age(last.at,now),RULES.recentHalfLifeDays)*(last.changed?.25:1):0,importedAt?RULES.recent*decay(dayAge(importedDay,now),RULES.recentHalfLifeDays):0);
  const importedRepeats=(seed?.recentDays||[]).filter(d=>!choices.some(c=>dayKey(c.at)===d)).reduce((sum,d)=>sum+decay(dayAge(d,now),RULES.repeatHalfLifeDays),0);
  const repeats=importedRepeats+choices.reduce((sum,c)=>sum+(c.changed?.25:1)*decay(age(c.at,now),RULES.repeatHalfLifeDays),0);
  const repeatPoints=RULES.repeats*(1-Math.exp(-Math.max(0,repeats-1)/2));
  const history=RULES.history*Math.min(1,Math.log1p((seed?.days||0)+choices.length)/Math.log(72));
  const initial=seed?RULES.seed*Math.min(1,Math.sqrt(seed.days/71)):0;
  let penalty=0;
  for(const e of model.exposures){
    if(e.titleId!==title.id||e.chosen||e.sessionId===model.current?.id)continue;
    // A new choice renews interest: previous unused offers do not cancel it.
    if(last&&Date.parse(e.at)<=Date.parse(last.at))continue;
    if(importedDay&&dayKey(e.at)<importedDay)continue;
    penalty+=(e.cost+(e.rejected?(e.recent?RULES.recentNo:RULES.otherNo):0))*decay(age(e.at,now),RULES.penaltyHalfLifeDays);
  }
  return {titleId:title.id,score:recent+repeatPoints+history+initial-penalty,
    recent,repeatPoints,history,initial,penalty};
}
export function beginSession(model,id,titles,seeds=[],now=Date.now()){
  if(model.current?.id===id)return model.current;
  if(model.current)model.previousSpecials=model.exposures.filter(e=>e.sessionId===model.current.id&&e.kind!=='regular'&&!e.chosen).map(e=>e.titleId);
  model.current=null;
  const scores=titles.map(t=>scoreTitle(t,model,seeds,now));
  scores.sort((a,b)=>b.score-a.score||a.titleId.localeCompare(b.titleId));
  // Small catalogs still reserve candidates for rediscovery.
  const middle=Math.max(1,Math.floor(scores.length*.5));
  const bottom=Math.max(middle,Math.floor(scores.length*.8));
  model.current={id,at:new Date(now).toISOString(),scores,entries:[],
    inspirationIds:scores.slice(middle).map(s=>s.titleId),underdogIds:scores.slice(bottom).map(s=>s.titleId)};
  return model.current;
}
function specialCandidate(model,ids,available){
  const excluded=new Set([...model.previousSpecials,...model.current.entries.map(e=>e.titleId)]);
  const pool=ids.filter(id=>available.has(id)&&!excluded.has(id));
  const priorities=pool.map(id=>{
    const score=model.current.scores.find(s=>s.titleId===id)?.score||0;
    const offers=model.exposures.filter(e=>e.titleId===id);
    // Weighted fair scheduling: all titles rotate; lower scores wait longer.
    const weight=.25+.75/(1+Math.exp(-score/15));
    return {id,debt:offers.length/weight,last:offers.at(-1)?.sequence||0};
  }).sort((a,b)=>a.debt-b.debt||a.last-b.last||a.id.localeCompare(b.id));
  return priorities[0]?.id;
}
export function nextProposal(model,titles,now=Date.now(),preferredId=null){
  if(!model.current)throw new Error('Start a recommendation session first');
  const available=new Set(titles.map(t=>t.id));
  const used=new Set(model.current.entries.map(e=>e.titleId));
  const sequence=model.totalShown+1;
  let kind='regular',id;
  if(preferredId&&available.has(preferredId)&&!used.has(preferredId))id=preferredId;
  if(!id&&sequence%RULES.underdogEvery===0){
    id=specialCandidate(model,model.current.underdogIds,available);if(id)kind='underdog';
  }else if(!id&&sequence%RULES.inspirationEvery===0){
    id=specialCandidate(model,model.current.inspirationIds,available);if(id)kind='inspiration';
  }
  if(!id)id=model.current.scores.find(s=>available.has(s.titleId)&&!used.has(s.titleId)&&!model.previousSpecials.includes(s.titleId))?.titleId;
  if(!id)return null;
  const s=model.current.scores.find(s=>s.titleId===id);
  const entry={titleId:id,kind,score:s?.score||0};
  model.current.entries.push(entry);
  // A returned proposal is committed only when the app actually renders it.
  return entry;
}
export function recordExposure(model,entry,now=Date.now()){
  if(model.exposures.some(e=>e.sessionId===model.current.id&&e.titleId===entry.titleId))return false;
  const recent=(model.current.scores.find(s=>s.titleId===entry.titleId)?.recent||0)>=10;
  model.totalShown++;
  model.exposures.push({titleId:entry.titleId,sessionId:model.current.id,kind:entry.kind,
    at:new Date(now).toISOString(),sequence:model.totalShown,recent,
    cost:recent?RULES.recentExposure:RULES.otherExposure,rejected:false,chosen:false});
  return true;
}
export function recordRejection(model,titleId,rejected=true){
  const e=model.exposures.find(e=>e.sessionId===model.current?.id&&e.titleId===titleId);
  if(e)e.rejected=rejected;
}
export function recordChoice(model,title,now=Date.now()){
  const previous=model.choices.at(-1);
  const duplicate=previous?.titleId===title.id&&Date.parse(previous.expectedEndAt)>now;
  for(const e of model.exposures)if(e.sessionId===model.current?.id&&e.titleId===title.id){e.chosen=true;e.rejected=false;}
  if(duplicate)return false;
  if(previous&&Date.parse(previous.expectedEndAt)>now)previous.changed=true;
  model.choices.push({titleId:title.id,sessionId:model.current?.id,at:new Date(now).toISOString(),
    expectedEndAt:title.media_type==='movie'&&title.runtime_minutes>0?new Date(now+title.runtime_minutes*60000).toISOString():null});
  return true;
}
