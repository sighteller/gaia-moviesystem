const endpoint='https://mahjewznwqvdgtdjtekc.supabase.co/functions/v1/jellyfin-sync';
export async function syncCall(action){
 const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action}),signal:AbortSignal.timeout(20000)});
 const d=await r.json();if(!r.ok)throw new Error(d.error||'Collegamento non disponibile.');return d;
}
export function syncMessage(s){
 if(!s.configured)return 'Collegamento Jellyfin in preparazione.';
 if(s.running)return 'Aggiornamento in corso dal computer di casa…';
 if(s.pending)return 'Aggiornamento richiesto. In attesa del computer di casa; il controllo avviene ogni 15 minuti quando è acceso e l’utente Windows è collegato.';
 if(s.last_error)return s.last_error;
 if(!s.last_success_at)return 'Pronto per la prima sincronizzazione dal computer di casa.';
 return 'Ultimo aggiornamento: '+new Date(s.last_success_at).toLocaleString('it-IT')+(s.summary?' · '+s.summary.total+' titoli.':'');
}
export function mountJellyfinSync(el,onUpdated){
 const title=document.createElement('h3');title.textContent='Catalogo Jellyfin';
 const status=document.createElement('p');status.setAttribute('role','status');status.textContent='Controllo aggiornamenti…';
 const button=document.createElement('button');button.className='ghost-btn';button.textContent='Aggiorna Jellyfin';button.disabled=true;
 el.append(title,status,button);let last=null,busy=false,seen=false;
 async function refresh(){
  if(!el.isConnected)return;
  try{
   const s=await syncCall('status');if(!el.isConnected)return;
   status.textContent=syncMessage(s);button.disabled=busy||!s.configured||s.pending||s.running;
   if(seen && s.last_success_at && s.last_success_at!==last)await onUpdated();last=s.last_success_at;seen=true;
  }catch{status.textContent='Non riesco a controllare Jellyfin. Riapri le impostazioni per riprovare.';button.disabled=true;}
  if(el.isConnected)setTimeout(refresh,15000);
 }
 button.addEventListener('click',async()=>{
  busy=true;button.disabled=true;
  try{await syncCall('request');status.textContent='Richiesta inviata. Il computer di casa la riceverà al prossimo controllo.';}
  catch{status.textContent='Richiesta non inviata. Riprova.';button.disabled=false;}
  finally{busy=false;}
 });
 refresh();
}
