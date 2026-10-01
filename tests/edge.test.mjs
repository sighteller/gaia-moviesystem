import test from 'node:test';
import assert from 'node:assert/strict';
let handler;
const env={SUPABASE_URL:'https://db.test',SUPABASE_SERVICE_ROLE_KEY:'server-only-test-key',TMDB_API_KEY:'test-provider-key',FANART_API_KEY:'test-fanart-key'};
globalThis.Deno={env:{get:k=>env[k]},serve:fn=>{handler=fn;}};
await import('../supabase/functions/image-curator/index.ts');
const send=(action,payload={})=>handler(new Request('https://function.test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,payload})}));
test('public edge: no login, verified provider data, covers, fallback, import and explicit save',async()=>{
 const original=globalThis.fetch;let inserted,imported,saved,fanartUnavailable=false;
 globalThis.fetch=async(input,init={})=>{
   const u=new URL(input);const headers=new Headers(init.headers);
   if(u.hostname==='db.test')assert.equal(headers.get('apikey'),'server-only-test-key');
   if(u.pathname==='/rest/v1/rpc/curator_provider_token')return Response.json(null);
   if(u.pathname==='/3/search/multi')return Response.json({page:1,total_pages:1,results:[
     {id:1,title:'Same',original_title:'Same',media_type:'movie',release_date:'1990-01-01',overview:'Original'},
     {id:2,name:'Same',original_name:'Same',media_type:'tv',first_air_date:'2020-01-01',overview:'Series'},
     {id:3,name:'Actor',media_type:'person'}]});
   if(u.pathname==='/3/movie/1')return Response.json({id:1,title:'Same',runtime:90,release_date:'1990-01-01',genres:[],external_ids:{},images:{posters:[
     {file_path:'/good.jpg',width:1000,height:1500,iso_639_1:'it'},
     {file_path:'/small.jpg',width:300,height:450,iso_639_1:'it'}]}});
   if(u.hostname==='webservice.fanart.tv')return fanartUnavailable?new Response('',{status:503}):Response.json({movieposter:[{url:'http://assets.fanart.tv/fanart/movies/1/movieposter/one.jpg',lang:'en'}]});
   if(u.pathname==='/rest/v1/cover_candidates'&&init.method==='DELETE')return new Response(null,{status:204});
   if(u.pathname==='/rest/v1/cover_candidates'&&init.method!=='POST')return Response.json([]);
   if(u.pathname==='/rest/v1/cover_candidates'){inserted=JSON.parse(init.body);return Response.json(inserted.map((c,i)=>({...c,id:i===0?'11111111-1111-4111-8111-111111111111':'22222222-2222-4222-8222-222222222222'})));}
   if(u.pathname==='/rest/v1/rpc/add_public_curated_title'){imported=JSON.parse(init.body);return Response.json('saved-title-id');}
   if(u.pathname==='/rest/v1/rpc/choose_curated_cover'){saved=JSON.parse(init.body);return Response.json('https://image.tmdb.org/t/p/original/good.jpg');}
   throw new Error('Unexpected remote request '+u);
 };
 try{
   const d=await (await send('search',{query:'Same'})).json();
   assert.equal(d.results.length,2);assert.equal(d.results[1].media_type,'series');assert.equal(d.results[0].year,'1990');
   const c=await (await send('candidates',{tmdbId:1,mediaType:'movie'})).json();
   assert.equal(c.candidates.length,2);assert.equal(inserted[0].metadata.runtime_minutes,90);assert.equal(inserted[0].created_by,null);
   assert.ok(c.candidates[1].url.startsWith('https://assets.fanart.tv'));
   assert.equal(saved,undefined,'collecting candidates must not save a selected cover');
   fanartUnavailable=true;
   const fallback=await (await send('candidates',{tmdbId:1,mediaType:'movie'})).json();
   assert.equal(fallback.candidates.length,1);assert.equal(fallback.warnings.length,1);
   const result=await (await send('import',{candidateId:c.candidates[0].id,category:'film',platformIds:['33333333-3333-4333-8333-333333333333']})).json();
   assert.equal(result.titleId,'saved-title-id');assert.equal(imported.candidate_id,c.candidates[0].id);
   await send('saveCover',{titleId:'33333333-3333-4333-8333-333333333333',candidateId:c.candidates[0].id,expectedUrl:null});
   assert.equal(saved.expected_url,null);assert.equal(saved.candidate_id,c.candidates[0].id);
   assert.equal((await send('candidates',{tmdbId:0,mediaType:'movie'})).status,400);
   assert.equal((await send('saveCover',{titleId:'invalid',candidateId:c.candidates[0].id,expectedUrl:null})).status,400);
   assert.equal((await send('import',{candidateId:c.candidates[0].id,category:'film',platformIds:[]})).status,400);
   delete env.TMDB_API_KEY;assert.equal((await send('search',{query:'Same'})).status,503);
 }finally{globalThis.fetch=original;}
});
