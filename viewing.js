import {effectiveQuote,standardQuote} from './title-quotes.js?v=20261120quotes';
import {platformUrl} from './choice-summary.js?v=20261002proposals';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function viewingClock(view,now){
 const duration=Number(view?.runtimeSeconds),start=Date.parse(view?.startedAt);
 if(!(duration>0)||!Number.isFinite(start))return null;
 const elapsed=Math.max(0,(now-start)/1000),remaining=Math.max(0,Math.ceil(duration-elapsed));
 const h=Math.floor(remaining/3600),m=Math.floor(remaining%3600/60),s=remaining%60;
 return {remaining,text:[h,m,s].map(x=>String(x).padStart(2,'0')).join(':'),end:new Date(start+duration*1000)};
}
export function initViewing({app,state,call,deviceId,topbar,onHome}){
 let current=null,offset=0,pending=null,stopping=false;
 const screen=()=>app.querySelector('.viewing-screen');
 function clock(){
  if(!current||!screen())return;
  const info=viewingClock(current,Date.now()+offset),timer=screen().querySelector('[data-viewing-timer]'),end=screen().querySelector('[data-viewing-end]'),button=screen().querySelector('[data-viewing-stop]');
  timer.textContent=info?info.text:'Visione in corso';
  end.textContent=info?'Il tuo film finirà alle '+info.end.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})+'.':'Durata dell’episodio non disponibile: il conto alla rovescia non è attivo.';
  button.textContent=info?.remaining===0?'Torna alla homepage':'Interrompi visione';
 }
 function show(){
  if(!current)return false;
  const title=current.title||state.titles.find(t=>t.id===current.titleId)||{name:'Il tuo film'};
  const q=effectiveQuote(title,state.quotes),platform=state.platforms.find(p=>p.id===current.platformId);
  const link=platformUrl(state.links.find(l=>l.title_id===current.titleId&&l.platform_id===current.platformId)?.url);
  app.innerHTML='<div class="shell">'+topbar()+'<section class="viewing-screen" tabindex="-1"><p class="viewing-eyebrow">Visione in corso</p><h1>'+esc(title.name)+'</h1><blockquote class="film-quote">'+(q?(q.text.trim()?'«'+esc(q.text)+'»':''):esc(standardQuote))+'</blockquote>'+(q?.speaker||q?.source?'<p class="quote-attribution">'+esc(q.speaker||'')+(platformUrl(q.source)?' <a class="quote-source" href="'+esc(platformUrl(q.source))+'" target="_blank" rel="noopener noreferrer" aria-label="Fonte della citazione">↗</a>':'')+'</p>':'')+'<p data-viewing-end></p><div class="viewing-timer" data-viewing-timer role="timer" aria-label="Tempo rimanente" aria-live="off"></div><p class="hint">Tempo stimato dall’apertura del link. Le pause sulla piattaforma non vengono rilevate.</p>'+(link?'<a class="ghost-btn" href="'+esc(link)+'" target="_blank" rel="noopener noreferrer">Riapri '+esc(platform?.name||'la piattaforma')+' ↗</a>':'')+'<button class="ghost-btn" type="button" data-viewing-stop>Interrompi visione</button><p data-viewing-status role="status"></p></section></div>';
  clock();screen().focus({preventScroll:true});return true;
 }
 async function refresh(showPage=false){
  if(stopping)return current;
  if(!pending)pending=call('checkViewing',{deviceId:deviceId()}).then(data=>{
   current=data.viewing||null;const server=Date.parse(data.serverNow);if(Number.isFinite(server))offset=server-Date.now();
   if(!current&&screen())onHome();else clock();return current;
  }).finally(()=>{pending=null;});
  await pending;if(showPage&&current)show();return current;
 }
 async function stop(){
  if(stopping||!current)return;stopping=true;
  const button=screen()?.querySelector('[data-viewing-stop]');if(button)button.disabled=true;
  try{
   await call('stopViewing',{deviceId:deviceId(),selectionId:current.id});
   current=null;onHome();
  }catch{const node=screen()?.querySelector('[data-viewing-status]');if(node)node.textContent='Non riesco a registrare l’interruzione. La visione resta aperta: riprova.';}
  finally{stopping=false;if(button?.isConnected)button.disabled=false;}
 }
 app.addEventListener('click',e=>{if(e.target.closest('[data-viewing-stop]'))stop();});
 document.addEventListener('keydown',e=>{
  if(!screen()||e.target.closest('.topbar,input,textarea,select,.camera-panel')||app.querySelector('[data-overlay]'))return;
  if(e.key==='ArrowDown'){e.preventDefault();screen().querySelector('[data-viewing-stop]').focus();}
 });
 setInterval(clock,1000);
 setInterval(()=>{if(current&&document.visibilityState==='visible')refresh().catch(()=>{});},30000);
 window.addEventListener('pageshow',()=>{if(current)refresh().catch(()=>{});});
 return {refresh,show,isActive:()=>!!current};
}
