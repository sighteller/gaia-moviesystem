// Frozen pose + motion classifier. No I/O, learning, identity or expression inference.
export const FEATURE_NAMES=['pose_mean','pose_relative_to_opening','pose_velocity','pose_std'].flatMap(p=>['x','y','z'].map(a=>`${p}_${a}`));
export function validateModel(value){
 if(value?.videos||value?.annotations)throw Error('Questo è un file di annotazioni. Scegli il file del modello di Gaia.');
 if(value?.version!==1||value.model_type!=='standardized_logistic_regression'||value.extractor_version!=='gaia-pose-expression-1'||value.selected_variant!=='pose_motion')throw Error('Modello non compatibile. Usa il modello personalizzato di Gaia.');
 for(const key of ['mean','scale','coefficients'])if(!Array.isArray(value[key])||value[key].length!==12||!value[key].every(Number.isFinite))throw Error('Il modello contiene misure non valide.');
 if(value.scale.some(v=>v<=0)||!Number.isFinite(value.intercept)||value.feature_names?.join('|')!==FEATURE_NAMES.join('|')||value.feature_indices?.some((v,i)=>v!==i)||value.feature_indices?.length!==12||value.opening_reference_seconds!==3||value.history_seconds!==1||value.history_is_causal!==true||!(0<value.rest_threshold&&value.rest_threshold<value.yes_threshold&&value.yes_threshold<1))throw Error('Parametri del modello non compatibili.');
 return structuredClone(value);
}
const det=m=>m[0]*(m[4]*m[8]-m[5]*m[7])-m[1]*(m[3]*m[8]-m[5]*m[6])+m[2]*(m[3]*m[7]-m[4]*m[6]);
// MatrixData from the Web SDK is column-major (translation lives at 12,13,14).
// Normalize columns and find the closest rotation, like scipy Rotation.from_matrix.
export function anglesFromMatrix(matrix){
 if(matrix?.rows!==4||matrix?.columns!==4||matrix.data?.length!==16)return null;
 const d=matrix.data;if(!Array.from(d).every(Number.isFinite))return null;
 let m=Array.from({length:9},(_,i)=>d[(i%3)*4+Math.floor(i/3)]);
 for(let col=0;col<3;col++){const norm=Math.hypot(m[col],m[3+col],m[6+col]);if(norm<1e-8)return null;for(let row=0;row<3;row++)m[row*3+col]/=norm;}
 if(det(m)<=1e-8)return null;
 for(let step=0;step<30;step++){
  const [a,b,c,d,e,f,g,h,i]=m,D=det(m);if(Math.abs(D)<1e-12)return null;
  const inverseTranspose=[e*i-f*h,f*g-d*i,d*h-e*g,c*h-b*i,a*i-c*g,b*g-a*h,b*f-c*e,c*d-a*f,a*e-b*d].map(v=>v/D);
  const next=m.map((v,k)=>(v+inverseTranspose[k])/2),error=Math.max(...next.map((v,k)=>Math.abs(v-m[k])));m=next;if(error<1e-14)break;
 }
 const pitch=Math.asin(Math.max(-1,Math.min(1,-m[6])));
 return Math.abs(Math.cos(pitch))>1e-7?[Math.atan2(m[7],m[8]),pitch,Math.atan2(m[3],m[0])]:[Math.atan2(-m[5],m[4]),pitch,0];
}
export function predict(model,features){
 if(!features||features.length!==12||!features.every(Number.isFinite))return null;
 const z=features.reduce((sum,v,i)=>sum+(v-model.mean[i])/model.scale[i]*model.coefficients[i],model.intercept);
 return 1/(1+Math.exp(-Math.max(-700,Math.min(700,z))));
}
const median=xs=>{const a=xs.slice().sort((a,b)=>a-b),i=Math.floor(a.length/2);return a.length%2?a[i]:(a[i-1]+a[i])/2;};
export class PoseHistory{
 constructor(){this.reset();}
 reset(){this.opening=[];this.recent=[];this.epoch=-1;this.last=-Infinity;}
 add(time,pose,epoch=0){
  if(!Number.isFinite(time)||time<0||!Number.isInteger(epoch)||epoch<this.epoch||epoch===this.epoch&&time<=this.last)return null;
  if(epoch!==this.epoch){this.recent=[];this.epoch=epoch;this.last=-Infinity;}
  this.last=time;const valid=Array.isArray(pose)&&pose.length===3&&pose.every(Number.isFinite),row={time,pose:valid?pose:null};
  if(time<3){this.opening=this.opening.filter(r=>Math.abs(r.time-time)>.06);this.opening.push(row);this.opening=this.opening.slice(-80);}
  this.recent=this.recent.filter(r=>r.time>=time-1.5&&r.time<time);this.recent.push(row);this.recent=this.recent.slice(-64);
  return this.features(time,valid);
 }
 get referenceReady(){return this.opening.filter(r=>r.pose).length>=5;}
 features(time,valid=true){
  if(time<3||!valid||!this.referenceReady)return null;
  const rows=this.recent.filter(r=>r.pose&&r.time<=time+1e-6&&r.time>=time-1),n=rows.length;
  if(n<4||time-rows.at(-1).time>.22||rows.at(-1).time-rows[0].time<.55||rows.some((r,i)=>i&&r.time-rows[i-1].time>.45))return null;
  const opening=this.opening.filter(r=>r.pose),reference=[0,1,2].map(i=>median(opening.map(r=>r.pose[i])));
  const mean=[0,1,2].map(i=>rows.reduce((s,r)=>s+r.pose[i],0)/n),tMean=rows.reduce((s,r)=>s+r.time,0)/n;
  const divisor=Math.max(1e-8,rows.reduce((s,r)=>s+(r.time-tMean)**2,0));
  const velocity=[0,1,2].map(i=>rows.reduce((s,r)=>s+(r.time-tMean)*(r.pose[i]-mean[i]),0)/divisor);
  const std=[0,1,2].map(i=>Math.sqrt(rows.reduce((s,r)=>s+(r.pose[i]-mean[i])**2,0)/n));
  return [...mean,...mean.map((v,i)=>v-reference[i]),...velocity,...std];
 }
 score(model,time,pose,epoch=0){
  const features=this.add(time,pose,epoch),score=predict(model,features);
  return {time,epoch,score_yes:score,state:score===null?'unavailable':score>=model.yes_threshold?'yes':score<=model.rest_threshold?'rest':'uncertain',reason:time<3?'opening':!this.referenceReady?'missing_reference':!pose?'missing_face':!features?'history':'scored',reference_ready:this.referenceReady};
 }
}
export const SEARCH_TILES=[[0,0,1],...[0,.25,.5].flatMap(y=>[0,.25,.5].map(x=>[x,y,.5]))];
export function faceRoi(points,tile){
 const xs=points.map(p=>p.x),ys=points.map(p=>p.y),[x,y,s]=tile;
 const lo=[Math.min(...xs),Math.min(...ys)],hi=[Math.max(...xs),Math.max(...ys)];
 if(![...lo,...hi].every(Number.isFinite))return null;
 const size=Math.min(1,Math.max(.125,Math.max(hi[0]-lo[0],hi[1]-lo[1])*s*2.5));
 return [Math.max(0,Math.min(1-size,x+(lo[0]+hi[0])/2*s-size/2)),Math.max(0,Math.min(1-size,y+(lo[1]+hi[1])/2*s-size/2)),size];
}
export function validRoi(roi){return roi===null||Array.isArray(roi)&&roi.length===3&&roi.every(Number.isFinite)&&roi[0]>=0&&roi[1]>=0&&roi[2]>=.125&&roi[2]<=1&&roi[0]+roi[2]<=1.000001&&roi[1]+roi[2]<=1.000001;}
