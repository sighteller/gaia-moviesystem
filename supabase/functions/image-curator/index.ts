import { curate, normalizeMetadata } from './core.js';
const cors = {
  'Access-Control-Allow-Origin':'https://sighteller.github.io',
  'Access-Control-Allow-Headers':'content-type,authorization,apikey',
  'Access-Control-Allow-Methods':'POST,OPTIONS',
};
const url=Deno.env.get('SUPABASE_URL')!;
const key=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}').default || Deno.env.get('SUPABASE_ANON_KEY');
class HttpError extends Error { status:number; constructor(status:number,message:string){super(message);this.status=status;} }
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json'}});
async function remote(path:string,authorization:string,init:RequestInit={}) {
  const r=await fetch(url+path,{...init,headers:{apikey:key,Authorization:authorization,'Content-Type':'application/json',...init.headers},signal:AbortSignal.timeout(15000)});
  if(!r.ok) throw new HttpError(r.status===401?401:502,'Operazione Supabase non riuscita.');
  return r.status===204?null:await r.json();
}
async function tmdb(path:string) {
  const token=Deno.env.get('TMDB_READ_ACCESS_TOKEN'), apiKey=Deno.env.get('TMDB_API_KEY');
  if(!token&&!apiKey) throw new HttpError(503,'Ricerca non ancora attiva: configura TMDb in Supabase.');
  const endpoint=new URL('https://api.themoviedb.org/3/'+path);
  if(!token) endpoint.searchParams.set('api_key',apiKey!);
  const r=await fetch(endpoint,{headers:token?{Authorization:'Bearer '+token}:{},signal:AbortSignal.timeout(12000)});
  if(!r.ok) throw new HttpError(r.status===429?429:502,'TMDb non disponibile. Riprova fra poco.');
  return r.json();
}
Deno.serve(async req=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:cors});
  if(req.method!=='POST') return reply({error:'Method not allowed'},405);
  try{
    const {action,payload={}}=await req.json();
    const authorization=req.headers.get('Authorization')||'';
    if(!authorization.startsWith('Bearer ')) throw new HttpError(401,'Accedi come amministratore.');
    const user=await remote('/auth/v1/user',authorization);
    if(user.app_metadata?.role!=='admin') throw new HttpError(403,'Questo account non è amministratore.');
    if(action==='me') return reply({admin:true,tmdb:!!(Deno.env.get('TMDB_API_KEY')||Deno.env.get('TMDB_READ_ACCESS_TOKEN')),fanart:!!Deno.env.get('FANART_API_KEY')});
    if(action==='search'){
      const q=String(payload.query||'').trim();
      if(q.length<2||q.length>120) throw new HttpError(400,'Inserisci un titolo da 2 a 120 caratteri.');
      const page=Number(payload.page||1);
      if(!Number.isInteger(page)||page<1||page>10) throw new HttpError(400,'Pagina non valida.');
      const d=await tmdb('search/multi?language=it-IT&include_adult=false&page='+page+'&query='+encodeURIComponent(q));
      return reply({page:d.page,total_pages:Math.min(d.total_pages,10),results:d.results.filter((x:any)=>['movie','tv'].includes(x.media_type)&&!x.adult).map((x:any)=>({
        tmdb_id:x.id,media_type:x.media_type==='tv'?'series':'movie',name:x.title||x.name,
        original_title:x.original_title||x.original_name,year:(x.release_date||x.first_air_date||'').slice(0,4),
        overview:x.overview||'',preview_url:x.poster_path?'https://image.tmdb.org/t/p/w185'+x.poster_path:null
      }))});
    }
    if(action==='candidates'){
      const id=Number(payload.tmdbId),type=payload.mediaType;
      if(!Number.isInteger(id)||id<=0||!['movie','series'].includes(type)) throw new HttpError(400,'Titolo non valido.');
      const path=(type==='series'?'tv':'movie')+'/'+id;
      const d=await tmdb(path+'?language=it-IT&append_to_response=images,external_ids&include_image_language=it,en,null');
      if(d.adult) throw new HttpError(400,'Titolo non ammesso.');
      const metadata=normalizeMetadata(d,type);
      const candidates=(d.images?.posters||[]).map((p:any)=>({
        provider:'tmdb',url:'https://image.tmdb.org/t/p/original'+p.file_path,
        preview_url:'https://image.tmdb.org/t/p/w342'+p.file_path,width:p.width,height:p.height,language:p.iso_639_1
      }));
      const warnings=[];
      const fanartKey=Deno.env.get('FANART_API_KEY');
      const fanartId=type==='movie'?id:d.external_ids?.tvdb_id;
      if(fanartKey&&fanartId){
        try{
          const r=await fetch('https://webservice.fanart.tv/v3/'+(type==='movie'?'movies':'tv')+'/'+fanartId,{headers:{'api-key':fanartKey},signal:AbortSignal.timeout(10000)});
          if(r.ok){
            const f=await r.json();
            for(const p of (type==='movie'?f.movieposter:f.tvposter)||[]){
              const u=new URL(p.url); if(u.hostname!=='assets.fanart.tv') continue;
              u.protocol='https:';
              candidates.push({provider:'fanart',url:u.href,preview_url:u.href,width:1000,height:1426,language:p.lang==='00'?null:p.lang});
            }
          }else if(r.status!==404) warnings.push('Fanart.tv temporaneamente non disponibile.');
        }catch{warnings.push('Fanart.tv non ha risposto; puoi scegliere le cover TMDb.');}
      }else warnings.push(!fanartKey?'Fanart.tv non configurato: candidate TMDb.':'Nessun ID TVDB: candidate TMDb per questa serie.');
      const selected=curate(candidates);
      // Bound cache growth, retaining a 24-hour audit/selection window.
      await remote('/rest/v1/cover_candidates?expires_at=lt.'+encodeURIComponent(new Date().toISOString()),authorization,{method:'DELETE'});
      const rows=selected.length?await remote('/rest/v1/cover_candidates',authorization,{
        method:'POST',headers:{Prefer:'return=representation'},
        body:JSON.stringify(selected.map(c=>({...c,tmdb_id:id,media_type:type,metadata,created_by:user.id})))
      }):[];
      return reply({metadata,candidates:rows,warnings});
    }
    if(action==='import'){
      if(!/^[0-9a-f-]{36}$/i.test(payload.candidateId||'')) throw new HttpError(400,'Scegli una copertina.');
      const r=await fetch(url+'/rest/v1/rpc/import_curated_title',{
        method:'POST',headers:{apikey:key,Authorization:authorization,'Content-Type':'application/json'},
        body:JSON.stringify({candidate_id:payload.candidateId,title_category:payload.category,platform_ids:payload.platformIds}),
        signal:AbortSignal.timeout(15000)
      });
      if(!r.ok){const e=await r.json();throw new HttpError(e.code==='23505'?409:400,e.code==='23505'?'Titolo già nel catalogo.':'Aggiunta non riuscita: controlla cover, categoria e piattaforme.');}
      return reply({titleId:await r.json()});
    }
    return reply({error:'Unknown action'},400);
  }catch(e){return reply({error:e instanceof HttpError?e.message:'Servizio temporaneamente non disponibile.'},e instanceof HttpError?e.status:500);}
});
