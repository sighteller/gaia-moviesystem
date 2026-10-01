export const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const safeImage=u=>{try{const x=new URL(u);return x.protocol==='https:'?esc(x.href):'';}catch{return '';}};
export async function curator(action,payload={}){
  const r=await fetch('https://mahjewznwqvdgtdjtekc.supabase.co/functions/v1/image-curator',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,payload}),signal:AbortSignal.timeout(25000)
  });
  const d=await r.json();if(!r.ok)throw new Error(d.error||'Operazione non riuscita.');return d;
}
