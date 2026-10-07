import {beginSession,nextProposal,recordExposure,recordRejection,recordChoice,scoreTitle} from './recommendations.js';
import {buildSeriesIndex} from './series-catalog.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateRequest(action,p){
 if(!uuid.test(p.deviceId||''))throw Object.assign(new Error('Invalid device'),{status:400});
 if(action==='recommendationStart'){
  if(!uuid.test(p.requestId||'')||!['film','animation'].includes(p.category)||!Array.isArray(p.platformIds)||p.platformIds.length>20||p.platformIds.some(id=>!uuid.test(id))||(p.preferredId&&!uuid.test(p.preferredId)))throw Object.assign(new Error('Invalid start'),{status:400});
 }else if(action==='recommendationVerification'){
  return;
 }else if(action==='recommendationIdeas'){
  if(!Array.isArray(p.platformIds)||p.platformIds.length>20||p.platformIds.some(id=>!uuid.test(id)))throw Object.assign(new Error('Invalid platforms'),{status:400});
 }else{
  if(!uuid.test(p.sessionId||''))throw Object.assign(new Error('Invalid session'),{status:400});
  if(p.rejectTitleId&&!uuid.test(p.rejectTitleId))throw Object.assign(new Error('Invalid rejection'),{status:400});
  if(p.history&&(!Array.isArray(p.history)||p.history.length>1000||p.history.some(id=>!uuid.test(id))))throw Object.assign(new Error('Invalid history'),{status:400});
  if(action==='recommendationNext'&&(!Number.isInteger(p.position)||p.position<0||p.position>1000))throw Object.assign(new Error('Invalid position'),{status:400});
  if(['recommendationShown','recommendationReject','recommendationUnreject','finalize'].includes(action)&&!uuid.test(p.titleId||''))throw Object.assign(new Error('Invalid title'),{status:400});
  if(action==='finalize'&&(!uuid.test(p.platformId||'')||!['limited','unlimited'].includes(p.mode)))throw Object.assign(new Error('Invalid choice'),{status:400});
 }
}
export function createCentralHandler({rpc,catalog,now=()=>Date.now()}){
 let cachedCatalog=null,catalogAt=0,cachedSeeds=null,seedsAt=0;
 return async function central(action,p){
  validateRequest(action,p);
  if(action==='recommendationVerification'){const x=await rpc('gaia_recommendation_load',{target_device:p.deviceId,target_session:null});if(!String(x.subject).startsWith('gaia-verification-'))throw Object.assign(new Error('Unknown verification device'),{status:403});return {ok:true};}
  if(!cachedCatalog||action==='recommendationStart'||now()-catalogAt>30000){cachedCatalog=await catalog();catalogAt=now();}
  const data=cachedCatalog,index=buildSeriesIndex(data.titles);
  const rootTitles=data.titles.filter(t=>!index.parents.has(t.id));
  if(['recommendationStart','recommendationIdeas'].includes(action)&&(!cachedSeeds||now()-seedsAt>30000)){cachedSeeds=await rpc('gaia_recommendation_imported_seeds',{});seedsAt=now();}
  const seeds=cachedSeeds||[];
  const sessionId=action==='recommendationStart'?p.requestId:p.sessionId;
  for(let attempt=0;attempt<5;attempt++){
   const loaded=await rpc('gaia_recommendation_load',{target_device:p.deviceId,target_session:sessionId||null});
   const model=loaded.model;model.mode=loaded.mode;
   if(action==='recommendationIdeas'){
    const allowed=new Set(data.links.filter(l=>p.platformIds?.includes(l.platform_id)).map(l=>l.title_id));
    return {ideas:rootTitles.filter(t=>allowed.has(t.id)).map(t=>({titleId:t.id,score:scoreTitle(t,model,seeds,now()).score})).sort((a,b)=>b.score-a.score).slice(0,20).map(x=>({titleId:x.titleId})),mode:loaded.mode};
   }
   let proposal,newSession=null,choice=null,position;
   if(action==='recommendationStart'){
    if(loaded.session)return {session:loaded.session,proposal:model.current.entries[0],mode:loaded.mode};
    const prior=await rpc('gaia_recommendation_load',{target_device:p.deviceId,target_session:null});
    // The load without session supplies the most recently started session for exclusion.
    if(prior.revision!==loaded.revision)continue;
    model.current=prior.model.current;
    const allowed=new Set(data.links.filter(l=>p.platformIds.includes(l.platform_id)).map(l=>l.title_id));
    const eligible=rootTitles.filter(t=>t.category===p.category&&allowed.has(t.id));
    if(!eligible.length)return {session:null,proposal:null};
    beginSession(model,sessionId,eligible,seeds,now());
    proposal=nextProposal(model,eligible,now(),p.preferredId);
    if(!proposal)return {session:null,proposal:null};
    newSession={category:p.category,platformIds:p.platformIds};position=0;
   }else{
    if(!loaded.session||!model.current)throw Object.assign(new Error('Session not found'),{status:403});
    if(loaded.session.status!=='active'&&action!=='finalize')throw Object.assign(new Error('Session closed'),{status:409});
    const entries=model.current.entries;
    if(action==='recommendationNext'){
     if(p.rejectTitleId){
      if(!model.exposures.some(e=>e.sessionId===sessionId&&e.titleId===p.rejectTitleId))throw Object.assign(new Error('Unshown rejection'),{status:400});
      recordRejection(model,p.rejectTitleId);
     }
     if(p.position<entries.length){proposal=entries[p.position];position=p.position;}
     else {
     if(p.position!==entries.length||entries.some(e=>!model.exposures.some(x=>x.sessionId===sessionId&&x.titleId===e.titleId)))throw Object.assign(new Error('Show the previous card first'),{status:409});
     const ids=new Set(model.current.scores.map(s=>s.titleId));
     proposal=nextProposal(model,rootTitles.filter(t=>ids.has(t.id)),now());
     if(!proposal){proposal=entries[0];position=0;}else position=p.position;
     }
    }else{
     proposal=entries.find(e=>e.titleId===p.titleId);
     if(!proposal)throw Object.assign(new Error('Unplanned title'),{status:400});
     if(action==='recommendationShown'){
      recordExposure(model,proposal,now());model._shownTitleId=p.titleId;
      if(p.history){if(p.history.some(id=>!entries.some(e=>e.titleId===id)))throw Object.assign(new Error('Unplanned history'),{status:400});model._navigationHistory=p.history;}
     }else{
      if(!model.exposures.some(e=>e.sessionId===sessionId&&e.titleId===p.titleId))throw Object.assign(new Error('Title not shown'),{status:409});
      if(action==='recommendationReject'||action==='recommendationUnreject')recordRejection(model,p.titleId,action==='recommendationReject');
      else if(action==='finalize'){
       if(loaded.session.status==='completed')return {ok:true,duplicate:true};
       const title=rootTitles.find(t=>t.id===p.titleId);
       if(!title||!loaded.session.enabled_platform_ids.includes(p.platformId)||!data.links.some(l=>l.title_id===p.titleId&&l.platform_id===p.platformId))throw Object.assign(new Error('Unavailable platform'),{status:400});
       const clicked=Date.parse(p.clickedAt);const at=Number.isFinite(clicked)&&Math.abs(clicked-now())<300000?clicked:now();const isNew=recordChoice(model,title,at);
       choice={titleId:p.titleId,platformId:p.platformId,mode:p.mode,at:new Date(at).toISOString(),isNew};
      }else throw Object.assign(new Error('Unknown action'),{status:400});
     }
    }
   }
   const saved=await rpc('gaia_recommendation_commit',{target_device:p.deviceId,target_session:sessionId,expected_epoch:loaded.epoch,expected_revision:loaded.revision,updated_model:model,new_session:newSession,choice});
   if(saved.conflict)continue;
   return {ok:true,proposal,position,mode:loaded.mode,session:action==='recommendationStart'?{id:sessionId,category:p.category,enabled_platform_ids:p.platformIds,current_title_id:proposal.titleId}:undefined};
  }
  throw Object.assign(new Error('Please retry: another update is in progress'),{status:409});
 };
}
