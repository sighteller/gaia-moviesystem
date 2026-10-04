import {strict as assert} from 'node:assert';
import {buildSeriesIndex,catalogEntries,episodeLabel} from '../series-catalog.js';

const series={id:'series',name:'Saranno famosi',media_type:'series',active:true};
const episodes=[
 {id:'ep10',name:'Saranno Famosi 3x10 Apparenze',media_type:'movie',active:true},
 {id:'ep2',name:'Saranno Famosi 3x02 Volare',media_type:'movie',active:true},
 {id:'legacy',name:'1x01.Voci.Fuori.Dal.Coro',series_id:'series',season_number:1,episode_number:1,media_type:'movie',active:false}
];
const film={id:'film',name:'Fame - Saranno famosi',media_type:'movie',active:true};
const unknown={id:'unknown',name:'B1_t00',media_type:'movie',active:true};
const titles=[series,...episodes,film,unknown];
const index=buildSeriesIndex(titles);
assert.equal(index.parents.size,3);
assert.deepEqual(index.children.get('series').map(t=>t.id),['legacy','ep2','ep10']);
assert.equal(episodeLabel(episodes[2]),'Voci Fuori Dal Coro');
assert.equal(index.parents.has('film'),false);
assert.equal(index.parents.has('unknown'),false);
assert.equal(titles[3].active,false);

const active=catalogEntries(titles);
assert.deepEqual(active.entries.map(e=>e.title.id).sort(),['film','series','unknown']);
assert.equal(active.entries.find(e=>e.title.id==='series').children.length,3);
const search=catalogEntries(titles,{query:'Apparenze'});
assert.equal(search.entries[0].title.id,'series');
assert.deepEqual(search.entries[0].children.map(t=>t.id),['ep10']);
const archive=catalogEntries(titles,{filter:'archived'});
assert.equal(archive.entries[0].title.id,'series');
assert.deepEqual(archive.entries[0].children.map(t=>t.id),['legacy']);
const dirty=catalogEntries(titles,{filter:'dirty',dirtyIds:new Set(['ep2'])});
assert.deepEqual(dirty.entries[0].children.map(t=>t.id),['ep2']);

const renamed=titles.map(t=>t.id==='legacy'?{...t,name:'Un nuovo titolo'}:t);
assert.equal(buildSeriesIndex(renamed).parents.get('legacy'),'series');
const orphan={...episodes[2],series_id:'missing'};
assert.equal(buildSeriesIndex([orphan]).parents.size,0);
assert.equal(catalogEntries([orphan],{filter:'all'}).entries.length,1);
const duplicateSeries={...series,id:'other-series',name:'Saranno famosi'};
assert.equal(buildSeriesIndex([series,duplicateSeries,episodes[0]]).parents.size,0);
console.log('Series catalog grouping tests passed.');
