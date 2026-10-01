import test from 'node:test';
import assert from 'node:assert/strict';
import { curate, normalizeMetadata } from '../supabase/functions/image-curator/core.js';
import { recommend } from '../discovery.js';
test('filter resolution and ratio without cropping, remove duplicate URLs',()=>{
 const cover={url:'a',width:1000,height:1426,language:'it'};
 assert.equal(curate([cover,cover,{...cover,url:'b',height:999},{...cover,url:'c',width:1426}]).length,1);
 assert.equal(curate([{...cover,url:'en',language:'en'},cover])[0].url,'a');
});
test('series runtime stays unknown instead of using movie-length assumptions',()=>{
 assert.equal(normalizeMetadata({name:'Serie',first_air_date:'2020-01-01',runtime:120},'series').runtime_minutes,null);
 assert.equal(normalizeMetadata({title:'Film',release_date:'2020-01-01',runtime:120},'movie').runtime_minutes,120);
});
test('rewatches boost favorites, changed choices are neutral, platforms filter both groups',()=>{
 const titles=[{id:'a',name:'A',category:'film'},{id:'b',name:'B',category:'animation'},{id:'c',name:'C',category:'film'}];
 const links=titles.map(t=>({title_id:t.id,platform_id:t.id==='c'?'excluded':'p'}));
 const history=[{title_id:'a',viewing_status:'presumed_completed'},{title_id:'a',viewing_status:'in_progress'},{title_id:'b',viewing_status:'changed'}];
 const d=recommend(titles,links,['p'],history);
 assert.deepEqual(d.favorites.map(x=>x.title.id),['a']);
 assert.match(d.favorites[0].reason,/ritorna/);
 assert.deepEqual(d.ideas.map(x=>x.title.id),['b']);
});
test('cold start offers eligible catalog without inventing personal preferences',()=>{
 const d=recommend([{id:'a',name:'A'}],[{title_id:'a',platform_id:'p'}],['p'],[]);
 assert.equal(d.hasHistory,false); assert.equal(d.ideas.length,1);
 assert.equal(recommend([{id:'a',name:'A'}],[],['p'],[]).ideas.length,0);
});
