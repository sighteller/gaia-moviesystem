// Frames are transferred to a local Web Worker, never to an HTTP endpoint.
export class BrowserFaceEngine{
 constructor({workerFactory=url=>new Worker(url)}={}){this.workerFactory=workerFactory;this.worker=null;this.pending=new Map();this.serial=0;this.closed=false;}
 async start(model){
  if(typeof Worker==='undefined'||typeof OffscreenCanvas==='undefined'||typeof createImageBitmap==='undefined')throw Error('Questo browser non supporta il riconoscimento. Usa una versione aggiornata di Chrome, Edge o Safari.');
  this.closed=false;this.worker=this.workerFactory(new URL('./browser-face-worker.js?v=20261120browser',import.meta.url));
  this.worker.onmessage=({data})=>{const pending=this.pending.get(data.id);if(!pending)return;clearTimeout(pending.timer);this.pending.delete(data.id);data.error?pending.reject(Error(data.error)):pending.resolve(data.result);};
  this.worker.onerror=()=>this.close('Il riconoscitore si è interrotto. Riattiva la webcam.');
  return this.request('init',{model},[],60000);
 }
 request(type,data={},transfer=[],timeout=15000){
  if(this.closed||!this.worker)return Promise.reject(Error('Lettura terminata.'));
  const id=++this.serial;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('Il riconoscitore non risponde. Ferma e riavvia la lettura.'));this.close();},timeout);this.pending.set(id,{resolve,reject,timer});try{this.worker.postMessage({id,type,...data},transfer);}catch(e){clearTimeout(timer);this.pending.delete(id);reject(e);}});
 }
 reset(roi=null){return this.request('reset',{roi});}
 async frame(source,time,epoch=0){
  if(this.pending.size)throw Error('Un fotogramma è ancora in elaborazione.');
  const bitmap=await createImageBitmap(source);if(this.closed){bitmap.close();throw Error('Lettura terminata.');}
  try{return await this.request('frame',{bitmap,time,epoch},[bitmap]);}catch(e){bitmap.close();throw e;}
 }
 close(message='Lettura terminata.'){
  this.closed=true;this.worker?.terminate();this.worker=null;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error(message));}this.pending.clear();
 }
}
