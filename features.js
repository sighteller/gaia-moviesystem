import { recommend } from './discovery.js?v=20261001e';
import { curator,esc,safeImage } from './curator-client.js?v=20261001e';
let config={},covers=[],selectedCover=null,searchPage=1,lastQuery='',totalPages=1,renderVersion=0;
export function initFeatures({app,state,loadData,startSession,call,deviceId,topbar}) {
  const shell=body=>`<div class="shell">${topbar()}<section class="curator">${body}</section></div>`;
  const message=(text,error=false)=>{const el=app.querySelector('#feature-message');if(el){el.textContent=text;el.classList.toggle('error',error);}};
  async function searchScreen(){
    const version=++renderVersion;state.session=null;if(state.currentAudio)state.currentAudio.pause();selectedCover=null;
    app.innerHTML=shell('<h1>Aggiungi un titolo</h1><p id="feature-message" role="status">Caricamento…</p>');
    config=await curator('status');if(version!==renderVersion||!app.querySelector('.curator'))return;
    app.innerHTML=shell(`<h1>Aggiungi un titolo</h1><p>Cerca il nome, riconosci il film o la serie e scegli la sua copertina.</p><form id="title-search"><label>Nome del film o della serie<input name="query" minlength="2" maxlength="120" value="${esc(lastQuery)}" required></label><button class="primary" ${config.tmdb?'':'disabled'}>Cerca</button></form><p id="feature-message" role="status">${config.tmdb?'':'La ricerca sarà disponibile dopo la configurazione di TMDb.'}</p><div id="search-results" class="results-grid"></div><div id="search-pages" class="small-actions"></div>`);
  }
  async function search(query,page=1){
    const version=++renderVersion;message('Cerco i titoli…');
    const d=await curator('search',{query,page});if(version!==renderVersion||!app.querySelector('#search-results'))return;
    lastQuery=query;searchPage=d.page;totalPages=d.total_pages;selectedCover=null;
    app.querySelector('#search-results').innerHTML=d.results.map(x=>`<button class="result-card" data-result='${esc(JSON.stringify(x))}'>${x.preview_url?`<img src="${safeImage(x.preview_url)}" alt="" loading="lazy">`:''}<span><strong>${esc(x.name)}</strong><small>${x.media_type==='series'?'Serie TV':'Film'} · ${esc(x.year||'Anno sconosciuto')}<br>${esc(x.original_title)}</small><span>${esc(x.overview.slice(0,210))}</span></span></button>`).join('');
    app.querySelector('#search-pages').innerHTML=`<button class="ghost-btn" data-feature="prev-page" ${searchPage<=1?'disabled':''}>Precedenti</button><span>Pagina ${searchPage} / ${Math.max(totalPages,1)}</span><button class="ghost-btn" data-feature="next-page" ${searchPage>=totalPages?'disabled':''}>Altri risultati</button>`;
    message(d.results.length?'Confronta anno, tipo e trama per scegliere il titolo corretto.':'Nessun risultato. Prova anche il titolo originale.');
  }
  async function candidates(x){
    const version=++renderVersion;selectedCover=null;
    app.innerHTML=shell('<h1>Scegli la copertina</h1><p id="feature-message" role="status">Recupero immagini…</p>');
    const d=await curator('candidates',{tmdbId:x.tmdb_id,mediaType:x.media_type});if(version!==renderVersion||!app.querySelector('.curator'))return;covers=d.candidates;
    const duplicate=state.titles.some(t=>t.tmdb_id===x.tmdb_id&&t.media_type===x.media_type);
    const main=d.metadata.poster_url||covers[0]?.url;
    app.innerHTML=shell(`<h1>${esc(d.metadata.name)}</h1><div class="new-title-layout"><div class="poster-column"><div class="poster-wrap">${main?`<img src="${safeImage(main)}" alt="${esc(d.metadata.name)}">`:''}</div><div class="cover-thumbnails" aria-label="Copertine alternative">${covers.map((c,i)=>`<button class="cover-thumb" data-new-cover="${esc(c.id)}" aria-label="Copertina alternativa ${i+1}" aria-pressed="false"><img src="${safeImage(c.preview_url)}" alt="" loading="lazy"></button>`).join('')}</div></div><div><p>${x.media_type==='series'?'Serie TV':'Film'} · ${esc(d.metadata.release_year||'Anno sconosciuto')}</p><p>${esc(d.metadata.overview)}</p><p id="feature-message" role="status">${duplicate?'Titolo già presente nel catalogo.':covers.length?'Clicca una delle cover sotto l’immagine principale per sceglierla.':'Nessuna cover soddisfa i requisiti di qualità.'}</p><form id="title-import"><label>Categoria<select name="category"><option value="film" ${d.metadata.genres.some(g=>g.id===16)?'':'selected'}>Film</option><option value="animation" ${d.metadata.genres.some(g=>g.id===16)?'selected':''}>Animazione</option></select></label><fieldset><legend>Dove è disponibile?</legend><p class="hint">Conferma tu la disponibilità sulle piattaforme.</p>${state.platforms.map(p=>`<label class="checkbox"><input name="platform" type="checkbox" value="${esc(p.id)}">${esc(p.name)}</label>`).join('')}</fieldset><button class="primary" id="import-button" ${duplicate?'data-duplicate="true"':''} disabled>Aggiungi al catalogo</button></form><button class="ghost-btn" data-feature="back-search">Cerca un altro titolo</button></div></div><p class="hint">This product uses the TMDB API but is not endorsed or certified by TMDB.</p><a href="https://www.themoviedb.org/" target="_blank" rel="noopener"><img class="tmdb-logo" src="https://files.readme.io/29c6fee-blue_short.svg" alt="TMDb"></a>`);
  }
  async function discover(){
    const version=++renderVersion;state.session=null;if(state.currentAudio)state.currentAudio.pause();
    app.innerHTML=shell('<h1>Scopri</h1><p id="feature-message" role="status">Preparo qualche idea…</p>');
    const {selections}=await call('discoveryHistory',{deviceId:deviceId()});if(version!==renderVersion||!app.querySelector('.curator'))return;
    const d=recommend(state.titles,state.links,state.selectedPlatformIds,selections);
    const cards=rows=>rows.map(({title:t,reason})=>`<article class="discovery-card">${(t.dvd_cover_url||t.custom_image_url||t.poster_url)?`<img src="${safeImage(t.dvd_cover_url||t.custom_image_url||t.poster_url)}" alt="" loading="lazy">`:''}<h3>${esc(t.name)}</h3><p>${esc(reason)}</p><button class="primary" data-discover-title="${esc(t.id)}">Guarda ↵</button></article>`).join('');
    app.innerHTML=shell(`<h1>Scopri</h1><p>Idee dal catalogo, sulle tue piattaforme selezionate. Rivedere un preferito è sempre una buona possibilità.</p><p class="hint">${d.hasHistory?'Usiamo le scelte su questo dispositivo: non sono conferme di visione né voti.':'Con le prime scelte potremo personalizzare questa pagina. Per ora esplora il catalogo.'}</p>${d.favorites.length?`<h2>Da riscoprire</h2><div class="discovery-grid">${cards(d.favorites)}</div>`:''}<h2>Altre idee</h2><div class="discovery-grid">${cards(d.ideas)}</div>${!d.favorites.length&&!d.ideas.length?'<p>Nessun titolo disponibile con questi filtri. Modifica i filtri.</p>':''}<p class="hint">I “No” di una sessione non escludono un film per sempre; i titoli cambiati non diventano automaticamente preferiti.</p>`);
  }
  app.addEventListener('click',async e=>{
    const b=e.target.closest('button');if(!b||b.disabled)return;
    try{
      if(b.dataset.action==='categories')++renderVersion;
      if(b.dataset.action==='add-title')return await searchScreen();
      if(b.dataset.action==='discover')return await discover();
      if(b.dataset.result)return await candidates(JSON.parse(b.dataset.result));
      if(b.dataset.newCover){selectedCover=b.dataset.newCover;const c=covers.find(x=>x.id===selectedCover);app.querySelector('.poster-wrap img').src=c.url;app.querySelectorAll('[data-new-cover]').forEach(x=>{const active=x.dataset.newCover===selectedCover;x.classList.toggle('selected',active);x.setAttribute('aria-pressed',String(active));});const ib=app.querySelector('#import-button');ib.disabled=!!ib.dataset.duplicate;return;}
      if(b.dataset.feature==='back-search')return await searchScreen();
      if(b.dataset.feature==='next-page')return await search(lastQuery,searchPage+1);
      if(b.dataset.feature==='prev-page')return await search(lastQuery,searchPage-1);
      if(b.dataset.discoverTitle){const t=state.titles.find(t=>t.id===b.dataset.discoverTitle);await startSession(t.category);state.index=state.filteredTitles.findIndex(x=>x.id===t.id);await call('touch',{sessionId:state.session.id,currentTitleId:t.id,history:[]});document.dispatchEvent(new CustomEvent('gaia-render-movie'));}
    }catch(err){message(err.message,true);}
  });
  app.addEventListener('submit',async e=>{
    if(!['title-search','title-import'].includes(e.target.id))return;
    e.preventDefault();const form=e.target;const data=new FormData(form);const button=form.querySelector('button');button.disabled=true;
    try{
      if(form.id==='title-search')await search(String(data.get('query')).trim());
      else{
        const platformIds=data.getAll('platform');if(!selectedCover||!platformIds.length)throw new Error('Scegli la cover e almeno una piattaforma.');
        await curator('import',{candidateId:selectedCover,category:data.get('category'),platformIds});
        await loadData();app.innerHTML=shell('<h1>Titolo aggiunto</h1><p>Il titolo e la cover sono nel catalogo Gaia.</p><button class="primary" data-action="add-title">Aggiungi un altro titolo</button>');
      }
    }catch(err){message(err.message,true);}finally{if(button.isConnected)button.disabled=form.id==='title-import'&&!selectedCover;}
  });
}
