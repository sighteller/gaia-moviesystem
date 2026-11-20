export function priorFrame(frames,time,maxAge=.22){
  let low=0,high=frames.length-1,index=-1;
  while(low<=high){const mid=(low+high)>>1;if(frames[mid].time<=time+1e-6){index=mid;low=mid+1;}else high=mid-1;}
  const frame=frames[index];return frame&&time-frame.time<=maxAge?frame:null;
}
export function yesSegments(frames){
  const segments=[];let current=null;
  for(const f of frames){
    if(f.state!=='yes'||!Number.isFinite(f.score_yes)){current=null;continue;}
    if(!current||f.time-current.end>.4){current={start:f.time,end:f.time,peak:f.score_yes};segments.push(current);}
    else{current.end=f.time;current.peak=Math.max(current.peak,f.score_yes);}
  }
  return segments;
}
export function compareAnnotations(frames,annotations){
  const counts={yesFound:0,yesMissed:0,falseYes:0,restNotActivated:0,unavailable:0,uncertainLabels:0};
  for(const a of annotations){
    if(!['yes','rest','no','none'].includes(a.label)){counts.uncertainLabels++;continue;}
    const f=priorFrame(frames,(a.start+a.end)/2);
    if(!f||!Number.isFinite(f.score_yes)){counts.unavailable++;continue;}
    if(a.label==='yes')counts[f.state==='yes'?'yesFound':'yesMissed']++;
    else counts[f.state==='yes'?'falseYes':'restNotActivated']++;
  }
  return counts;
}
export function timeLabel(seconds){const t=Math.max(0,seconds);return `${Math.floor(t/60).toString().padStart(2,'0')}:${(t%60).toFixed(1).padStart(4,'0')}`;}
