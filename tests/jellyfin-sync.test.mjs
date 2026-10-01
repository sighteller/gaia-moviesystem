import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeItem,due,validImage} from '../supabase/functions/jellyfin-sync/core.js';
import {syncMessage} from '../jellyfin-sync.js';
const id='a'.repeat(32),base='https://example.com/storage/covers/';
test('metadata preserves identity, normalizes fields, omits local paths and secrets',()=>{
 const x=normalizeItem({Id:id,Type:'Movie',Name:'Film',ProductionYear:2000,RunTimeTicks:54000000000,
  ProviderIds:{Tmdb:'123',Imdb:'tt123'},Genres:['Animazione'],Path:'C:\\private',Token:'secret',
  GaiaCoverUrl:base+id+'/abc.jpg',GaiaCollections:['Preferiti']},base);
 assert.equal(x.runtime,90);assert.equal(x.category,'animation');assert.equal(x.tmdb_id,123);
 assert.equal(x.Path,undefined);assert.equal(x.Token,undefined);assert.deepEqual(x.collections,['Preferiti']);
});
test('rejects episodes, invalid ids and arbitrary cover URLs',()=>{
 assert.throws(()=>normalizeItem({Id:id,Type:'Episode',Name:'Ep'},base));
 assert.throws(()=>normalizeItem({Id:'invalid',Type:'Movie',Name:'Film'},base));
 assert.throws(()=>normalizeItem({Id:id,Type:'Movie',Name:'Film',GaiaCoverUrl:'http://localhost:8096/a'},base));
});
test('weekly due, first run, manual requests and fulfilled request',()=>{
 const now=Date.parse('2026-10-01T12:00:00Z');
 assert.equal(due({},now),true);
 assert.equal(due({last_success_at:new Date(now-6*86400000).toISOString()},now),false);
 assert.equal(due({last_success_at:new Date(now-7*86400000).toISOString()},now),true);
 assert.equal(due({last_success_at:new Date(now).toISOString(),requested_at:new Date(now).toISOString()},now),true);
 assert.equal(due({last_success_at:new Date(now).toISOString(),requested_at:new Date(now-10).toISOString(),fulfilled_at:new Date(now).toISOString()},now),false);
});
test('image validation rejects HTML and oversized files',()=>{
 assert.equal(validImage(new TextEncoder().encode('<html>')),null);
 assert.equal(validImage(new Uint8Array(1048577)),false);
 assert.equal(validImage(Uint8Array.of(255,216,255,1,2)),'image/jpeg');
});
test('waiting status describes powered off computer',()=>{
 assert.match(syncMessage({configured:true,pending:true}),/In attesa del computer di casa/);
 assert.match(syncMessage({configured:true,running:true}),/in corso/);
});
