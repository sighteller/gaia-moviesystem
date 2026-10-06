// Intent signals only. No legacy app statistics enter this model.
export const RULES = Object.freeze({recent:40,repeats:30,history:20,seed:10,
  recentHalfLifeDays:3,repeatHalfLifeDays:7,penaltyHalfLifeDays:14,
  recentExposure:8,otherExposure:2,recentNo:4,otherNo:1,
  inspirationEvery:4,underdogEvery:20});
const DAY=86400000;
const age=(at,now)=>Math.max(0,(now-Date.parse(at))/DAY);
const decay=(days,halfLife)=>Math.pow(2,-days/halfLife);
export const titleKey=name=>String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function emptyModel(now=Date.now()){
  return {version:1,mode:'test',startedAt:new Date(now).toISOString(),totalShown:0,
    exposures:[],choices:[],previousSpecials:[],current:null};
}
export function scoreTitle(title,model,seeds=[],now=Date.now()){
  const matches=seeds.filter(s=>titleKey(s.name)===titleKey(title.name)||titleKey(s.name)===titleKey(title.canonical_title));
  const seed=matches.length===1?matches[0]:null;
  const choices=model.choices.filter(c=>c.titleId===title.id);
  const last=choices.at(-1);
  const recent=last?RULES.recent*decay(age(last.at,now),RULES.recentHalfLifeDays)*(last.changed?.25:1):0;
  const repeats=choices.reduce((sum,c)=>sum+(c.changed?.25:1)*decay(age(c.at,now),RULES.repeatHalfLifeDays),0);
  const repeatPoints=RULES.repeats*(1-Math.exp(-Math.max(0,repeats-1)/2));
  const history=RULES.history*Math.min(1,Math.log1p((seed?.days||0)+choices.length)/Math.log(72));
  const initial=seed?RULES.seed*Math.sqrt(seed.days/71):0;
  let penalty=0;
  for(const e of model.exposures){
    if(e.titleId!==title.id||e.chosen||e.sessionId===model.current?.id)continue;
    // A new choice renews interest: previous unused offers do not cancel it.
    if(last&&Date.parse(e.at)<=Date.parse(last.at))continue;
    penalty+=(e.cost+(e.rejected?(e.recent?RULES.recentNo:RULES.otherNo):0))*decay(age(e.at,now),RULES.penaltyHalfLifeDays);
  }
  return {titleId:title.id,score:recent+repeatPoints+history+initial-penalty,
    recent,repeatPoints,history,initial,penalty};
}
export function beginSession(model,id,titles,seeds=[],now=Date.now()){
  if(model.current?.id===id)return model.current;
  if(model.current)model.previousSpecials=model.exposures.filter(e=>e.sessionId===model.current.id&&e.kind!=='regular').map(e=>e.titleId);
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
  if(!id)id=model.current.scores.find(s=>available.has(s.titleId)&&!used.has(s.titleId)&&(!model.previousSpecials.includes(s.titleId)||s.recent>=10))?.titleId;
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
  model.choices.push({titleId:title.id,at:new Date(now).toISOString(),
    expectedEndAt:title.media_type==='movie'&&title.runtime_minutes>0?new Date(now+title.runtime_minutes*60000).toISOString():null});
  return true;
}
export function proposalBadge(kind){
  if(kind==='underdog')return '<div class="recommendation-badge" role="img" aria-label="Film da riscoprire: underdog" title="Underdog"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 3h12M6 21h12M7 3v4c0 2 3 4 5 5-2 1-5 3-5 5v4M17 3v4c0 2-3 4-5 5 2 1 5 3 5 5v4M9 18h6"/></svg></div>';
  if(kind==='inspiration')return '<div class="recommendation-badge" role="img" aria-label="Scopri: film ripescato" title="Scopri"><svg viewBox="0 0 40.13 40.93" fill="currentColor" aria-hidden="true"><path d="M27.24,28.04c-.23.91-.89,1.44-1.71,1.46-.75.02-1.61-.42-1.82-1.27-1.42-5.79-5.94-10.31-11.72-11.73-.82-.2-1.26-1.05-1.25-1.77s.5-1.52,1.31-1.71c5.72-1.38,10.18-5.79,11.59-11.53C23.86.59,24.54,0,25.43,0s1.59.57,1.81,1.46c1.38,5.64,5.68,10.06,11.32,11.47.91.23,1.5.79,1.57,1.71.06.81-.44,1.67-1.34,1.89-5.67,1.43-10.1,5.76-11.55,11.5Z"/><path d="M10.9,40.11c-.14.58-.74.85-1.18.82-.55-.04-1.01-.39-1.16-.97-.95-3.74-3.82-6.64-7.57-7.61C.37,32.18,0,31.74,0,31.14c0-.65.43-1.05,1.08-1.23,3.73-.98,6.55-3.86,7.48-7.6.15-.59.57-.97,1.14-.99s1.09.33,1.24.96c.94,3.8,3.83,6.69,7.61,7.67.51.13.88.55.95,1s-.14,1.15-.7,1.28c-3.9.96-6.93,3.91-7.92,7.87Z"/></svg></div>';
  return '';
}
