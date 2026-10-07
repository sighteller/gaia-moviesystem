import test from 'node:test';import assert from 'node:assert/strict';
import {createCentralHandler} from '../supabase/functions/gaia-api/central.js';
import {emptyModel,scoreTitle} from '../supabase/functions/gaia-api/recommendations.js';
import {proposalBadge} from '../recommendation-badges.js';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
function harness(){
 const titles=Array.from({length:100},(_,i)=>({id:id(i+1),name:'A film '+i,category:'animation',media_type:'movie',runtime_minutes:90}));
 const data={titles,links:titles.map(t=>({title_id:t.id,platform_id:id(999)}))};
 const state={epoch:id(888),revision:0,model:emptyModel(),last:null,sessions:new Map(),choices:[],conflict:false};
 let time=Date.parse('2026-10-07T10:00:00Z');
 const rpc=async(name,p)=>{
  if(name==='gaia_recommendation_imported_seeds')return [{titleId:id(100),days:10,lastDay:'2026-10-06',recentDays:['2026-10-05','2026-10-06']}];
  if(name==='gaia_recommendation_load'){
   const row=state.sessions.get(p.target_session||state.last),owned=row?.device_id===p.target_device;
   return {epoch:state.epoch,revision:state.revision,mode:'test',model:{...structuredClone(state.model),current:(!p.target_session||owned)?structuredClone(row?.model||null):null},session:p.target_session&&owned?structuredClone(row.session):null};
  }
  if(name==='gaia_recommendation_commit'){
   if(state.conflict){state.conflict=false;state.revision++;return {conflict:true};}
   if(p.expected_revision!==state.revision)return {conflict:true};
   const model=structuredClone(p.updated_model),cur=model.current;delete model.current;delete model._shownTitleId;delete model._navigationHistory;
   state.model=model;state.revision++;
   if(p.new_session){state.last=p.target_session;state.sessions.set(p.target_session,{device_id:p.target_device,model:cur,session:{id:p.target_session,device_id:p.target_device,status:'active',category:p.new_session.category,enabled_platform_ids:p.new_session.platformIds}});}
   else state.sessions.get(p.target_session).model=cur;
   if(p.choice){state.sessions.get(p.target_session).session.status='completed';if(p.choice.isNew)state.choices.push(p.choice);}
   return {ok:true};
  }
  throw new Error('Unknown RPC '+name);
 };
 const central=createCentralHandler({rpc,catalog:async()=>data,now:()=>time});
 const start=async(session,device=id(777))=>central('recommendationStart',{deviceId:device,requestId:id(session),category:'animation',platformIds:[id(999)]});
 const shown=async(session,titleId,device=id(777))=>central('recommendationShown',{deviceId:device,sessionId:id(session),titleId});
 const next=async(session,position,rejectTitleId=null,device=id(777))=>central('recommendationNext',{deviceId:device,sessionId:id(session),position,rejectTitleId});
 return {central,start,shown,next,state,data};
}
test('central history determines first proposal and actual display counts once',async()=>{
 const h=harness(),r=await h.start(1001);assert.equal(r.proposal.titleId,id(100));assert.equal(h.state.model.totalShown,0);
 await h.shown(1001,r.proposal.titleId);await h.shown(1001,r.proposal.titleId);assert.equal(h.state.model.totalShown,1);
});
test('twentieth memory counter is shared across devices and consecutive rediscoveries do not repeat',async()=>{
 const h=harness();let r=await h.start(1001),first=[];
 for(let p=0;p<13;p++){if(p)r=await h.next(1001,p);await h.shown(1001,r.proposal.titleId);if(r.proposal.kind!=='regular')first.push(r.proposal.titleId);}
 r=await h.start(1002,id(778));
 for(let p=0;p<7;p++){if(p)r=await h.next(1002,p,null,id(778));await h.shown(1002,r.proposal.titleId,id(778));assert.ok(!first.includes(r.proposal.titleId));}
 assert.equal(h.state.model.totalShown,20);assert.equal(r.proposal.kind,'underdog');
});
test('choosing previously rejected title cancels its exposure penalty',async()=>{
 const h=harness(),r=await h.start(1001);await h.shown(1001,r.proposal.titleId);await h.next(1001,1,r.proposal.titleId);
 assert.equal(h.state.model.exposures[0].rejected,true);
 await h.central('finalize',{central:true,deviceId:id(777),sessionId:id(1001),titleId:r.proposal.titleId,platformId:id(999),mode:'unlimited'});
 assert.equal(h.state.model.exposures[0].chosen,true);assert.equal(h.state.model.exposures[0].rejected,false);
});
test('same film before expected end and double finalize stay one choice',async()=>{
 const h=harness(),r=await h.start(1001);await h.shown(1001,r.proposal.titleId);
 const p={central:true,deviceId:id(777),sessionId:id(1001),titleId:r.proposal.titleId,platformId:id(999),mode:'unlimited'};
 await h.central('finalize',p);await h.central('finalize',p);assert.equal(h.state.choices.length,1);
 const second=await h.start(1002);await h.shown(1002,second.proposal.titleId);await h.central('finalize',{...p,sessionId:id(1002)});
 assert.equal(h.state.model.choices.length,1);assert.equal(h.state.choices.length,1);
});
test('stale writes retry safely and foreign sessions cannot write',async()=>{
 const h=harness(),r=await h.start(1001);h.state.conflict=true;await h.shown(1001,r.proposal.titleId);assert.equal(h.state.model.totalShown,1);
 await assert.rejects(()=>h.shown(1001,r.proposal.titleId,id(778)),/Session not found/);
 await assert.rejects(()=>h.next(1001,3),/Show the previous card/);
});
test('Rome day recency and bounded initial bonuses',()=>{
 const s=scoreTitle({id:id(1)},emptyModel(),[{titleId:id(1),days:10000,lastDay:'2026-10-06',recentDays:[]}],Date.parse('2026-10-06T22:30:00Z'));
 assert.equal(s.initial,10);assert.ok(s.recent<40&&s.recent>30);
});
test('badge text and supplied rewind path match references',()=>{
 assert.match(proposalBadge('inspiration'),/>Scopri</);assert.match(proposalBadge('underdog'),/>Ricordo</);
 assert.match(proposalBadge('underdog'),/19.81 19.97/);assert.equal(proposalBadge('regular'),'');
});
