import { normalizeItem, due, validImage } from './core.js';
const base=Deno.env.get('SUPABASE_URL')!;
const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const coverBase=base+'/storage/v1/object/public/jellyfin-covers/';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type,authorization','Access-Control-Allow-Methods':'POST,OPTIONS'};
const reply=(d:unknown,status=200)=>new Response(JSON.stringify(d),{status,headers:{...cors,'Content-Type':'application/json'}});
async function rest(path:string,init:RequestInit={}) {
 const r=await fetch(base+'/rest/v1/'+path,{...init,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',...init.headers}});
 if(!r.ok) {
  const failure=await r.json().catch(()=>({}));
  console.error('Jellyfin database',r.status,String(failure.code||'unknown'),String(failure.message||'').slice(0,250));
  const error=new Error('Database operation failed');
  Object.assign(error,{diagnostic:'DB_'+String(failure.code||r.status)});
  throw error;
 }
 const t=await r.text();return t?JSON.parse(t):null;
}
const rpc=(name:string,args={})=>rest('rpc/'+name,{method:'POST',body:JSON.stringify(args)});
const hash=async(t:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t)))).map(n=>n.toString(16).padStart(2,'0')).join('');
async function state(){return (await rest('jellyfin_sync_state?id=eq.true&select=*'))[0];}
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 try{
  const raw=await req.text();if(raw.length>1500000)return reply({error:'Request too large'},413);
  const {action,payload={}}=JSON.parse(raw);
  const s=await state();
  if(action==='status')return reply({configured:!!s.connector_hash,last_success_at:s.last_success_at,
    last_seen_at:s.last_seen_at,pending:!!s.requested_at&&(!s.fulfilled_at||s.requested_at>s.fulfilled_at),
    running:!!s.run_id&&Date.now()-Date.parse(s.run_heartbeat_at)<30*60000,last_error:s.last_error,summary:s.summary});
  if(action==='request')return reply(await rpc('jellyfin_request_sync'));
  const token=req.headers.get('Authorization')?.replace(/^Bearer /,'')||'';
  if(token.length<32||!s.connector_hash||await hash(token)!==s.connector_hash)return reply({error:'Accesso al connettore non autorizzato.'},401);
  if(action==='poll'){
   await rest('jellyfin_sync_state?id=eq.true',{method:'PATCH',body:JSON.stringify({last_seen_at:new Date().toISOString()})});
   return reply({due:due(s),last_success_at:s.last_success_at});
  }
  if(action==='verify')return reply({ok:true});
  if(action==='begin'||action==='diagnose'){
   if(!/^[a-zA-Z0-9-]{16,64}$/.test(payload.server)||!Number.isInteger(payload.total))return reply({error:'Invalid server'},400);
   if(action==='diagnose')return reply(await rpc('jellyfin_probe_sync',{server:payload.server,total:payload.total}));
   console.log('Jellyfin begin, items:',payload.total);
   const run=await rpc('jellyfin_begin_sync',{server:payload.server,total:payload.total});
   const covers=[];
   for(let offset=0;offset<10000;offset+=500){
    const rows=await rest('jellyfin_items?select=item_id,data&order=item_id&limit=500&offset='+offset);
    covers.push(...rows.map((x:any)=>({id:x.item_id,tag:x.data.image_tag,url:x.data.cover_url})));
    if(rows.length<500)break;
   }
   return reply({run,covers});
  }
  if(!/^[a-f0-9-]{36}$/.test(payload.run||'')||s.run_id!==payload.run)return reply({error:'Expired run'},409);
  if(action==='cover'){
   if(!/^[a-f0-9]{32}$/.test(payload.id||''))return reply({error:'Invalid image id'},400);
   const bytes=Uint8Array.from(atob(payload.bytes||''),c=>c.charCodeAt(0));
   const mime=validImage(bytes);if(!mime)return reply({error:'Invalid image'},400);
   const digest=await crypto.subtle.digest('SHA-256',bytes);
   const fingerprint=Array.from(new Uint8Array(digest)).map(n=>n.toString(16).padStart(2,'0')).join('');
   const path=payload.id+'/'+fingerprint+(mime==='image/jpeg'?'.jpg':'.png');
   const r=await fetch(base+'/storage/v1/object/jellyfin-covers/'+path,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':mime,'x-upsert':'true'},body:bytes});
   if(!r.ok)throw new Error('Cover upload failed');
   await rest('jellyfin_sync_state?id=eq.true&run_id=eq.'+payload.run,{method:'PATCH',body:JSON.stringify({last_seen_at:new Date().toISOString(),run_heartbeat_at:new Date().toISOString()})});
   return reply({url:coverBase+path});
  }
  if(action==='batch'){
   if(!Array.isArray(payload.items)||!payload.items.length||payload.items.length>25)return reply({error:'Invalid batch'},400);
   await rpc('jellyfin_stage_sync',{run:payload.run,items:payload.items.map((x:any)=>normalizeItem(x,coverBase))});return reply({ok:true});
  }
  if(action==='complete')return reply(await rpc('jellyfin_finish_sync',{run:payload.run}));
  if(action==='fail'){
   await rest('jellyfin_sync_state?id=eq.true&run_id=eq.'+payload.run,{method:'PATCH',body:JSON.stringify({run_id:null,last_error:'Aggiornamento interrotto. Il catalogo precedente è conservato.'})});
   return reply({ok:true});
  }
  return reply({error:'Unknown action'},400);
 }catch(e){console.error(e instanceof Error?e.message:'Sync error');return reply({error:'Operazione non riuscita. Verifica il collegamento o riprova.',diagnostic:(e as any)?.diagnostic||'SYNC_ERROR'},400);}
});
