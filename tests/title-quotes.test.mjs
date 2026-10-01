import test from 'node:test';
import assert from 'node:assert/strict';
import {titleQuote,titleQuotes,effectiveQuote} from '../title-quotes.js';

test('explicit blank overrides use standard text instead of the suggested quote',()=>{
 const t={id:'example',name:'Il castello errante di Howl',release_year:2004};
 assert.ok(effectiveQuote(t));
 assert.equal(effectiveQuote(t,[{title_id:'example',text:''}]),null);
 const edit={title_id:'example',text:'La mia citazione'};
 assert.equal(effectiveQuote(t,[edit]),edit);
});

test('quotes belong to the exact film edition, not a remake or sequel',()=>{
 assert.ok(titleQuote({name:'Lilli e il vagabondo',release_year:1955}));
 assert.equal(titleQuote({name:'Lilli e il vagabondo',release_year:2019}),null);
 assert.equal(titleQuote({name:'Lilli e il vagabondo',release_year:null}),null);
 assert.equal(titleQuote({name:'Un nuovo film',release_year:2026}),null);
});
test('each quote has a source and can be attributed without generating dialogue',()=>{
 const identities=new Set();
 for(const q of titleQuotes){
  assert.ok(q.text && q.speaker);
  assert.equal(new URL(q.source).protocol,'https:');
  assert.ok(q.text.split(/\s+/).length<=25);
  for(const name of q.names){
   const key=`${name}:${q.year}`;assert.ok(!identities.has(key));identities.add(key);
   assert.equal(titleQuote({name,release_year:q.year}),q);
  }
 }
});
