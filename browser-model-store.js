import {normalizeModel,modelHash} from './model-schema.js?v=20261120shared';
export const SHARED_MODEL_KEY='gaia_shared_camera_model_v1';
const ENDPOINT='https://mahjewznwqvdgtdjtekc.supabase.co/functions/v1/gaia-catalog';
function availableStorage(){try{return globalThis.localStorage;}catch{return null;}}
export function createModelStore({storage=availableStorage(),events=globalThis.window,fetchImpl=globalThis.fetch,now=()=>Date.now()}={}){
 let active=null,pending=null,lastCheck=0,writes=0;
 function cleanRecord(value){
  if(value===null)return null;
  if(!value||!Number.isSafeInteger(value.revision)||value.revision<1||!/^[a-f0-9]{64}$/.test(value.sha256)||typeof value.file_name!=='string'||value.file_name.length>200||!Number.isFinite(Date.parse(value.updated_at)))throw Error('Il modello salvato sul sito non è leggibile. Riprova più tardi.');
  return {...value,model:normalizeModel(value.model)};
 }
 try{active=cleanRecord(JSON.parse(storage?.getItem(SHARED_MODEL_KEY)||'null'));}catch{}
 function changed(record){
  if(record&&active&&record.revision<active.revision)return active;
  const differs=active?.sha256!==record?.sha256;active=record;
  try{if(record)storage?.setItem(SHARED_MODEL_KEY,JSON.stringify(record));else storage?.removeItem(SHARED_MODEL_KEY);}catch{}
  if(differs)events?.dispatchEvent(new CustomEvent('gaia-personal-model-changed',{detail:{model:record?.model||null,record}}));
  return active;
 }
 events?.addEventListener('storage',e=>{if(e.key===SHARED_MODEL_KEY){try{changed(cleanRecord(JSON.parse(e.newValue||'null')));lastCheck=0;}catch{}}});
 async function api(action,payload={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{
   const response=await fetchImpl(ENDPOINT,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,payload}),signal:controller.signal});
   let data;try{data=await response.json();}catch{throw Error('Non riesco a leggere il modello del sito. Riprova.');}
   if(!response.ok){const error=Error(data.error||'Modello del sito non disponibile.');error.status=response.status;throw error;}
   const record=cleanRecord(data.record);if(record&&await modelHash(record.model)!==record.sha256)throw Error('Il modello ricevuto non coincide con quello salvato. Aggiorna lo stato.');
   return record;
  }catch(e){if(e.name==='AbortError')throw Error('Il sito impiega troppo tempo a rispondere. Controlla la connessione e riprova.');throw e;}finally{clearTimeout(timer);}
 }
 async function refresh({force=false,allowCache=true}={}){
  if(!force&&lastCheck&&now()-lastCheck<15000)return {model:active?.model||null,record:active,cached:false};
  try{
   if(!pending){const atWrites=writes;pending=api('cameraModelGet').then(record=>{if(atWrites!==writes&&(!record||record.revision<(active?.revision||0)))return active;const accepted=changed(record);lastCheck=now();return accepted;}).finally(()=>{pending=null;});}
   const record=await pending;return {model:record?.model||null,record,cached:false};
  }catch(e){if(allowCache&&active)return {model:active.model,record:active,cached:true,error:e.message};throw e;}
 }
 async function readFile(file){
  if(!file||file.size>64000)throw Error('Scegli il file JSON del modello di Gaia (massimo 64 KB).');
  try{return normalizeModel(JSON.parse(await file.text()));}catch(e){if(e instanceof SyntaxError)throw Error('Il file non è un modello JSON leggibile.');throw e;}
 }
 async function save(model,fileName,expectedRevision){
  const record=await api('cameraModelSave',{model:normalizeModel(model),file_name:fileName,expected_revision:expectedRevision});
  // A GET begun before this upload may finish late; it must not restore an old revision.
  if(!record)throw Error('Il sito non ha confermato il salvataggio. Aggiorna lo stato e riprova.');
  ++writes;changed(record);lastCheck=now();return {model:record.model,record};
 }
 return {savedModel:()=>active?.model||null,record:()=>active,refresh,readFile,save};
}
let singleton=null;
const store=()=>singleton??=createModelStore();
export const savedModel=()=>store().savedModel();
export const sharedModelRecord=()=>store().record();
export const refreshSharedModel=options=>store().refresh(options);
export const readModelFile=file=>store().readFile(file);
export const saveSharedModel=(model,fileName,expectedRevision)=>store().save(model,fileName,expectedRevision);
export function modelLabel(model){return model?'Modello del sito · pronto':'Modello del sito non disponibile. Apri le impostazioni.';}
let syncStarted=false;
export function startModelSync(){
 if(syncStarted)return;syncStarted=true;const refresh=()=>{if(!document.hidden)refreshSharedModel({force:true}).catch(()=>{});};refresh();
 window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);setInterval(refresh,60000);
}
