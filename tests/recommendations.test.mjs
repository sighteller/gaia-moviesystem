import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyModel,beginSession,nextProposal,recordExposure,recordRejection,recordChoice,scoreTitle,proposalBadge,RULES} from '../recommendations.js';
import {loadModel,saveModel,validateModel,MODEL_KEY} from '../recommendation-store.js';
import {preferenceSeed} from '../preference-seed.js';
const now=Date.parse('2026-10-06T12:00:00Z'),day=86400000;
const catalog=Array.from({length:100},(_,i)=>({id:String(i).padStart(3,'0'),name:'Film '+i,media_type:'movie',runtime_minutes:90}));
function show(m,titles=catalog,at=now){const e=nextProposal(m,titles,at);if(e)recordExposure(m,e,at);return e;}
test('historical source excludes all Harry Potter and does not create recent activity',()=>{
 assert.equal(preferenceSeed.length,49);assert.ok(preferenceSeed.every(s=>!/harry potter/i.test(s.name)));
 const m=emptyModel(now),s=scoreTitle({id:'a',name:'I Mitchell contro le macchine'},m,preferenceSeed,now);
 assert.equal(s.recent,0);assert.equal(s.history,20);assert.equal(s.initial,10);
});
test('prepared cards and backwards/re-rendering never consume exposures',()=>{
 const m=emptyModel(now);beginSession(m,'a',catalog,[],now);
 const e=nextProposal(m,catalog,now);assert.equal(m.totalShown,0);
 assert.equal(recordExposure(m,e,now),true);assert.equal(recordExposure(m,e,now),false);assert.equal(m.totalShown,1);
});
test('the twentieth actual distinct card is an underdog, even across sessions',()=>{
 const m=emptyModel(now);beginSession(m,'a',catalog,[],now);
 for(let i=0;i<13;i++)show(m);
 beginSession(m,'b',catalog,[],now);
 const entries=Array.from({length:7},()=>show(m));
 assert.equal(m.totalShown,20);assert.equal(entries.at(-1).kind,'underdog');
 assert.ok(m.current.underdogIds.includes(entries.at(-1).titleId));
});
test('consecutive sessions never repeat displayed rediscovery candidates, including as regulars',()=>{
 const m=emptyModel(now);beginSession(m,'a',catalog,[],now);
 const first=Array.from({length:20},()=>show(m)).filter(e=>e.kind!=='regular').map(e=>e.titleId);
 beginSession(m,'b',catalog,[],now);
 const second=Array.from({length:20},()=>show(m));
 assert.ok(second.every(e=>!first.includes(e.titleId)));
});
test('recent unchosen offers cost four times as much; explicit No adds a separate cost',()=>{
 const m=emptyModel(now);recordChoice(m,catalog[0],now-2*3600000);
 beginSession(m,'a',catalog,[],now);const e=show(m);assert.equal(e.titleId,'000');recordRejection(m,e.titleId);
 const old=nextProposal(m,catalog,now,'099');recordExposure(m,old,now);
 assert.equal(m.exposures[0].cost,8);assert.equal(m.exposures[1].cost,2);
 const before=scoreTitle(catalog[0],m,[],now).score;beginSession(m,'b',catalog,[],now);
 assert.equal(scoreTitle(catalog[0],m,[],now).penalty,12);assert.equal(before-scoreTitle(catalog[0],m,[],now).score,12);
});
test('choosing the offered film removes its unchosen offer penalty and renews interest',()=>{
 const m=emptyModel(now);beginSession(m,'a',catalog,[],now);const e=show(m);recordRejection(m,e.titleId);
 recordChoice(m,catalog[0],now);beginSession(m,'b',catalog,[],now+1000);
 assert.equal(scoreTitle(catalog[0],m,[],now+1000).penalty,0);assert.ok(scoreTitle(catalog[0],m,[],now+1000).recent>39);
});
test('same film inside expected duration is one choice; a repeat afterwards is positive and bounded',()=>{
 const m=emptyModel(now);assert.equal(recordChoice(m,catalog[0],now),true);
 assert.equal(recordChoice(m,catalog[0],now+60*60000),false);assert.equal(m.choices.length,1);
 assert.equal(recordChoice(m,catalog[0],now+90*60000),true);
 const twice=scoreTitle(catalog[0],m,[],now+90*60000);assert.ok(twice.repeatPoints>0);
 for(let i=2;i<100;i++)recordChoice(m,catalog[0],now+i*90*60000);
 const many=scoreTitle(catalog[0],m,[],now+99*90*60000);assert.ok(many.repeatPoints<=RULES.repeats);assert.ok(many.recent<=40);
});
test('a stale fixation decays and successive failed offers remove it from first place',()=>{
 const m=emptyModel(now);recordChoice(m,catalog[0],now);
 assert.ok(scoreTitle(catalog[0],m,[],now+14*day).recent<2);
 for(let i=0;i<7;i++){
   beginSession(m,'s'+i,catalog,[],now+2*3600000+i*1000);
   const e=nextProposal(m,catalog,now,'000');recordExposure(m,e,now);recordRejection(m,'000');
 }
 beginSession(m,'last',catalog,[],now+3*3600000);
 assert.notEqual(nextProposal(m,catalog,now).titleId,'000');
});
test('fair rotation eventually reaches every lower-ranked candidate',()=>{
 const m=emptyModel(now),seen=new Set();
 for(let i=0;i<200;i++){
   beginSession(m,'s'+i,catalog,[],now+i*60000);
   for(let j=0;j<4;j++){const e=show(m,catalog,now+i*60000);seen.add(e.titleId);}
 }
 for(const t of catalog.slice(50))assert.ok(seen.has(t.id),'missing '+t.id);
});
test('small catalogs fall back without forcing forbidden repeat suggestions',()=>{
 const m=emptyModel(now),small=catalog.slice(0,2);beginSession(m,'a',small,[],now);
 assert.ok(show(m,small));assert.ok(show(m,small));assert.equal(show(m,small),null);
});
test('browser state starts empty regardless of old app history, persists and resets seed-independent data',()=>{
 const data=new Map([['gaia_old_history','legacy']]);const storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};
 let m=loadModel(storage);assert.equal(m.mode,'test');assert.equal(m.choices.length,0);
 beginSession(m,'a',catalog,[],now);show(m);saveModel(m,storage);assert.equal(loadModel(storage).totalShown,1);
 saveModel(emptyModel(now),storage);assert.equal(loadModel(storage).totalShown,0);assert.equal(data.get('gaia_old_history'),'legacy');
 storage.setItem(MODEL_KEY,'bad');assert.throws(()=>loadModel(storage));
 assert.throws(()=>validateModel({...emptyModel(now),totalShown:'<img>'}));
 assert.throws(()=>validateModel({...emptyModel(now),mode:'unknown'}));
});
test('icons have accessible labels and regular offers have no badge',()=>{
 assert.match(proposalBadge('inspiration'),/Scopri/);assert.match(proposalBadge('underdog'),/underdog/);assert.equal(proposalBadge('regular'),'');
});
