const cors={"Access-Control-Allow-Origin":"https://sighteller.github.io","Access-Control-Allow-Headers":"content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const base=Deno.env.get("SUPABASE_URL")+"/rest/v1";
const key=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}").default;
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json"}});
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return reply({error:"Metodo non consentito"},405);
 try{
  const text=await req.text();if(text.length>1500000)return reply({error:"Troppe modifiche"},413);
  const {action,payload={}}=JSON.parse(text);
  if(!["catalogEditor","saveCatalog"].includes(action))return reply({error:"Operazione non consentita"},400);
  const path=action==="catalogEditor"?"gaia_catalog_editor":"gaia_save_catalog";
  const r=await fetch(base+"/rpc/"+path,{method:"POST",headers:{apikey:key,"Content-Type":"application/json"},body:JSON.stringify(action==="catalogEditor"?{}:{changes:payload.changes})});
  const result=await r.json();if(!r.ok)return reply({error:result.message||"Salvataggio non riuscito"},400);
  return reply(result);
 }catch{return reply({error:"Richiesta non valida o servizio non raggiungibile"},400);}
});