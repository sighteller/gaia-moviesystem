import { recommend } from './discovery.js?v=20261001';
const SUPABASE='https://mahjewznwqvdgtdjtekc.supabase.co';
const CURATOR=SUPABASE+'/functions/v1/image-curator';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeImage=u=>{try{const x=new URL(u);return x.protocol==='https:'?esc(x.href):'';}catch{return '';}};
let accessToken='',config=null,selection=null,covers=[],selectedCover=null,searchPage=1,lastQuery='',totalPages=1;
async function request(action,payload={}) {
  const r=await fetch(CURATOR,{method:'POST',headers:{'Content-Type':'application/json',...(config?{apikey:config.publishableKey}:{}),...(accessToken?{Authorization:'Bearer '+accessToken}:{})},body:JSON.stringify({action,payload})});
  const data=await r.json();
  if(!r.ok) throw new Error(data.error||'Operazione non riuscita.');
  return data;
}
export function initFeatures({app,state,loadData,renderCategories,startSession,call,deviceId}) {
  const shell=body=>`<div class="shell"><div class="topbar"><div class="brand">Gaia <span>| Movie System</span></div><button class="ghost-btn" data-action="categories">Categorie</button></div><section class="curator">${body}</section></div>`;
  const message=(text,error=false)=>{const el=app.querySelector('#feature-message');if(el){el.textContent=text;el.classList.toggle('error',error);}};
  async function admin(){
    if(state.currentAudio) state.currentAudio.pause();
    state.session=null; selection=null; selectedCover=null;
    app.innerHTML=shell('<h1>Aggiungi un titolo</h1><p id="feature-message" role="status">Caricamento…</p>');
    config={publishableKey:'sb_publishable_dyl4lkOw6Qso8qSMYRGUAw_fP4v_oCf'};
    if(!accessToken){
      app.innerHTML=shell(`<h1>Aggiungi un titolo</h1><p>Accedi con il tuo account amministratore.</p><form id="admin-login"><label>Email<input name="email" type="email" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button class="primary">Accedi</button></form><p id="feature-message" role="status"></p><p class="hint">L’account deve essere abilitato dall’amministratore del progetto.</p>`);
    }else await searchScreen();
  }
  async function searchScreen(){
    Object.assign(config,await request('me'));
    app.innerHTML=shell(`<h1>Aggiungi un titolo</h1><p>1. Cerca · 2. Scegli il titolo · 3. Scegli la cover</p><form id="title-search"><label>Nome del film o della serie<input name="query" minlength="2" maxlength="120" value="${esc(lastQuery)}" required></label><button class="primary" ${config.tmdb?'':'disabled'}>Cerca</button></form><p id="feature-message" role="status">${config.tmdb?'':'La ricerca sarà disponibile dopo la configurazione di TMDb.'}</p><div id="search-results" class="results-grid"></div><div id="search-pages" class="small-actions"></div><button class="ghost-btn" data-feature="logout">Esci dall’amministrazione</button>`);
  }
  async function search(query,page=1){
    message('Cerco i titoli…');
    const d=await request('search',{query,page}); lastQuery=query;searchPage=d.page;totalPages=d.total_pages;
    selection=null;selectedCover=null;
    app.querySelector('#search-results').innerHTML=d.results.map(x=>`<button class="result-card" data-result='${esc(JSON.stringify(x))}'>${x.preview_url?`<img src="${safeImage(x.preview_url)}" alt="" loading="lazy">`:''}<span><strong>${esc(x.name)}</strong><small>${x.media_type==='series'?'Serie TV':'Film'} · ${esc(x.year||'Anno sconosciuto')}<br>${esc(x.original_title)}</small><span>${esc(x.overview.slice(0,210))}</span></span></button>`).join('');
    app.querySelector('#search-pages').innerHTML=`<button class="ghost-btn" data-feature="prev-page" ${searchPage<=1?'disabled':''}>Precedenti</button><span>Pagina ${searchPage} / ${Math.max(totalPages,1)}</span><button class="ghost-btn" data-feature="next-page" ${searchPage>=totalPages?'disabled':''}>Altri risultati</button>`;
    message(d.results.length?'Confronta anno, tipo e trama per scegliere il titolo corretto.':'Nessun risultato. Prova anche il titolo originale.');
  }
  async function candidates(x){
    selection=x;selectedCover=null;
    app.innerHTML=shell('<h1>Scegli la copertina</h1><p id="feature-message" role="status">Recupero immagini ad alta risoluzione…</p>');
    const d=await request('candidates',{tmdbId:x.tmdb_id,mediaType:x.media_type});covers=d.candidates;
    const duplicate=state.titles.some(t=>t.tmdb_id===x.tmdb_id&&t.media_type===x.media_type);
    app.innerHTML=shell(`<h1>${esc(d.metadata.name)}</h1><p>${x.media_type==='series'?'Serie TV':'Film'} · ${esc(d.metadata.release_year||'Anno sconosciuto')}</p><p>${esc(d.metadata.overview)}</p><p id="feature-message" role="status">${duplicate?'Titolo già presente nel catalogo.':covers.length?'Scegli una cover: almeno 1000 px di altezza, proporzioni verticali vicine al DVD.':'Nessuna cover soddisfa i requisiti di qualità. Il titolo non verrà aggiunto senza cover.'}</p><p class="hint">${d.warnings.map(esc).join(' ')}</p><div class="cover-grid">${covers.map(c=>`<button class="cover-card" data-cover="${esc(c.id)}" aria-pressed="false"><img src="${safeImage(c.preview_url)}" alt="Cover di ${esc(d.metadata.name)}" loading="lazy"><span>${c.provider==='tmdb'?'TMDb':'Fanart.tv'} · ${c.width} × ${c.height}<br>${esc(c.language||'Senza testo / lingua non indicata')} · ratio ${(c.width/c.height).toFixed(2)}</span></button>`).join('')}</div><form id="title-import"><label>Categoria<select name="category"><option value="film" ${d.metadata.genres.some(g=>g.id===16)?'':'selected'}>Film</option><option value="animation" ${d.metadata.genres.some(g=>g.id===16)?'selected':''}>Animazione</option></select></label><fieldset><legend>Dove è disponibile?</legend><p class="hint">Conferma tu la disponibilità; non viene verificata automaticamente.</p>${state.platforms.map(p=>`<label class="checkbox"><input name="platform" type="checkbox" value="${esc(p.id)}">${esc(p.name)}</label>`).join('')}</fieldset><button class="primary" id="import-button" ${duplicate?'data-duplicate="true"':''} disabled>Aggiungi al catalogo</button></form><button class="ghost-btn" data-feature="back-search">Cerca un altro titolo</button><p class="hint">Immagini e dati: TMDb / Fanart.tv. This product uses the TMDB API but is not endorsed or certified by TMDB.</p><a href="https://www.themoviedb.org/" target="_blank" rel="noopener"><img class="tmdb-logo" src="https://files.readme.io/29c6fee-blue_short.svg" alt="TMDb"></a>`);
  }
  async function discover(){
    state.session=null;if(state.currentAudio)state.currentAudio.pause();
    app.innerHTML=shell('<h1>Scopri</h1><p id="feature-message" role="status">Preparo qualche idea…</p>');
    const {selections}=await call('discoveryHistory',{deviceId:deviceId()});
    const d=recommend(state.titles,state.links,state.selectedPlatformIds,selections);
    const cards=rows=>rows.map(({title:t,reason})=>`<article class="discovery-card">${(t.dvd_cover_url||t.custom_image_url||t.poster_url)?`<img src="${safeImage(t.dvd_cover_url||t.custom_image_url||t.poster_url)}" alt="" loading="lazy">`:''}<h3>${esc(t.name)}</h3><p>${esc(reason)}</p><button class="primary" data-discover-title="${esc(t.id)}">Scegli questo</button></article>`).join('');
    app.innerHTML=shell(`<h1>Scopri</h1><p>Idee dal catalogo, sulle tue piattaforme selezionate. Rivedere un preferito è sempre una buona possibilità.</p><p class="hint">${d.hasHistory?'Usiamo le scelte su questo dispositivo: non sono conferme di visione né voti.':'Con le prime scelte potremo personalizzare questa pagina. Per ora esplora il catalogo.'}</p>${d.favorites.length?`<h2>Da riscoprire</h2><div class="discovery-grid">${cards(d.favorites)}</div>`:''}<h2>Altre idee</h2><div class="discovery-grid">${cards(d.ideas)}</div>${!d.favorites.length&&!d.ideas.length?'<p>Nessun titolo disponibile con questi filtri. Modifica le piattaforme dalla pagina iniziale.</p>':''}<p class="hint">Prima versione senza AI. I “No” di una sessione non escludono un film per sempre; i titoli cambiati non diventano automaticamente preferiti.</p>`);
  }
  app.addEventListener('click',async e=>{
    const b=e.target.closest('button');if(!b||b.disabled)return;
    try{
      if(b.dataset.action==='admin')return await admin();
      if(b.dataset.action==='discover')return await discover();
      if(b.dataset.result)return await candidates(JSON.parse(b.dataset.result));
      if(b.dataset.cover){selectedCover=b.dataset.cover;app.querySelectorAll('[data-cover]').forEach(c=>{c.classList.toggle('selected',c.dataset.cover===selectedCover);c.setAttribute('aria-pressed',String(c.dataset.cover===selectedCover));});const ib=app.querySelector('#import-button');ib.disabled=!!ib.dataset.duplicate;return;}
      if(b.dataset.feature==='logout'){await fetch(SUPABASE+'/auth/v1/logout',{method:'POST',headers:{apikey:config.publishableKey,Authorization:'Bearer '+accessToken}});accessToken='';renderCategories();return;}
      if(b.dataset.feature==='back-search')return await searchScreen();
      if(b.dataset.feature==='next-page')return await search(lastQuery,searchPage+1);
      if(b.dataset.feature==='prev-page')return await search(lastQuery,searchPage-1);
      if(b.dataset.discoverTitle){const t=state.titles.find(t=>t.id===b.dataset.discoverTitle);await startSession(t.category);state.index=state.filteredTitles.findIndex(x=>x.id===t.id);await call('touch',{sessionId:state.session.id,currentTitleId:t.id,history:[]});document.dispatchEvent(new CustomEvent('gaia-render-movie'));}
    }catch(err){message(err.message,true);}
  });
  app.addEventListener('submit',async e=>{
    if(!['admin-login','title-search','title-import'].includes(e.target.id))return;
    e.preventDefault();const form=e.target;const data=new FormData(form);const button=form.querySelector('button');button.disabled=true;
    try{
      if(form.id==='admin-login'){
        const r=await fetch(SUPABASE+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:config.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({email:data.get('email'),password:data.get('password')})});
        const d=await r.json();form.reset();
        if(!r.ok)throw new Error('Accesso non riuscito. Verifica email e password.');
        accessToken=d.access_token;
        try{await searchScreen();}catch(err){accessToken='';throw err;}
      }else if(form.id==='title-search'){await search(String(data.get('query')).trim());}
      else{
        const platformIds=data.getAll('platform');
        if(!selectedCover||!platformIds.length)throw new Error('Scegli la cover e almeno una piattaforma.');
        await request('import',{candidateId:selectedCover,category:data.get('category'),platformIds});
        await loadData();app.innerHTML=shell('<h1>Titolo aggiunto</h1><p>Il titolo e la cover sono nel catalogo Gaia.</p><button class="primary" data-action="admin">Aggiungi un altro titolo</button>');
      }
    }catch(err){message(err.message,true);}finally{if(button.isConnected)button.disabled=form.id==='title-import'&&!selectedCover;}
  });
}
