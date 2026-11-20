// Server handler. Only the active configuration is returned; no training data.
import {normalizeModel,modelHash} from './model-schema.js';
export const MODEL_ACTIONS=['cameraModelGet','cameraModelSave'];
class ModelError extends Error{constructor(message,status){super(message);this.status=status;}}
export function createCameraModelHandler({baseUrl,service,fetchImpl=fetch}){
 const headers={apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'};
 async function database(path,options={}){
  if(!service||!baseUrl)throw new ModelError('Il modello del sito non è disponibile in questo momento.',503);
  const response=await fetchImpl(baseUrl+'/rest/v1/'+path,{...options,signal:AbortSignal.timeout(8000),headers:{...headers,...options.headers}});
  let data;try{data=await response.json();}catch{throw new ModelError('Il modello del sito non è disponibile in questo momento.',503);}
  if(!response.ok){if(response.status===409||data.code==='PT409'||data.code==='40001'||data.code==='23505')throw new ModelError('Il modello è stato aggiornato da un’altra pagina. Aggiorna lo stato e riprova.',409);throw new ModelError('Non riesco a leggere o salvare il modello del sito. Riprova.',503);}
  return data;
 }
 function record(row){if(!row)return null;return {model:normalizeModel(row.model),revision:Number(row.revision),sha256:row.model_sha256,file_name:row.file_name,updated_at:row.updated_at};}
 return async(action,payload={})=>{
  try{
   if(action==='cameraModelGet'){
    const rows=await database('gaia_camera_model?id=eq.gaia&select=model,revision,model_sha256,file_name,updated_at');
    return {status:200,data:{record:record(rows[0])}};
   }
   if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new ModelError('Richiesta sul modello non valida.',400);
   if(action!=='cameraModelSave')throw new ModelError('Operazione sul modello non consentita.',400);
   if(!Number.isSafeInteger(payload.expected_revision)||payload.expected_revision<0)throw new ModelError('Aggiorna lo stato del modello prima di salvarlo.',400);
   let model;try{const json=JSON.stringify(payload.model);if(!json||json.length>64000)throw Error('Scegli un file del modello valido, fino a 64 KB.');model=normalizeModel(payload.model);}catch(e){throw new ModelError(e.message||'Modello non valido.',422);}
   const sha=await modelHash(model),name=String(payload.file_name||'Modello di Gaia.json').split(/[\\/]/).at(-1).replace(/[\u0000-\u001f]/g,'').slice(0,200)||'Modello di Gaia.json';
   const result=await database('rpc/gaia_replace_camera_model',{method:'POST',body:JSON.stringify({p_model:model,p_sha256:sha,p_file_name:name,p_expected_revision:payload.expected_revision})});
   return {status:200,data:{record:record(result)}};
  }catch(e){return {status:e instanceof ModelError?e.status:503,data:{error:e instanceof ModelError?e.message:'Servizio del modello temporaneamente non disponibile.'}};}
 };
}
