import test from 'node:test';
import assert from 'node:assert/strict';
let handler;
const env={SUPABASE_URL:'https://db.test',SUPABASE_PUBLISHABLE_KEYS:'{"default":"test-key"}',TMDB_API_KEY:'test-provider-key',FANART_API_KEY:'test-fanart-key'};
globalThis.Deno={env:{get:k=>env[k]},serve:fn=>{handler=fn;}};
await import('../supabase/functions/image-curator/index.ts');
const send=(action,payload={},token='admin')=>handler(new Request('https://function.test',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({action,payload})}));
test('edge: auth, disambiguation, covers, provider outage and import',async()=>{
 const original=globalThis.fetch; let inserted=null,imported=null,fanartUnavailable=false;
 globalThis.fetch=async(input,init={})=>{
   const u=new URL(input);const headers=new Headers(init.headers);
   if(u.pathname==='/auth/v1/user')return Response.json({id:'user-id',app_metadata:{role:headers.get('authorization')==='Bearer admin'?'admin':'member'}});
   if(u.pathname==='/3/search/multi')return Response.json({page:1,total_pages:1,results:[
     {id:1,title:'Same',original_title:'Same',media_type:'movie',release_date:'1990-01-01',overview:'Original'},
     {id:2,name:'Same',original_name:'Same',media_type:'tv',first_air_date:'2020-01-01',overview:'Series'},
     {id:3,name:'Actor',media_type:'person'}]});
   if(u.pathname==='/3/movie/1')return Response.json({id:1,title:'Same',runtime:90,release_date:'1990-01-01',genres:[],external_ids:{},images:{posters:[
     {file_path:'/good.jpg',width:1000,height:1500,iso_639_1:'it'},
     {file_path:'/small.jpg',width:300,height:450,iso_639_1:'it'}]}});
   if(u.hostname==='webservice.fanart.tv')return fanartUnavailable?new Response('',{status:503}):Response.json({movieposter:[{url:'http://assets.fanart.tv/fanart/movies/1/movieposter/one.jpg',lang:'en'}]});
   if(u.pathname==='/rest/v1/cover_candidates'&&init.method==='DELETE')return new Response(null,{status:204});
   if(u.pathname==='/rest/v1/cover_candidates'){inserted=JSON.parse(init.body);return Response.json(inserted.map((c,i)=>({...c,id:i===0?'11111111-1111-4111-8111-111111111111':'22222222-2222-4222-8222-222222222222'})));}
   if(u.pathname==='/rest/v1/rpc/import_curated_title'){imported=JSON.parse(init.body);return Response.json('saved-title-id');}
   throw new Error('Unexpected remote request '+u);
 };
 try{
   assert.equal((await send('search',{query:'Same'},'')).status,401);
   assert.equal((await send('search',{query:'Same'},'member')).status,403);
   const d=await (await send('search',{query:'Same'})).json();
   assert.equal(d.results.length,2);assert.equal(d.results[1].media_type,'series');assert.equal(d.results[0].year,'1990');
   const c=await (await send('candidates',{tmdbId:1,mediaType:'movie'})).json();
   assert.equal(c.candidates.length,2);assert.equal(inserted[0].metadata.runtime_minutes,90);
   assert.ok(c.candidates[1].url.startsWith('https://assets.fanart.tv'));
   fanartUnavailable=true;
   const fallback=await (await send('candidates',{tmdbId:1,mediaType:'movie'})).json();
   assert.equal(fallback.candidates.length,1);assert.equal(fallback.warnings.length,1);
   const saved=await (await send('import',{candidateId:c.candidates[0].id,category:'film',platformIds:['platform']})).json();
   assert.equal(saved.titleId,'saved-title-id');assert.equal(imported.candidate_id,c.candidates[0].id);
   assert.equal((await send('candidates',{tmdbId:0,mediaType:'movie'})).status,400);
   delete env.TMDB_API_KEY;assert.equal((await send('search',{query:'Same'})).status,503);
 }finally{globalThis.fetch=original;}
});
