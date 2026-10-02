import test from 'node:test';
import assert from 'node:assert/strict';
import {quoteProposals,proposalsFor} from '../quote-proposals.js';
test('proposals keep their edition, character and source',()=>{
 for(const row of quoteProposals){assert.ok(row.options.length>0&&row.options.length<=3);for(const q of row.options){assert.ok(q.text&&q.speaker);assert.equal(new URL(q.source).protocol,'https:');}}
 assert.equal(proposalsFor({name:'Cattivissimo me',release_year:2010}).length,3);
 assert.equal(proposalsFor({name:'Cattivissimo me',release_year:2020}).length,0);
});
