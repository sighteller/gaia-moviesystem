// Accumulate actual Si time in a bounded window; ambiguous frames never count as Si.
export const YES_SELECTION_MS=1500;
export const YES_WINDOW_MS=2500;
export const MISSING_GRACE_MS=750;
export const CHOICE_DURATIONS=[2,3,4,5,7,10];
export class CameraChoiceFlow{
 constructor(){this.reset();}
 clearEvidence(){this.samples=[];this.yesMs=0;this.missingSince=null;}
 reset(){this.key=null;this.index=0;this.phase='scan';this.elapsed=0;this.last=null;this.clearEvidence();}
 hold(now){this.last=now;this.clearEvidence();}
 cancel(){this.phase='scan';this.elapsed=0;this.clearEvidence();}
 evidence(now,delta,label){
  if(label==='yes'&&delta>0)this.samples.push({start:now-delta,end:now});
  const cutoff=now-YES_WINDOW_MS;
  this.samples=this.samples.filter(s=>s.end>cutoff);
  this.yesMs=this.samples.reduce((sum,s)=>sum+s.end-Math.max(s.start,cutoff),0);
 }
 update(now,label,context,{paused=false,duration=5000}={}){
  if(!context?.options?.length){this.reset();return null;}
  if(context.key!==this.key){this.reset();this.key=context.key;this.last=now;return {type:'offer',index:0};}
  this.index=Math.min(this.index,context.options.length-1);
  const delta=this.last===null?0:now-this.last;this.last=now;
  if(paused){this.hold(now);return null;}
  if(this.phase==='busy')return null;
  // Missing callbacks are not evidence; never bridge an old gesture across a stall.
  if(delta<0||delta>350){this.clearEvidence();if(this.phase==='confirm'){this.cancel();return {type:'cancel',index:this.index};}return null;}
  if(!['yes','rest','uncertain'].includes(label)){
   this.missingSince??=now;
   this.evidence(now,0,label);
   if(now-this.missingSince>=MISSING_GRACE_MS){this.clearEvidence();this.missingSince=now;if(this.phase==='confirm'){this.cancel();return {type:'cancel',index:this.index};}}
   return null;
  }
  this.missingSince=null;
  if(label==='rest'){
   this.clearEvidence();
   if(this.phase==='confirm'){this.cancel();return {type:'cancel',index:this.index};}
   if(!context.confirming){
    this.elapsed+=Math.max(0,delta);
    if(this.elapsed>=duration){
     this.elapsed=0;
     if(context.kind==='movie'){this.phase='busy';return {type:'advance',index:this.index};}
     if(context.options.length>1){this.index=(this.index+1)%context.options.length;return {type:'offer',index:this.index};}
    }
   }
   return null;
  }
  this.evidence(now,delta,label);
  if(label!=='yes')return null;
  this.elapsed=0;
  if(this.yesMs<YES_SELECTION_MS)return null;
  if(this.phase==='confirm'){this.phase='busy';this.clearEvidence();return {type:'choose',index:this.index};}
  this.phase='confirm';this.clearEvidence();return {type:'ask',index:this.index};
 }
}
