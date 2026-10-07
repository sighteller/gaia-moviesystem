import test from 'node:test';import assert from 'node:assert/strict';
import {emptyModel} from '../supabase/functions/gaia-api/recommendations.js';
let handler;const env={SUPABASE_URL:'https://db.test',SUPABASE_SERVICE_ROLE_KEY:'server-only-key',SUPABASE_PUBLISHABLE_KEYS:JSON.stringify({default:'public-key'})};
globalThis.Deno={env:{get:k=>env[k]},serve:fn=>handler=fn};
await import('../supabase/functions/gaia-api/index.ts');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const send=(action,payload)=>handler(new Request('https://edge.test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,payload})}));
test('public edge returns only catalog identifiers and badges; historical statistics remain denied',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async(url,init={})=>{
  calls++;const u=new URL(url);
  if(u.pathname.includes('/rpc/')){
   assert.equal(init.headers.apikey,'server-only-key');assert.equal(init.headers.Authorization,'Bearer server-only-key');
   if(u.pathname.endsWith('gaia_recommendation_imported_seeds'))return Response.json([{titleId:id(1),days:71,lastDay:'2026-10-06',recentDays:[]}]);
   if(u.pathname.endsWith('gaia_recommendation_load'))return Response.json({subject:'gaia',epoch:id(4),revision:0,mode:'test',model:emptyModel(),session:null});
   if(u.pathname.endsWith('gaia_recommendation_commit'))return Response.json({ok:true});
  }
  if(u.pathname.endsWith('/titles'))return Response.json([{id:id(1),name:'Film',category:'animation',media_type:'movie'}]);
  if(u.pathname.endsWith('/platforms'))return Response.json([{id:id(2)}]);
  if(u.pathname.endsWith('/title_platforms'))return Response.json([{title_id:id(1),platform_id:id(2)}]);
  throw new Error('Unexpected request');
 };
 try{
  const r=await send('recommendationStart',{deviceId:id(3),requestId:id(5),category:'animation',platformIds:[id(2)]});assert.equal(r.status,200);
  const d=await r.json();assert.deepEqual(Object.keys(d.proposal).sort(),['kind','titleId']);assert.equal(d.model,undefined);assert.equal(d.seeds,undefined);assert.ok(!JSON.stringify(d).includes('server-only-key'));
  const before=calls;assert.equal((await send('recommendationStats',{deviceId:id(3)})).status,403);assert.equal(calls,before);
  const ideas=await (await send('recommendationIdeas',{deviceId:id(3),platformIds:[id(2)]})).json();assert.deepEqual(Object.keys(ideas.ideas[0]),['titleId']);
 }finally{globalThis.fetch=original;}
});
