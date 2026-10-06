import { curate, normalizeMetadata } from './core.js';
const cors = {'Access-Control-Allow-Origin':'https://sighteller.github.io','Access-Control-Allow-Headers':'content-type,authorization,apikey','Access-Control-Allow-Methods':'POST,OPTIONS'};
const url=Deno.env.get('SUPABASE_URL')!;
const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default;
class HttpError extends Error { status:number; constructor(status:number,message:string){super(message);this.status=status;} }
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json'}});
const validId=(x:unknown)=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
async function remote(path:string,init:RequestInit={}) {
  if(!service) throw new HttpError(503,'Servizio non configurato.');
  const r=await fetch(url+'/rest/v1/'+path,{...init,headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json',...init.headers},signal:AbortSignal.timeout(15000)});
  if(!r.ok){const e=await r.json().catch(()=>({}));throw new HttpError(e.code==='23505'?409:e.code==='40001'?409:502,e.code==='23505'?'Titolo già nel catalogo.':e.code==='40001'?'La cover è cambiata: ricarica il titolo e riprova.':'Operazione non riuscita. Controlla titolo, cover e piattaforme.');}
  return r.status===204?null:await r.json();
}
let storedToken='',tokenCheckedAt=0;
async function providerToken(){
  const envToken=Deno.env.get('TMDB_READ_ACCESS_TOKEN');if(envToken)return envToken;
  if(Date.now()-tokenCheckedAt>300000){storedToken=await remote('rpc/curator_provider_token',{method:'POST',body:'{}'})||'';tokenCheckedAt=Date.now();}
  return storedToken;
}
async function tmdb(path:string) {
  const token=await providerToken(), apiKey=Deno.env.get('TMDB_API_KEY');
  if(!token&&!apiKey)throw new HttpError(503,'Ricerca TMDb non ancora configurata.');
  const endpoint=new URL('https://api.themoviedb.org/3/'+path);if(!token)endpoint.searchParams.set('api_key',apiKey!);
  const r=await fetch(endpoint,{headers:token?{Authorization:'Bearer '+token}:{},signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw new HttpError(r.status===429?429:502,'TMDb non disponibile. Riprova fra poco.');
  return r.json();
}
const requests=new Map<string,{start:number,count:number}>();
function checkRate(req:Request){
  const source=req.headers.get('x-forwarded-for')?.split(',')[0]||'shared';const now=Date.now();
  let bucket=requests.get(source);if(!bucket||now-bucket.start>60000){bucket={start:now,count:0};requests.set(source,bucket);}
  if(++bucket.count>60)throw new HttpError(429,'Troppe richieste. Riprova fra un minuto.');
  if(requests.size>1000)for(const [k,b] of requests)if(now-b.start>60000)requests.delete(k);
}
const filmRequestRates=new Map<string,{start:number,count:number}>();
function checkFilmRequestRate(req:Request){
 const source=req.headers.get('x-forwarded-for')?.split(',')[0]||'shared',now=Date.now();
 let b=filmRequestRates.get(source);if(!b||now-b.start>600000){b={start:now,count:0};filmRequestRates.set(source,b);}
 if(++b.count>5)throw new HttpError(429,'Hai già inviato diverse richieste. Riprova tra qualche minuto.');
 if(filmRequestRates.size>1000)for(const [k,v] of filmRequestRates)if(now-v.start>600000)filmRequestRates.delete(k);
}
const coverFields='id,title_id,tmdb_id,media_type,provider,url,preview_url,width,height,language';
Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(req.method!=='POST')return reply({error:'Method not allowed'},405);
  try{
    const {action,payload={}}=await req.json();
    if(action==='status')return reply({tmdb:!!((await providerToken())||Deno.env.get('TMDB_API_KEY')),fanart:!!Deno.env.get('FANART_API_KEY')});
    if(action==='covers'){
      if(!validId(payload.titleId))throw new HttpError(400,'Titolo non valido.');
      const rows=await remote('cover_candidates?select='+coverFields+'&title_id=eq.'+payload.titleId+'&expires_at=gt.'+encodeURIComponent(new Date().toISOString())+'&order=created_at.asc&limit=24');
      return reply({candidates:rows});
    }
    if(!['search','candidates','import','saveCover','request'].includes(action))return reply({error:'Unknown action'},400);
    checkRate(req);
    if(action==='search'){
      const q=String(payload.query||'').trim(),page=Number(payload.page||1);
      if(q.length<2||q.length>120)throw new HttpError(400,'Inserisci un titolo da 2 a 120 caratteri.');
      if(!Number.isInteger(page)||page<1||page>10)throw new HttpError(400,'Pagina non valida.');
      const d=await tmdb('search/multi?language=it-IT&include_adult=false&page='+page+'&query='+encodeURIComponent(q));
      return reply({page:d.page,total_pages:Math.min(d.total_pages,10),results:d.results.filter((x:any)=>['movie','tv'].includes(x.media_type)&&!x.adult).map((x:any)=>({tmdb_id:x.id,media_type:x.media_type==='tv'?'series':'movie',name:x.title||x.name,original_title:x.original_title||x.original_name,year:(x.release_date||x.first_air_date||'').slice(0,4),overview:x.overview||'',preview_url:x.poster_path?'https://image.tmdb.org/t/p/w185'+x.poster_path:null}))});
    }
    if(action==='candidates'){
      let id=Number(payload.tmdbId),type=payload.mediaType,title=null;
      if(payload.titleId){
        if(!validId(payload.titleId))throw new HttpError(400,'Titolo non valido.');
        title=(await remote('titles?select=id,tmdb_id,media_type&active=eq.true&id=eq.'+payload.titleId))[0];
        if(!title)throw new HttpError(404,'Titolo non trovato.');
        id=title.tmdb_id;type=title.media_type;
        const cached=await remote('cover_candidates?select=*&title_id=eq.'+title.id+'&expires_at=gt.'+encodeURIComponent(new Date().toISOString())+'&order=created_at.asc&limit=24');
        if(cached.length)return reply({metadata:cached[0].metadata,candidates:cached,warnings:[]});
      }
      if(!Number.isInteger(id)||id<=0||!['movie','series'].includes(type))throw new HttpError(400,'Identificazione TMDb da completare per questo titolo.');
      const path=(type==='series'?'tv':'movie')+'/'+id;
      const d=await tmdb(path+'?language=it-IT&append_to_response=images,external_ids&include_image_language=it,en,null');
      if(d.adult)throw new HttpError(400,'Titolo non ammesso.');
      const metadata=normalizeMetadata(d,type);
      const candidates=(d.images?.posters||[]).map((p:any)=>({provider:'tmdb',url:'https://image.tmdb.org/t/p/original'+p.file_path,preview_url:'https://image.tmdb.org/t/p/w342'+p.file_path,width:p.width,height:p.height,language:p.iso_639_1}));
      const warnings=[];const fanartKey=Deno.env.get('FANART_API_KEY'),fanartId=type==='movie'?id:d.external_ids?.tvdb_id;
      if(fanartKey&&fanartId){try{
        const r=await fetch('https://webservice.fanart.tv/v3/'+(type==='movie'?'movies':'tv')+'/'+fanartId,{headers:{'api-key':fanartKey},signal:AbortSignal.timeout(10000)});
        if(r.ok){const f=await r.json();for(const p of (type==='movie'?f.movieposter:f.tvposter)||[]){const u=new URL(p.url);if(u.hostname!=='assets.fanart.tv')continue;u.protocol='https:';candidates.push({provider:'fanart',url:u.href,preview_url:u.href,width:1000,height:1426,language:p.lang==='00'?null:p.lang});}}
        else if(r.status!==404)warnings.push('Fanart.tv temporaneamente non disponibile.');
      }catch{warnings.push('Fanart.tv non ha risposto; puoi scegliere le cover TMDb.');}}
      const selected=curate(candidates,title?24:4);
      await remote('cover_candidates?title_id=is.null&expires_at=lt.'+encodeURIComponent(new Date().toISOString()),{method:'DELETE'});
      const rows=selected.length?await remote('cover_candidates'+(title?'?on_conflict=title_id,url':''),{method:'POST',headers:{Prefer:'return=representation'+(title?',resolution=merge-duplicates':'')},body:JSON.stringify(selected.map(c=>({...c,tmdb_id:id,media_type:type,metadata,created_by:null,title_id:title?.id||null,expires_at:new Date(Date.now()+(title?365:1)*86400000).toISOString()})))}):[];
      return reply({metadata,candidates:rows,warnings});
    }
    if(!validId(payload.candidateId))throw new HttpError(400,'Scegli una copertina.');
    if(action==='saveCover'){
      if(!validId(payload.titleId)||!(payload.expectedUrl===null||typeof payload.expectedUrl==='string'))throw new HttpError(400,'Titolo non valido.');
      const saved=await remote('rpc/choose_curated_cover',{method:'POST',body:JSON.stringify({target_title_id:payload.titleId,candidate_id:payload.candidateId,expected_url:payload.expectedUrl})});
      return reply({url:saved});
    }
    if(action==='request'){
      checkFilmRequestRate(req);
      if(!['animation','film'].includes(payload.category))throw new HttpError(400,'Scegli una categoria.');
      const saved=await remote('rpc/request_public_curated_title',{method:'POST',body:JSON.stringify({candidate_id:payload.candidateId,title_category:payload.category})});
      let notification='not_configured';
      const key=Deno.env.get('RESEND_API_KEY'),from=Deno.env.get('FILM_REQUEST_EMAIL_FROM'),to=Deno.env.get('FILM_REQUEST_EMAIL_TO');
      if(saved.created&&key&&from&&to){
        try{
          const title=(await remote('titles?id=eq.'+saved.titleId+'&select=name'))[0];
          const mail=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','Idempotency-Key':'gaia-request-'+saved.titleId},body:JSON.stringify({from,to:[to],subject:'Gaia: nuovo titolo richiesto',text:'È stato richiesto: '+title.name+'\n\nApri il catalogo: https://sighteller.github.io/gaia-moviesystem/disponibilita.html'}),signal:AbortSignal.timeout(10000)});
          if(!mail.ok)throw Error('Invio email non riuscito');
          notification='sent';
          await remote('film_request_notifications?title_id=eq.'+saved.titleId,{method:'PATCH',body:JSON.stringify({status:'sent',sent_at:new Date().toISOString(),last_error:null})});
        }catch{
          notification='pending';
          await remote('film_request_notifications?title_id=eq.'+saved.titleId,{method:'PATCH',body:JSON.stringify({status:'failed',last_error:'Invio da riprovare'})}).catch(()=>{});
        }
      }
      return reply({...saved,notification});
    }
    if(!['animation','film'].includes(payload.category)||!Array.isArray(payload.platformIds)||!payload.platformIds.length||payload.platformIds.length>5||!payload.platformIds.every(validId))throw new HttpError(400,'Scegli categoria e piattaforme.');
    const saved=await remote('rpc/add_public_curated_title',{method:'POST',body:JSON.stringify({candidate_id:payload.candidateId,title_category:payload.category,platform_ids:payload.platformIds})});
    return reply({titleId:saved});
  }catch(e){return reply({error:e instanceof HttpError?e.message:'Servizio temporaneamente non disponibile.'},e instanceof HttpError?e.status:500);}
});
