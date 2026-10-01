import test from 'node:test';
import assert from 'node:assert/strict';
import { mountCoverPicker } from '../cover-picker.js';
test('save button absent on initial render, preview is local, save requires explicit click and disappears',async()=>{
 const original=globalThis.fetch;let saves=0,listener;
 const cover={id:'a',url:'https://image.tmdb.org/t/p/original/a.jpg',preview_url:'https://image.tmdb.org/t/p/w342/a.jpg',provider:'tmdb',width:1000,height:1500};
 globalThis.fetch=async(_,init)=>{const {action}=JSON.parse(init.body);if(action==='covers')return Response.json({candidates:[cover]});saves++;return Response.json({url:cover.url});};
 const img={src:'old'};const status={textContent:''};const actions={innerHTML:'',replaceChildren(){this.innerHTML='';}};
 const change={addEventListener(){},remove(){}};const poster={insertAdjacentHTML(){},querySelector(){return change;}};
 const container={replaceChildren(){this.innerHTML='';},isConnected:true,innerHTML:'',addEventListener(_,fn){listener=fn;},closest(){return {querySelector(s){return s==='.poster-wrap'?poster:img;}};},querySelectorAll(){return [];},querySelector(s){return s==='.cover-status'?status:actions;}};
 const title={id:'title',dvd_cover_url:'old'};
 try{
   await mountCoverPicker(container,title);
   assert.ok(!container.innerHTML.includes('data-save-cover'));assert.equal(saves,0);
   const thumb={dataset:{coverChoice:'a'},hasAttribute(){return false;}};
   await listener({target:{closest(){return thumb;}}});
   assert.equal(img.src,cover.url);assert.equal(title.dvd_cover_url,'old');assert.equal(saves,0);assert.match(actions.innerHTML,/Salva copertina/);
   const save={dataset:{},hasAttribute(name){return name==='data-save-cover';},disabled:false};
   await listener({target:{closest(){return save;}}});
   assert.equal(saves,1);assert.equal(title.dvd_cover_url,cover.url);assert.equal(actions.innerHTML,'');assert.equal(container.innerHTML,'');
 }finally{globalThis.fetch=original;}
});
