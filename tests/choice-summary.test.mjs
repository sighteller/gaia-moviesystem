import test from 'node:test';
import assert from 'node:assert/strict';
import {recordConsultation,choiceMessage,platformUrl} from '../choice-summary.js';
test('distinct titles stay distinct after backtracking; repaint does not count as a consultation',()=>{
 let s={titleIds:[],steps:0,lastTitleId:null};
 for(const id of ['a','a','b','a','c','c'])s=recordConsultation(s,id);
 assert.deepEqual(s.titleIds,['a','b','c']);assert.equal(s.steps,4);
});
test('messages use agreed boundaries and include the count',()=>{
 for(const [count,word] of [[1,'prima'],[5,'casting'],[6,'provini'],[10,'provini'],[11,'vincitore'],[30,'vincitore'],[31,'festival'],[70,'festival'],[71,'giro']]){
  assert.ok(choiceMessage(count).includes(word));assert.ok(choiceMessage(count).includes(String(count)));
 }
});
test('platform links reject executable URLs and allow web and Jellyfin links',()=>{
 assert.equal(platformUrl('javascript:alert(1)'),'');assert.equal(platformUrl('data:text/html,test'),'');
 assert.equal(platformUrl('https://netflix.com/watch/1'),'https://netflix.com/watch/1');
 assert.equal(platformUrl('jellyfin://items/1'),'jellyfin://items/1');
});
