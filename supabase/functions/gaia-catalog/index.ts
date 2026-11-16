import {uploadTitleAudio} from './audio-upload.js';
const cors={"Access-Control-Allow-Origin":"https://sighteller.github.io","Access-Control-Allow-Headers":"content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const base=Deno.env.get("SUPABASE_URL")+"/rest/v1";
const key=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}").default;
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json"}});
const audioRates=new Map();
function audioRate(req){const key=req.headers.get('x-forwarded-for')?.split(',')[0]||'shared',now=Date.now();let bucket=audioRates.get(key);if(!bucket||now-bucket.start>600000){bucket={start:now,count:0};audioRates.set(key,bucket);}if(++bucket.count>30)throw Error('Troppi caricamenti: riprova tra qualche minuto.');if(audioRates.size>1000)for(const[k,v]of audioRates)if(now-v.start>600000)audioRates.delete(k);}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return reply({error:"Metodo non consentito"},405);
 try{
  if(req.headers.get('content-type')?.startsWith('multipart/form-data')){
   audioRate(req);return reply(await uploadTitleAudio(req,{baseUrl:Deno.env.get('SUPABASE_URL'),service:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}));
  }
  const text=await req.text();if(text.length>1500000)return reply({error:"Troppe modifiche"},413);
  const {action,payload={}}=JSON.parse(text);
  if(!["catalogEditor","saveCatalog"].includes(action))return reply({error:"Operazione non consentita"},400);
  const audioChanging=action==="saveCatalog"&&Array.isArray(payload.changes)&&payload.changes.some(c=>c.audio_change);
  const restructuring=action==="saveCatalog"&&Array.isArray(payload.changes)&&payload.changes.some(c=>c.structure);
  const identifying=action==="saveCatalog"&&Array.isArray(payload.changes)&&payload.changes.some(c=>c.identification);
  const path=action==="catalogEditor"?"gaia_catalog_editor":audioChanging?"gaia_save_audio_catalog":restructuring?"gaia_save_structured_catalog":identifying?"gaia_save_identified_catalog":"gaia_save_catalog";
  const service=(identifying||restructuring||audioChanging)?Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'):null;
  if((identifying||restructuring)&&!service)return reply({error:'Associazione TMDb temporaneamente non disponibile'},503);
  const headers=service?{apikey:service,Authorization:'Bearer '+service,"Content-Type":"application/json"}:{apikey:key,"Content-Type":"application/json"};
  const r=await fetch(base+"/rpc/"+path,{method:"POST",headers,body:JSON.stringify(action==="catalogEditor"?{}:{changes:payload.changes})});
  const result=await r.json();if(!r.ok)return reply({error:result.message||"Salvataggio non riuscito"},400);
  return reply(result);
 }catch(error){return reply({error:error instanceof Error?error.message:"Richiesta non valida o servizio non raggiungibile"},400);}
});