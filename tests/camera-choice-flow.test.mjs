import test from 'node:test';
import assert from 'node:assert/strict';
import {CameraChoiceFlow,CHOICE_DURATIONS,YES_SELECTION_MS,YES_WINDOW_MS} from '../camera-choice-flow.js';
const context={key:'movie:1',kind:'movie',options:[{id:'film',label:'Film'}]};
function feed(flow,label,start,end,ctx=context,options={}){const events=[];for(let time=start;time<=end;time+=100){const event=flow.update(time,label,ctx,options);if(event)events.push({...event,time});}return events;}
test('Si for 1.5s asks, then requires 1.5s of fresh evidence and chooses once',()=>{
 const f=new CameraChoiceFlow();assert.equal(YES_SELECTION_MS,1500);assert.equal(YES_WINDOW_MS,2500);
 assert.ok(!feed(f,'yes',0,1400).some(e=>e.type==='ask'));
 assert.equal(f.update(1500,'yes',context).type,'ask');assert.equal(f.yesMs,0);
 assert.ok(!feed(f,'yes',1600,2900).some(e=>e.type==='choose'));
 assert.equal(f.update(3000,'yes',context).type,'choose');assert.deepEqual(feed(f,'yes',3100,6000),[]);
});
test('both stages tolerate uncertainty without counting it as Si',()=>{
 const f=new CameraChoiceFlow();feed(f,'yes',0,800);feed(f,'uncertain',900,1400);
 assert.equal(f.yesMs,800);assert.ok(!feed(f,'yes',1500,2000).some(e=>e.type==='ask'));
 assert.equal(f.update(2100,'yes',context).type,'ask');
 feed(f,'yes',2200,2900);feed(f,'uncertain',3000,3500);
 assert.equal(f.yesMs,800);assert.ok(!feed(f,'yes',3600,4100).some(e=>e.type==='choose'));
 assert.equal(f.update(4200,'yes',context).type,'choose');
});
test('brief face detection loss retains evidence but contributes zero time',()=>{
 const f=new CameraChoiceFlow();feed(f,'yes',0,800);feed(f,'unavailable',900,1300);assert.equal(f.yesMs,800);
 assert.equal(feed(f,'yes',1400,2000).at(-1).type,'ask');
 feed(f,'yes',2100,2800);feed(f,'unavailable',2900,3300);assert.equal(f.phase,'confirm');
 assert.equal(feed(f,'yes',3400,4000).at(-1).type,'choose');
});
test('old Si expires, so isolated positives cannot accumulate indefinitely',()=>{
 const f=new CameraChoiceFlow();feed(f,'yes',0,800);feed(f,'uncertain',900,4000);assert.equal(f.yesMs,0);
 assert.ok(!feed(f,'yes',4100,4900).some(e=>e.type==='ask'));assert.equal(f.yesMs,900);
});
test('the rolling window clips partially expired intervals',()=>{
 const f=new CameraChoiceFlow();feed(f,'yes',0,800);feed(f,'uncertain',900,2900);assert.equal(f.yesMs,400);
 assert.ok(!feed(f,'yes',3000,4000).some(e=>e.type==='ask'));assert.equal(f.yesMs,1100);
});
test('uncertainty or unavailability alone cannot trigger either stage',()=>{
 for(const label of ['uncertain','unavailable']){const f=new CameraChoiceFlow();assert.ok(feed(f,label,0,15000,context,{duration:2000}).every(e=>e.type==='offer'));assert.equal(f.elapsed,0);}
 const f=new CameraChoiceFlow();feed(f,'yes',0,1500);feed(f,'yes',1600,2900);assert.equal(f.yesMs,1400);
 assert.deepEqual(feed(f,'uncertain',3000,6000),[]);assert.equal(f.yesMs,0);assert.equal(f.phase,'confirm');
});
test('No/Riposo resets selection and cancels confirmation',()=>{
 const f=new CameraChoiceFlow();feed(f,'yes',0,1000);f.update(1100,'rest',context);assert.equal(f.yesMs,0);
 assert.ok(!feed(f,'yes',1200,2500).some(e=>e.type==='ask'));assert.equal(f.update(2600,'yes',context).type,'ask');
 assert.equal(f.update(2700,'rest',context).type,'cancel');assert.equal(f.phase,'scan');
 assert.equal(feed(f,'rest',2800,4700,context,{duration:2000}).at(-1).type,'advance');
});
test('No/Riposo advances at all six requested intervals',()=>{
 assert.deepEqual(CHOICE_DURATIONS,[2,3,4,5,7,10]);for(const seconds of CHOICE_DURATIONS){const f=new CameraChoiceFlow();assert.ok(!feed(f,'rest',0,seconds*1000-100,context,{duration:seconds*1000}).some(e=>e.type==='advance'));assert.equal(f.update(seconds*1000,'rest',context,{duration:seconds*1000}).type,'advance');}
});
test('Si pauses and resets the No timer',()=>{
 const f=new CameraChoiceFlow();feed(f,'rest',0,1900,context,{duration:2000});feed(f,'yes',2000,2700);feed(f,'uncertain',2800,3300);
 assert.equal(f.elapsed,0);assert.equal(feed(f,'yes',3400,4000).at(-1).type,'ask');
});
test('spoken question and pauses discard prior evidence',()=>{
 const f=new CameraChoiceFlow();feed(f,'yes',0,1500);feed(f,'yes',1600,4000,context,{paused:true});assert.equal(f.yesMs,0);
 assert.ok(!feed(f,'yes',4100,5400).some(e=>e.type==='choose'));assert.equal(f.update(5500,'yes',context).type,'choose');
});
test('prolonged face loss and callback stalls discard prior evidence',()=>{
 const f=new CameraChoiceFlow();feed(f,'yes',0,1500);feed(f,'yes',1600,2200);
 assert.equal(feed(f,'unavailable',2300,3100).at(-1).type,'cancel');assert.equal(f.yesMs,0);
 feed(f,'yes',3200,4000);assert.notEqual(f.update(5000,'yes',context)?.type,'ask');assert.equal(f.yesMs,0);
 feed(f,'yes',5100,6500);assert.equal(f.phase,'confirm');assert.equal(f.update(7000,'yes',context).type,'cancel');
});
test('new titles cannot reuse earlier evidence',()=>{
 const f=new CameraChoiceFlow();feed(f,'yes',0,1000);const changed={...context,key:'movie:2'};
 assert.equal(f.update(1100,'yes',changed).type,'offer');assert.equal(f.yesMs,0);
 assert.ok(!feed(f,'yes',1200,2500,changed).some(e=>e.type==='ask'));assert.equal(f.update(2600,'yes',changed).type,'ask');
});
test('categories cycle on the selected interval then allow Si',()=>{
 const c={key:'categories',kind:'categories',options:[{id:'a'},{id:'b'}]},f=new CameraChoiceFlow();
 assert.equal(feed(f,'rest',0,2000,c,{duration:2000}).at(-1).index,1);
 assert.equal(feed(f,'yes',2100,3500,c).find(e=>e.type==='ask').index,1);
});
