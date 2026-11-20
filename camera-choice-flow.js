// Converts fresh readings into UI actions. Absence of yes is a timeout, never a no.
export class CameraChoiceFlow{
 constructor(){this.reset();}
 reset(){this.key=null;this.index=0;this.phase='scan';this.elapsed=0;this.last=null;this.restSince=null;this.yesSince=null;this.armed=false;this.pendingSince=null;}
 hold(now){this.last=now;this.restSince=null;this.yesSince=null;}
 cancel(){this.phase='scan';this.armed=false;this.pendingSince=null;this.restSince=null;this.yesSince=null;}
 update(now,label,context,{paused=false,duration=15000}={}){
  if(!context?.options?.length){this.reset();return null;}
  if(context.key!==this.key){this.reset();this.key=context.key;this.last=now;return {type:'offer',index:0};}
  this.index=Math.min(this.index,context.options.length-1);
  const delta=this.last===null?0:now-this.last;this.last=now;
  const gap=delta<0||delta>350,missing=!['yes','rest','uncertain'].includes(label);
  if(gap||missing){const pending=['waiting','confirm'].includes(this.phase);this.restSince=null;this.yesSince=null;this.armed=false;if(pending){this.cancel();return {type:'cancel',index:this.index};}return null;}
  if(paused){this.hold(now);return null;}
  if(this.phase==='busy')return null;
  // A valid score below the yes threshold is not a yes, even in the grey band.
  if(label==='rest'||label==='uncertain'){this.restSince??=now;this.yesSince=null;if(now-this.restSince>=350)this.armed=true;}
  else {this.restSince=null;if(label==='yes')this.yesSince??=now;else this.yesSince=null;}
  if(this.phase==='waiting'){
   if(now-this.pendingSince>=3000){
    if(label==='yes'&&this.yesSince!==null&&now-this.yesSince>=400){this.phase='confirm';this.yesSince=null;return {type:'ask',index:this.index};}
    this.cancel();return {type:'cancel',index:this.index};
   }return null;
  }
  if(this.phase==='confirm'){
   if(label!=='yes'){this.cancel();return {type:'cancel',index:this.index};}
   if(label==='yes'&&now-this.yesSince>=400){this.phase='busy';this.armed=false;return {type:'choose',index:this.index};}
   return null;
  }
  if(this.armed&&label==='yes'&&now-this.yesSince>=400){this.phase='waiting';this.pendingSince=now;this.elapsed=0;return {type:'pending',index:this.index};}
  if((label==='rest'||label==='uncertain')&&!context.confirming){
   this.elapsed+=Math.max(0,delta);
   if(this.elapsed>=duration){
    this.elapsed=0;this.armed=false;this.restSince=null;this.yesSince=null;
    if(context.kind==='movie'){this.phase='busy';return {type:'advance',index:this.index};}
    if(context.options.length>1)this.index=(this.index+1)%context.options.length;
    return {type:'offer',index:this.index};
   }
  }
  return null;
 }
}
