import {createQuoteStore,sharedQuotes} from './quote-store.js?v=20261120fourfilters';
import {proposalsFor} from './quote-proposals.js?v=20261120audioquotes';
import {titleQuote,standardQuote} from './title-quotes.js?v=20261120audioquotes';
const quoteStore=createQuoteStore();
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let titles=[],overrides=[],saving=false;
const list=document.querySelector('#list'),count=document.querySelector('#count'),pageStatus=document.querySelector('#quote-status');
const advanceAfterSave=new WeakSet();
function storedQuote(t){return overrides.find(q=>String(q.title_id)===String(t.id))||t.quote_override||null;}
function meaningful(q){return !!q&&typeof q.text==='string'&&!!q.text.trim()&&q.text.trim()!==standardQuote;}
function chosenQuote(t){const q=storedQuote(t);return meaningful(q)?q:null;}
function quoteOptions(t){
 const rows=[...proposalsFor(t)],predefined=titleQuote(t);if(predefined)rows.push(predefined);
 const seen=new Set();return rows.filter(q=>{const key=q.text?.trim();if(!meaningful(q)||seen.has(key))return false;seen.add(key);return true;});
}
function quoteGroup(t){return chosenQuote(t)?'quoted':quoteOptions(t).length?'proposed':'no-proposals';}
function matchesFilters(t){
 const query=document.querySelector('#search').value.toLocaleLowerCase('it'),filter=document.querySelector('#filter').value;
 return t.name.toLocaleLowerCase('it').includes(query)&&(filter==='all'||quoteGroup(t)===filter);
}
function applyCatalog(catalog){titles=catalog.titles.filter(t=>t.active===true&&t.media_type!=='episode'&&!t.series_id);overrides=sharedQuotes(catalog);updateLocalRecovery();}
function updateLocalRecovery(){
 const ids=new Set(titles.map(t=>String(t.id))),pending=quoteStore.pendingLocal().filter(q=>ids.has(String(q.title_id))),button=document.querySelector('#publish-local');
 button.hidden=!pending.length;button.textContent='Pubblica sul sito le citazioni locali ('+pending.length+')';document.querySelector('#local-recovery').hidden=!pending.length;
 document.querySelector('#local-titles').textContent=pending.map(q=>titles.find(t=>String(t.id)===String(q.title_id))?.name||q.title_id).join(', ');
}
function updateCount(){count.textContent=list.querySelectorAll('.quote-card').length+' titoli mostrati · '+titles.filter(t=>quoteGroup(t)==='quoted').length+' con citazione · '+titles.filter(t=>quoteGroup(t)==='proposed').length+' con proposte · '+titles.filter(t=>quoteGroup(t)==='no-proposals').length+' senza citazione né proposte';}
function cardMarkup(t){
 const q=storedQuote(t),chosen=chosenQuote(t),options=quoteOptions(t),label=chosen?'Citazione scelta':options.length?'Citazione da scegliere':'Frase standard';
 const optionMarkup=options.map((o,i)=>'<div class="quote-option"><button type="button" data-proposal="'+i+'" aria-pressed="false">«'+esc(o.text)+'»<small>'+esc(o.speaker||'')+(o.excerpt?' · Estratto':'')+'</small></button>'+(o.source?'<a href="'+esc(o.source)+'" target="_blank" rel="noopener noreferrer">Fonte ↗</a>':'')+'</div>').join('');
 const proposals=options.length?'<div class="quote-proposals"><p>'+options.length+' proposte disponibili. Scegline una e premi Salva.</p>'+optionMarkup+'</div>':'';
 return '<form class="quote-card" data-id="'+esc(t.id)+'"><h2>'+esc(t.name)+'</h2><p class="quote-card-state">'+esc(t.release_year||'Anno da verificare')+' · '+label+'</p><p class="quote-preview">'+(chosen?'«'+esc(chosen.text)+'»':q?.text===' '?'':esc(standardQuote))+'</p>'+(chosen?.source?'<a class="selected-quote-source" href="'+esc(chosen.source)+'" target="_blank" rel="noopener noreferrer">Leggi la fonte ↗</a>':'')+(chosen&&proposals?'<details class="quote-alternatives"><summary>Cambia citazione: mostra le proposte</summary>'+proposals+'</details>':proposals)+'<label>Citazione<textarea name="text" maxlength="500" placeholder="Lascia vuoto per la frase standard">'+esc(q?.text||'')+'</textarea></label><div class="quote-fields"><label>Personaggio (facoltativo)<input name="speaker" maxlength="100" value="'+esc(q?.speaker||'')+'"></label><label>Fonte (facoltativa)<input name="source" type="url" placeholder="https://…" value="'+esc(q?.source||'')+'"></label></div><button class="ghost-btn" type="submit">Salva</button><button class="ghost-btn" type="button" data-standard>Usa frase standard</button><span role="status"></span></form>';
}
function render(){list.innerHTML=titles.filter(matchesFilters).map(cardMarkup).join('');updateCount();}
list.addEventListener('click',e=>{
 const proposal=e.target.closest('[data-proposal]');
 if(proposal){const form=proposal.closest('form'),t=titles.find(t=>String(t.id)===form.dataset.id),q=quoteOptions(t)[Number(proposal.dataset.proposal)];if(!q)return;for(const name of ['text','speaker','source'])form.elements[name].value=q[name]||'';form.querySelectorAll('[data-proposal]').forEach(b=>b.setAttribute('aria-pressed',String(b===proposal)));form.querySelector('[role=status]').textContent='Premi Salva per scegliere questa citazione.';}
 if(e.target.matches('[data-standard]')){const form=e.target.closest('form');for(const name of ['text','speaker','source'])form.elements[name].value='';form.querySelector('[role=status]').textContent='Premi Salva per confermare la frase standard.';}
});
list.addEventListener('submit',async e=>{
 e.preventDefault();if(saving)return;
 const form=e.target,status=form.querySelector('[role=status]'),button=form.querySelector('[type=submit]'),advance=advanceAfterSave.has(form),following=form.nextElementSibling,preceding=form.previousElementSibling;
 advanceAfterSave.delete(form);let saved=false;saving=true;list.inert=true;button.disabled=true;status.textContent='Salvataggio…';
 try{
  const t=titles.find(t=>String(t.id)===form.dataset.id);
  const quote={...(storedQuote(t)||{}),title_id:form.dataset.id,text:form.elements.text.value===' '?' ':form.elements.text.value.trim(),speaker:form.elements.speaker.value.trim(),source:form.elements.source.value.trim()};
  if(quote.source&&new URL(quote.source).protocol!=='https:')throw Error('La fonte deve iniziare con https://');
  applyCatalog(await quoteStore.saveQuotes([quote]));saved=true;
 }catch(error){status.textContent=error.message;}
 finally{
  saving=false;list.inert=false;button.disabled=false;
  if(saved){
   const t=titles.find(t=>String(t.id)===form.dataset.id),remove=!t||!matchesFilters(t),hadFocus=form.contains(document.activeElement);
   let replacement=null;
   if(remove){form.remove();pageStatus.textContent='Salvata sul sito. La scheda non rientra più nel filtro corrente.';}
   else{form.insertAdjacentHTML('afterend',cardMarkup(t));replacement=form.nextElementSibling;form.remove();replacement.querySelector('[role=status]').textContent='Salvata sul sito, disponibile su tutti i dispositivi.';}
   updateCount();
   if(advance||remove&&hadFocus){const next=following?.isConnected?following:remove&&preceding?.isConnected?preceding:null;if(next)focusQuote(next);else if(replacement){focusQuote(replacement);replacement.querySelector('[role=status]').textContent='Salvata sul sito. Hai raggiunto l’ultima scheda.';}else document.querySelector('#filter').focus();}
   else if(hadFocus)replacement?.querySelector('[type=submit]').focus({preventScroll:true});
  }
 }
});
document.querySelector('#search').addEventListener('input',render);document.querySelector('#filter').addEventListener('change',render);
try{applyCatalog(await quoteStore.load());render();}catch(error){count.textContent=error.message;}
document.querySelector('#export').addEventListener('click',()=>{
 const data=overrides.map(q=>({...q,name:titles.find(t=>t.id===q.title_id)?.name,year:titles.find(t=>t.id===q.title_id)?.release_year})),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download='gaia-citazioni.json';a.click();URL.revokeObjectURL(url);
});
list.addEventListener('input',e=>{if(['text','speaker','source'].includes(e.target.name))e.target.closest('form').querySelector('[role=status]').textContent='Modifiche non salvate. Premi Salva.';});
document.querySelector('#publish-local').addEventListener('click',async e=>{
 if(saving)return;const ids=new Set(titles.map(t=>String(t.id))),quotes=quoteStore.pendingLocal().filter(q=>ids.has(String(q.title_id)));saving=true;list.inert=true;e.target.disabled=true;pageStatus.textContent='Salvataggio sul sito…';
 try{applyCatalog(await quoteStore.saveQuotes(quotes));render();pageStatus.textContent=quotes.length+' citazioni salvate sul sito.';}catch(error){pageStatus.textContent=error.message;}finally{saving=false;list.inert=false;e.target.disabled=false;}
});
function quoteStops(form){return [...form.querySelectorAll('.quote-alternatives summary,[data-proposal],button[type=submit]')].filter(b=>!b.closest('[hidden]')&&b.getClientRects().length>0);}
function focusQuote(form,index=0){const stops=quoteStops(form);stops[Math.min(Math.max(index,0),stops.length-1)]?.focus({preventScroll:true});form.scrollIntoView({block:'center',behavior:'smooth'});}
document.addEventListener('keydown',e=>{
 if(e.altKey||e.ctrlKey||e.metaKey||e.shiftKey||e.target.closest('input,textarea,select,a'))return;
 const form=e.target.closest('.quote-card'),cards=[...list.querySelectorAll('.quote-card')];if(!cards.length)return;
 if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){
  e.preventDefault();if(!form){focusQuote(cards[0]);return;}
  if(e.key==='ArrowLeft'||e.key==='ArrowRight')focusQuote(cards[Math.min(Math.max(cards.indexOf(form)+(e.key==='ArrowRight'?1:-1),0),cards.length-1)]);
  else{const stops=quoteStops(form),next=stops.indexOf(e.target)+(e.key==='ArrowDown'?1:-1),i=cards.indexOf(form);if(next>=stops.length&&i<cards.length-1)focusQuote(cards[i+1]);else if(next<0&&i>0){const previous=cards[i-1];focusQuote(previous,quoteStops(previous).length-1);}else focusQuote(form,next);}
 }else if(e.key==='Enter'&&form&&e.target.matches('[data-proposal],button[type=submit]')){
  e.preventDefault();if(e.repeat)return;if(e.target.matches('[data-proposal]'))e.target.click();if(form.reportValidity()){advanceAfterSave.add(form);form.requestSubmit(form.querySelector('[type=submit]'));}
 }
});
