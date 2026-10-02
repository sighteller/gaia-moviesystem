import test from 'node:test';
import assert from 'node:assert/strict';
import {recordConsultation,choiceMessage,choiceMessageHtml,platformUrl} from '../choice-summary.js';
test('distinct titles stay distinct after backtracking; repaint does not count as a consultation',()=>{
 let s={titleIds:[],steps:0,lastTitleId:null};
 for(const id of ['a','a','b','a','c','c'])s=recordConsultation(s,id);
 assert.deepEqual(s.titleIds,['a','b','c']);assert.equal(s.steps,4);
});
test('messages use agreed boundaries and include the count',()=>{
 assert.match(choiceMessage(1),/Buona la prima.*Zia Tamara/);
 assert.ok(choiceMessageHtml(1).includes('<strong>prima</strong>'));
 for(const [count,word] of [[2,'fissa'],[5,'fissa'],[6,'film!'],[10,'film!'],[11,'zio beppe'],[30,'zio beppe'],[31,'sinistra'],[70,'sinistra']]){
  assert.ok(choiceMessage(count).includes(word));assert.ok(choiceMessageHtml(count).includes(`<strong>${count}</strong>`));
 }
 assert.match(choiceMessage(71),/Sicuri che la Gaia/);
});
test('platform links reject executable URLs and allow web and Jellyfin links',()=>{
 assert.equal(platformUrl('javascript:alert(1)'),'');assert.equal(platformUrl('data:text/html,test'),'');
 assert.equal(platformUrl('https://netflix.com/watch/1'),'https://netflix.com/watch/1');
 assert.equal(platformUrl('jellyfin://items/1'),'jellyfin://items/1');
});
