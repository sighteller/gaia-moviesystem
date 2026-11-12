const normalize=value=>String(value||'').normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('it').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const imageUrl=value=>{try{const u=new URL(value);return u.protocol==='https:'?u.href:'';}catch{return '';}};
export function searchCatalog(titles,links,platformIds,query){
 const q=normalize(query);if(!q)return [];
 const tokens=q.split(' '),platforms=new Set(platformIds),available=new Set(links.filter(l=>l.active!==false&&platforms.has(l.platform_id)).map(l=>l.title_id));
 return titles.filter(t=>t.active!==false&&!['pending','rejected'].includes(t.request_status)&&!t.series_id&&available.has(t.id)).map(t=>{
  const names=[t.name,t.original_title,t.canonical_title].filter(Boolean).map(normalize);
  const scores=names.filter(n=>tokens.every(token=>n.includes(token))).map(n=>n===q?0:n.startsWith(q)?1:n.includes(q)?2:3);
  return {title:t,score:scores.length?Math.min(...scores):Infinity};
 }).filter(x=>Number.isFinite(x.score)).sort((a,b)=>a.score-b.score||a.title.name.localeCompare(b.title.name,'it')).map(x=>x.title);
}
export function initCatalogSearch({app,state,topbar,startSession}){
 let results=[],selected=0,opening=false;
 const screen=()=>app.querySelector('.catalog-search');
 function highlight(index,scroll=false){
  if(!results.length)return;selected=Math.max(0,Math.min(index,results.length-1));
  const cards=[...app.querySelectorAll('[data-search-title]')];
  cards.forEach((card,i)=>{card.classList.toggle('selected',i===selected);card.setAttribute('aria-selected',String(i===selected));});
  const input=app.querySelector('#catalog-query');input?.setAttribute('aria-activedescendant','catalog-result-'+selected);
  if(scroll)cards[selected]?.scrollIntoView({block:'nearest'});
 }
 function update(){
  const input=app.querySelector('#catalog-query');
  results=searchCatalog(state.titles,state.links,state.selectedPlatformIds,input.value);selected=0;
  const queried=!!input.value.trim();
  app.querySelector('#catalog-search-status').textContent=!queried?'Scrivi il nome di un film o di una serie.':results.length?results.length+(results.length===1?' titolo trovato.':' titoli trovati.'):'Nessun titolo trovato sulle piattaforme selezionate. Puoi modificarle da Filtri.';
  app.querySelector('#catalog-search-results').innerHTML=results.map((t,i)=>{const image=imageUrl(t.dvd_cover_url||t.custom_image_url||t.poster_url);return '<button type="button" role="option" tabindex="-1" id="catalog-result-'+i+'" data-search-title="'+esc(t.id)+'" aria-selected="'+(i===0)+'" class="catalog-search-card '+(i===0?'selected':'')+'">'+(image?'<img src="'+esc(image)+'" alt="" loading="lazy">':'<span class="search-poster-placeholder" aria-hidden="true">🎬</span>')+'<strong>'+esc(t.name)+'</strong><small>'+(t.media_type==='series'?'Serie TV':'Film')+(t.release_year?' · '+esc(t.release_year):'')+'</small></button>';}).join('');
  input.setAttribute('aria-expanded',String(results.length>0));
  if(results.length)highlight(0);else input.removeAttribute('aria-activedescendant');
 }
 function show(){
  state.session=null;if(state.currentAudio)state.currentAudio.pause();opening=false;
  app.innerHTML='<div class="shell">'+topbar()+'<section class="curator catalog-search"><h1>Cerca nel catalogo</h1><label for="catalog-query">Film o serie</label><input id="catalog-query" type="search" autocomplete="off" placeholder="Che cosa vuoi vedere?" role="combobox" aria-autocomplete="list" aria-controls="catalog-search-results" aria-expanded="false"><p class="hint">Cerca per titolo italiano o originale, sulle piattaforme selezionate. Usa le frecce per scegliere e Invio per aprire.</p><p id="catalog-search-status" role="status"></p><div id="catalog-search-results" class="catalog-search-grid" role="listbox" aria-label="Risultati della ricerca"></div></section></div>';
  update();app.querySelector('#catalog-query').focus();
 }
 async function open(index){
  if(opening||!results[index])return;opening=true;const title=results[index];
  try{await startSession(title.category,title.id);}finally{opening=false;}
 }
 app.addEventListener('click',e=>{
  if(e.target.closest('[data-action="catalog-search"]')){show();return;}
  const card=e.target.closest('[data-search-title]');if(card&&screen())open(results.findIndex(t=>t.id===card.dataset.searchTitle));
 });
 app.addEventListener('input',e=>{if(e.target.id==='catalog-query')update();});
 app.addEventListener('pointerover',e=>{const card=e.target.closest('[data-search-title]');if(card&&screen())highlight(results.findIndex(t=>t.id===card.dataset.searchTitle));});
 app.addEventListener('keydown',e=>{
  if(!screen()||e.isComposing||!(e.target.id==='catalog-query'||e.target.closest('[data-search-title]')))return;
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter'].includes(e.key))return;
  e.preventDefault();e.stopPropagation();if(!results.length)return;
  if(e.key==='Enter'){if(!e.repeat)open(selected);return;}
  const cards=[...app.querySelectorAll('[data-search-title]')];
  const columns=cards.filter(card=>card.offsetTop===cards[0].offsetTop).length||1;
  highlight(selected+(e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:e.key==='ArrowDown'?columns:-columns),true);
 });
}
