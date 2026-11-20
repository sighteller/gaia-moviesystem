const coreModule=import('./browser-model-core.js?v=20261120browser');
const SDK='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21';
const FACE_MODEL='https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const FACE_SHA='64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff';
let detector=null,model=null,history=null,roi=null,manual=false,misses=0;
const canvas=new OffscreenCanvas(1,1),ctx=canvas.getContext('2d',{alpha:false});
const roundEven=x=>Math.abs(x%1-.5)<1e-10?2*Math.round(x/2):Math.round(x);
function image(source,tile){
 const [x,y,s]=tile,w=source.width,h=source.height,x0=Math.floor(x*w),y0=Math.floor(y*h),sw=Math.min(w,Math.floor((x+s)*w))-x0,sh=Math.min(h,Math.floor((y+s)*h))-y0;
 if(sw<=0||sh<=0)throw Error('Ritaglio non valido.');canvas.width=Math.min(960,sw);canvas.height=roundEven(canvas.width*sh/sw);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='low';ctx.drawImage(source,x0,y0,sw,sh,0,0,canvas.width,canvas.height);return canvas;
}
function bounds(points,tile){
 if(!points?.length)return null;const xs=points.map(p=>tile[0]+p.x*tile[2]),ys=points.map(p=>tile[1]+p.y*tile[2]);
 const l=Math.min(...xs),r=Math.max(...xs),t=Math.min(...ys),b=Math.max(...ys);return {x:(l+r)/2,y:(t+b)/2,w:r-l,h:b-t};
}
self.onmessage=async({data})=>{
 const {id,type}=data;
 try{
  const {validateModel,anglesFromMatrix,PoseHistory,faceRoi,SEARCH_TILES,validRoi}=await coreModule;
  if(type==='init'){
   model=validateModel(data.model);detector?.close();
   const {FaceLandmarker,FilesetResolver}=await import(`${SDK}/vision_bundle.mjs`);
   const files=await FilesetResolver.forVisionTasks(`${SDK}/wasm`);
   const response=await fetch(FACE_MODEL);if(!response.ok)throw Error('Impossibile scaricare il riconoscitore del viso. Controlla la connessione e riprova.');
   const buffer=new Uint8Array(await response.arrayBuffer());const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))).map(b=>b.toString(16).padStart(2,'0')).join('');if(sha!==FACE_SHA)throw Error('Il riconoscitore scaricato è diverso da quello previsto.');
   detector=await FaceLandmarker.createFromOptions(files,{baseOptions:{modelAssetBuffer:buffer,delegate:'CPU'},runningMode:'IMAGE',numFaces:2,minFaceDetectionConfidence:.5,minFacePresenceConfidence:.5,minTrackingConfidence:.5,outputFacialTransformationMatrixes:true,outputFaceBlendshapes:false});
   history=new PoseHistory();roi=null;manual=false;misses=0;return self.postMessage({id,result:{ready:true}});
  }
  if(type==='reset'){
   if(!validRoi(data.roi??null))throw Error('Ritaglio non valido.');history.reset();roi=data.roi??null;manual=!!roi;misses=0;return self.postMessage({id,result:{reset:true}});
  }
  if(type!=='frame'||!detector||!model)throw Error('Riconoscitore non pronto.');
  const source=data.bitmap;
  if(!Number.isFinite(data.time)||data.time<0||!Number.isInteger(data.epoch)||data.epoch<0)throw Error('Posizione del video non valida.');
  if(!manual&&(roi===null||misses>=4)){
   roi=null;misses=0;
   for(const tile of SEARCH_TILES){const result=detector.detect(image(source,tile));if(result.faceLandmarks.length>1)break;if(result.faceLandmarks.length===1){roi=faceRoi(result.faceLandmarks[0],tile);break;}}
  }
  const result=roi?detector.detect(image(source,roi)):null;
  const count=result?.faceLandmarks?.length||0,pose=count===1?anglesFromMatrix(result.facialTransformationMatrixes?.[0]):null;
  misses=pose?0:misses+1;const output=history.score(model,data.time,pose,data.epoch);
  self.postMessage({id,result:{...output,roi:roi?.slice()||null,face_count:count,bounds:count===1?bounds(result.faceLandmarks[0],roi):null,pose,retrained:false}});
 }catch(e){self.postMessage({id,error:e.message||'Riconoscimento non disponibile.'});}
 finally{data.bitmap?.close();}
};
