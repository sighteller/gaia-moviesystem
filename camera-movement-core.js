export function vectorFromFace(p) {
  const a=p[33], b=p[263], n=p[1];
  const width=Math.hypot(b.x-a.x,b.y-a.y);
  if(width<0.015) return null;
  return [(n.x-(a.x+b.x)/2)/width, Math.atan2(b.y-a.y,b.x-a.x)];
}
export function classify(v, samples, tolerance=0.38) {
  const groups=normalizeSamples(samples);
  if(!v || !groups.rest.length || !groups.yes.length) return 'uncalibrated';
  const ranked=Object.entries(groups).filter(([,rows])=>rows.length).map(([label,rows])=>({label,distance:Math.min(...rows.map(p=>Math.hypot(p[0]-v[0],p[1]-v[1])))})).sort((a,b)=>a.distance-b.distance);
  // Overlapping examples stay ambiguous. Rest never becomes a response by default.
  if(ranked[0].distance>tolerance*0.22 || ranked[1].distance-ranked[0].distance<0.025) return 'uncertain';
  return ranked[0].label;
}
export function normalizeSamples(samples={}) {
  return Object.fromEntries(['rest','yes','no'].map(k=>{
    let rows=Array.isArray(samples?.[k])?samples[k]:[];
    if(rows.length && typeof rows[0]==='number')rows=[rows];
    return [k,rows.filter(v=>Array.isArray(v)&&v.length===2&&v.every(Number.isFinite)).slice(0,100)];
  }));
}
export class ChoiceTrial {
  constructor(){this.stop();}
  stop(){this.phase='idle';this.index=0;this.elapsed=0;this.timeouts=0;this.noCount=0;this.last=null;}
  start(seconds=15){this.stop();this.duration=seconds*1000;this.phase='browsing';}
  update(time,canRun,yesPending=false){
    const delta=this.last===null?0:time-this.last;this.last=time;
    if(this.phase!=='browsing'||!canRun||yesPending||delta<0||delta>350)return null;
    this.elapsed+=delta;
    if(this.elapsed>=this.duration){this.index++;this.elapsed=0;this.timeouts++;return 'timeout';}
    return null;
  }
  gesture(label){
    this.last=null;
    if(!['browsing','confirm'].includes(this.phase))return null;
    if(this.phase==='browsing' && label==='yes'){this.phase='confirm';return 'confirm';}
    if(label==='no'){this.noCount++;if(this.phase==='confirm'){this.phase='browsing';this.elapsed=0;return 'cancel';}return 'no';}
    if(this.phase==='confirm' && label==='yes'){this.phase='chosen';return 'chosen';}
    return null;
  }
}
export class GestureGate {
  constructor(){this.reset();}
  reset(){this.armed=false;this.label=null;this.since=0;this.last=null;}
  update(label,time,hold=700){
    if(this.last!==null && (time<this.last || time-this.last>350)) this.reset();
    this.last=time;
    if(label!==this.label){this.label=label;this.since=time;}
    if(label==='rest' && time-this.since>=350) this.armed=true;
    if(['uncalibrated','missing'].includes(label)) {this.armed=false;return null;}
    if(label==='uncertain'){if(time-this.since>=500)this.armed=false;return null;}
    if(this.armed && ['yes','no'].includes(label) && time-this.since>=hold){this.armed=false;return label;}
    return null;
  }
}
