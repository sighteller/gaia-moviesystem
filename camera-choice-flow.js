// Uses only fresh readings. A continuous yes >2s opens confirmation;
// No/Riposo advances on timeout, without recording an explicit rejection.
export const YES_SELECTION_MS=2000;
export const CHOICE_DURATIONS=[2,3,4,5,7,10];
export class CameraChoiceFlow{
 constructor(){this.reset();}
 reset(){this.key=null;this.index=0;this.phase='scan';this.elapsed=0;this.last=null;this.yesSince=null;}
 hold(now){this.last=now;this.yesSince=null;}
 cancel(){this.phase='scan';this.elapsed=0;this.yesSince=null;}
 update(now,label,context,{paused=false,duration=5000}={}){
  if(!context?.options?.length){this.reset();return null;}
  if(context.key!==this.key){this.reset();this.key=context.key;this.last=now;if(!paused&&label==='yes')this.yesSince=now;return {type:'offer',index:0};}
  this.index=Math.min(this.index,context.options.length-1);
  const delta=this.last===null?0:now-this.last;this.last=now;
  const gap=delta<0||delta>350,missing=!['yes','rest','uncertain'].includes(label);
  if(gap||missing){this.yesSince=null;if(this.phase==='confirm'){this.cancel();return {type:'cancel',index:this.index};}return null;}
  if(paused){this.hold(now);return null;}
  if(this.phase==='busy')return null;
  if(this.phase==='confirm'){
   if(label!=='yes'){this.cancel();return {type:'cancel',index:this.index};}
   this.yesSince??=now;
   if(now-this.yesSince>=400){this.phase='busy';return {type:'choose',index:this.index};}
   return null;
  }
  if(label==='yes'){
   this.elapsed=0;this.yesSince??=now;
   if(now-this.yesSince>YES_SELECTION_MS){this.phase='confirm';this.yesSince=null;return {type:'ask',index:this.index};}
   return null;
  }
  this.yesSince=null;
  if(label==='rest'&&!context.confirming){
   this.elapsed+=Math.max(0,delta);
   if(this.elapsed>=duration){
    this.elapsed=0;
    if(context.kind==='movie'){this.phase='busy';return {type:'advance',index:this.index};}
    if(context.options.length>1){this.index=(this.index+1)%context.options.length;return {type:'offer',index:this.index};}
   }
  }
  return null;
 }
}
