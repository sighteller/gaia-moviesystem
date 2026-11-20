const ENDPOINT='https://mahjewznwqvdgtdjtekc.supabase.co/functions/v1/gaia-catalog';
const KEY='gaia_quote_edits';
export function normalizeQuote(q){
 if(!q||typeof q.text!=='string'||q.text.length>500||String(q.speaker||'').length>100)throw Error('Citazione non valida.');
 const source=String(q.source||'').trim();if(source&&(new URL(source).protocol!=='https:'||source.length>2000))throw Error('La fonte deve iniziare con https://');
 return {text:q.text===' '?' ':q.text.trim(),speaker:String(q.speaker||'').trim(),source,reviewed:q.reviewed===true,reviewed_at:q.reviewed===true?(q.reviewed_at||null):null};
}
function signature(q){if(!q)return 'null';const {reviewed_at,reviewed,...rest}=normalizeQuote(q);return JSON.stringify(rest);}
export function sharedQuotes(catalog){return catalog.titles.filter(t=>t.quote_override).map(t=>({...t.quote_override,title_id:t.id}));}
export function createQuoteStore({request,storage=localStorage}={}){
 let catalog=null;
 const call=request||async function(action,payload={}){const r=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,payload})});const d=await r.json();if(!r.ok||d.error)throw Error(d.error||'Salvataggio non riuscito.');return d;};
 async function load(){catalog=await call('catalogEditor');return catalog;}
 function pendingLocal(){
  let edits=[];try{edits=JSON.parse(storage.getItem(KEY)||'[]');}catch{}
  if(!Array.isArray(edits)||!catalog)return [];
  return edits.filter(q=>{const t=catalog.titles.find(t=>String(t.id)===String(q.title_id));try{return t&&signature(q)!==signature(t.quote_override);}catch{return false;}});
 }
 async function saveQuotes(quotes){
  if(!catalog)throw Error('Carica prima le citazioni del sito.');
  if(!quotes.length)return catalog;
  if(quotes.length>500||new Set(quotes.map(q=>q.title_id)).size!==quotes.length)throw Error('Elenco citazioni non valido.');
  const prepared=quotes.map(q=>({title_id:String(q.title_id),quote:normalizeQuote(q)}));
  const fresh=await call('catalogEditor');
  const changes=prepared.map(({title_id,quote})=>{
   const t=fresh.titles.find(t=>String(t.id)===title_id),previous=catalog.titles.find(t=>String(t.id)===title_id);
   if(!t||!previous)throw Error('Titolo non trovato. Ricarica la pagina.');
   if(signature(t.quote_override)!==signature(previous.quote_override))throw Error('La citazione è cambiata su un altro dispositivo. Ricarica la pagina prima di salvarla.');
   return {id:t.id,revision:t.revision,name:t.name,category:t.category,release_year:t.release_year,dvd_cover_url:t.dvd_cover_url,active:t.active,quote_override:quote,links:fresh.platforms.map(p=>{const l=fresh.links.find(l=>l.title_id===t.id&&l.platform_id===p.id);return {platform_id:p.id,url:l?.url||null,active:l?.active===true};})};
  });
  const result=await call('saveCatalog',{changes});if(result.saved!==changes.length)throw Error('Il sito non ha confermato il salvataggio. Ricarica e controlla prima di riprovare.');
  // Keep the revision snapshot coherent without letting a failed cache write turn a server success into an error.
  catalog=fresh;
  for(const c of changes)catalog.titles.find(t=>t.id===c.id).quote_override=c.quote_override;
  try{let edits=JSON.parse(storage.getItem(KEY)||'[]');if(!Array.isArray(edits))edits=[];for(const q of prepared)edits=edits.filter(x=>String(x.title_id)!==q.title_id).concat({...q.quote,title_id:q.title_id});storage.setItem(KEY,JSON.stringify(edits));}catch{}
  return catalog;
 }
 return {load,saveQuotes,pendingLocal};
}
