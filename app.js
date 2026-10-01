import { effectiveQuote, standardQuote } from './title-quotes.js?v=20261002editor';
import { recordConsultation, choiceMessage, platformUrl } from './choice-summary.js?v=20261001i';
import { mountCoverPicker } from './cover-picker.js?v=20261001i';
import { initFeatures } from './features.js?v=20261001i';
import { mountJellyfinSync } from './jellyfin-sync.js?v=20261001j';
const API_URL = 'https://mahjewznwqvdgtdjtekc.supabase.co/functions/v1/gaia-api';

const app = document.querySelector('#app');
const state = {
  titles: [], platforms: [], links: [], quotes: [],
  category: null, filteredTitles: [], index: 0,
  selectedPlatformIds: JSON.parse(localStorage.getItem('gaia_platforms') || 'null'),
  muted: localStorage.getItem('gaia_muted') === '1',
  session: null, history: [], confirmPlatform: null, currentAudio: null, navigating:false, pendingMode:null,
  consultation:{titleIds:[],steps:0,lastTitleId:null}
};

function deviceId() {
  let id = localStorage.getItem('gaia_device_id');
  if (!id) { id = crypto.randomUUID(); localStorage.setItem('gaia_device_id', id); }
  return id;
}

async function call(action, payload = {}) {
  const r = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload })
  });
  const data = await r.json();
  if (!r.ok || data.error) throw new Error(data.error || 'Errore API');
  return data;
}

function escapeHtml(x) { return String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function svgIcon(paths) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`; }
function logo() { return `<button class="brand" data-action="home" aria-label="Home"><img src="assets/gaia-logo.svg" alt="Gaia · Movie System" width="235" height="30"></button>`; }
function muteButton() { return `<button class="icon-btn ${state.muted?'active':''}" data-action="mute" aria-label="${state.muted?'Attiva audio':'Disattiva audio'}" aria-pressed="${state.muted}">${svgIcon('<path d="M11 5 6 9H3v6h3l5 4z"/>'+(state.muted?'<path d="m16 9 5 6m0-6-5 6"/>':'<path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>'))}</button>`; }
function topbar() { return `<div class="topbar">${logo()}<div class="small-actions"><button class="ghost-btn" data-action="filters">Filtri</button><button class="ghost-btn discover-btn" data-action="discover"><svg viewBox="0 0 40.13 40.93" fill="currentColor" aria-hidden="true"><path d="M27.24,28.04c-.23.91-.89,1.44-1.71,1.46-.75.02-1.61-.42-1.82-1.27-1.42-5.79-5.94-10.31-11.72-11.73-.82-.2-1.26-1.05-1.25-1.77s.5-1.52,1.31-1.71c5.72-1.38,10.18-5.79,11.59-11.53C23.86.59,24.54,0,25.43,0s1.59.57,1.81,1.46c1.38,5.64,5.68,10.06,11.32,11.47.91.23,1.5.79,1.57,1.71.06.81-.44,1.67-1.34,1.89-5.67,1.43-10.1,5.76-11.55,11.5Z"/><path d="M10.9,40.11c-.14.58-.74.85-1.18.82-.55-.04-1.01-.39-1.16-.97-.95-3.74-3.82-6.64-7.57-7.61C.37,32.18,0,31.74,0,31.14c0-.65.43-1.05,1.08-1.23,3.73-.98,6.55-3.86,7.48-7.6.15-.59.57-.97,1.14-.99s1.09.33,1.24.96c.94,3.8,3.83,6.69,7.61,7.67.51.13.88.55.95,1s-.14,1.15-.7,1.28c-3.9.96-6.93,3.91-7.92,7.87Z"/></svg><span>Scopri</span></button><button class="icon-btn add-title-btn" data-action="add-title" aria-label="Aggiungi titolo" title="Aggiungi titolo">${svgIcon('<path d="M12 5v14M5 12h14"/>')}</button><button class="icon-btn" data-action="stats" aria-label="Statistiche">${svgIcon('<path d="M4 20V10m8 10V4m8 16v-7M2 20h20"/>')}</button>${muteButton()}</div></div>`; }

async function loadData() {
  const data = await call('catalog');
  state.titles = data.titles || [];
  try { state.quotes = JSON.parse(localStorage.getItem('gaia_quote_edits') || '[]'); } catch { state.quotes = []; }
  state.platforms = (data.platforms || []).filter(p => ['jellyfin','netflix','disney-plus','prime-video','rai-play'].includes(p.slug));
  const allowedIds = new Set(state.platforms.map(p=>p.id));
  if (Array.isArray(state.selectedPlatformIds)) state.selectedPlatformIds=state.selectedPlatformIds.filter(id=>allowedIds.has(id));
  state.links = data.links || [];
  if (!Array.isArray(state.selectedPlatformIds) || !state.selectedPlatformIds.length) {
    state.selectedPlatformIds = state.platforms.map(p => p.id);
    savePlatformFilter();
  }
}

function savePlatformFilter(){ localStorage.setItem('gaia_platforms', JSON.stringify(state.selectedPlatformIds)); }

async function checkInterruptedViewing() {
  await call('checkViewing', { deviceId: deviceId() });
}

async function resumeSessionIfAny() {
  const { session } = await call('resume', { deviceId: deviceId() });
  if (!session) return false;
  state.session = session;
  state.history = session.navigation_history || [];
  state.category = session.category;
  state.selectedPlatformIds = session.enabled_platform_ids || state.selectedPlatformIds;
  buildFilteredTitles();
  const idx = state.filteredTitles.findIndex(t => t.id === session.current_title_id);
  state.index = idx >= 0 ? idx : 0;
  renderMovie();
  return true;
}

function homeCarousel(){
  const films=state.titles.filter(t=>t.media_type==='movie'&&/^https:\/\//.test(titleImage(t))).slice(0,5);
  return `<div class="home-carousel" aria-hidden="true">${films.map((t,i)=>`<div class="home-carousel-card" style="--slot:${i}"><img src="${escapeHtml(titleImage(t))}" alt="" draggable="false"></div>`).join('')}</div>`;
}

function renderIntro(){
  state.category=null;state.session=null;
  if(state.currentAudio){state.currentAudio.pause();state.currentAudio=null;}
  app.innerHTML=`<div class="shell">${topbar()}<section class="intro-screen"><h1 class="intro-greeting"><span data-typewriter>Ciao Gaia!</span><span class="intro-question"><span data-typewriter>che</span>${homeCarousel()}<span data-typewriter>film</span></span><span data-typewriter>vediamo oggi?</span></h1><button class="intro-start" data-action="categories">Cominciamo <svg class="return-glyph" aria-hidden="true" viewBox="0 0 20.35 16.2"><path fill="currentColor" d="M6.07,16.2L0,10.23l6.07-5.97v11.94ZM4.13,11.68v-2.89h16.16v2.89H4.13ZM12.6,2.93V0h7.69v2.93h-7.69ZM17.46,11.68V0h2.89v11.68h-2.89Z"/></svg></button><a class="intro-quotes" href="citazioni.html">Citazioni dei film</a></section></div>`;
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
    let delay=0;
    app.querySelectorAll('[data-typewriter]').forEach(line=>{
      const text=line.textContent;
      line.innerHTML=`<span class="typing-space" aria-hidden="true">${text}</span><span class="typing-text">${[...text].map((char,i)=>`<span style="animation-delay:${delay+i*45}ms">${char===' '?'&nbsp;':char}</span>`).join('')}</span>`;
      delay+=text.length*45+100;
    });
  }
}

function renderCategories(){
  state.category = null; state.session = null;
  if (state.currentAudio) { state.currentAudio.pause(); state.currentAudio = null; }
  app.innerHTML = `<div class="shell">${topbar()}<div class="hero-center category-screen"><div class="category-grid">
    <button class="category-card" data-category="animation"><h2>Animazione</h2><p>Film e serie animate</p></button>
    <button class="category-card" data-category="film"><h2>Film</h2><p>Film e serie con persone reali</p></button>
  </div></div></div>`;
  chooseCategory(document.querySelector('[data-category="animation"]'),true);
}

function chooseCategory(button,focus=false){
  if(!button)return;
  document.querySelectorAll('.category-card').forEach(b=>b.classList.toggle('preselected',b===button));
  if(focus)button.focus({preventScroll:true});
}
app.addEventListener('pointerover',e=>{const b=e.target.closest('.category-card');if(b)chooseCategory(b,true);});
app.addEventListener('focusin',e=>{const b=e.target.closest('.category-card');if(b)chooseCategory(b);});

function renderFilters(){
  const chips = state.platforms.map(p => `<button class="chip ${state.selectedPlatformIds.includes(p.id)?'selected':''}" data-platform-filter="${p.id}">${escapeHtml(p.name)}</button>`).join('');
  app.insertAdjacentHTML('beforeend', `<div class="platform-panel" data-overlay="filters"><div class="platform-box"><h2>Filtri</h2><p>Mostra solo i titoli disponibili su almeno una delle piattaforme selezionate.</p><div class="chips">${chips}</div><div id="jellyfin-sync-panel"></div><button class="ghost-btn" data-action="close-filters">Fatto</button></div></div>`);
  mountJellyfinSync(app.querySelector('#jellyfin-sync-panel'),loadData);
}

function buildFilteredTitles(){
  const allowed = new Set(state.links.filter(l => state.selectedPlatformIds.includes(l.platform_id)).map(l => l.title_id));
  state.filteredTitles = state.titles.filter(t => t.category === state.category && allowed.has(t.id));
}

async function startSession(category,titleId=null){
  state.category = category; buildFilteredTitles(); state.index = Math.max(0,state.filteredTitles.findIndex(t=>t.id===titleId));
  if (!state.filteredTitles.length) { renderEmpty(); return; }
  const { session } = await call('start', {
    deviceId: deviceId(), category,
    enabledPlatformIds: state.selectedPlatformIds,
    currentTitleId: state.filteredTitles[state.index].id
  });
  state.session = session; state.history = []; state.consultation={titleIds:[],steps:0,lastTitleId:null}; renderMovie();
}

function currentTitle(){ return state.filteredTitles[state.index]; }
function titleImage(t){ return t.dvd_cover_url || t.custom_image_url || t.poster_url || ''; }
function renderPoster(t){ const url = titleImage(t); return url ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(t.name)}">` : `<div class="poster-placeholder">${escapeHtml(t.name)}</div>`; }

function movieCopy(t){return `<h1>${escapeHtml(t.name)}</h1><div class="movie-meta">${t.media_type==='series'?'Serie TV':'Film'}${t.release_year?' · '+t.release_year:''}</div>`;}
function movieNavigation(){return `<div class="navigation-arrows"><button class="ghost-btn arrow-btn" data-action="previous" aria-label="Titolo precedente" ${state.history.length?'':'disabled'}>←</button><button class="ghost-btn arrow-btn" data-action="next" aria-label="No, titolo successivo">→</button></div><button class="watch-btn" data-action="watch">Guarda <span aria-hidden="true">⏎</span></button><p class="navigation-status" role="status"></p>`;}
function renderMovie(){
  const t = currentTitle(); if (!t) return renderEmpty();
  state.consultation=recordConsultation(state.consultation,t.id);
  app.innerHTML = `<div class="shell movie-shell">${topbar()}<div class="movie-stage" tabindex="-1">
    <div class="poster-column"><div class="poster-wrap">${renderPoster(t)}</div><div class="cover-options"></div></div>
    <div class="movie-info"><div class="movie-copy">${movieCopy(t)}</div><div class="movie-navigation">${movieNavigation()}</div></div>
  </div></div>`;
  mountCoverPicker(app.querySelector('.cover-options'),t);
  app.querySelector('.movie-stage').focus({preventScroll:true});
  playAudio(t);
}
async function movieMotion(stage,direction,entering){
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const parts=[stage.querySelector('.poster-column'),stage.querySelector('.movie-copy')];
  await Promise.all(parts.map((element,i)=>element.animate(
    entering?[{transform:`translateX(${direction*(i?120:240)}px)`,opacity:0},{transform:'translateX(0)',opacity:1}]:[{transform:'translateX(0)',opacity:1},{transform:`translateX(${-direction*(i?90:180)}px)`,opacity:0}],
    {duration:entering?(i?480:420):220,easing:'cubic-bezier(.22,.7,.2,1)',fill:'forwards'}).finished.catch(()=>{})));
}
async function refreshMovie(stage,direction){
  await movieMotion(stage,direction,false);
  if(!stage.isConnected)return;
  const t=currentTitle();
  const posterColumn=stage.querySelector('.poster-column');
  posterColumn.innerHTML=`<div class="poster-wrap">${renderPoster(t)}</div><div class="cover-options"></div>`;
  stage.querySelector('.movie-copy').innerHTML=movieCopy(t);
  stage.querySelector('[data-action="previous"]').disabled=!state.history.length;
  state.consultation=recordConsultation(state.consultation,t.id);
  mountCoverPicker(stage.querySelector('.cover-options'),t);playAudio(t);
  await movieMotion(stage,direction,true);
  for(const part of [posterColumn,stage.querySelector('.movie-copy')])part.getAnimations().forEach(a=>a.cancel());
}

function playAudio(t){
  if (state.currentAudio) { state.currentAudio.pause(); state.currentAudio = null; }
  if (state.muted || !t.audio_url) return;
  const a = new Audio(t.audio_url); state.currentAudio = a; a.play().catch(()=>{});
}

async function touchSession(titleId=currentTitle()?.id,history=state.history){
  if(!state.session)return;
  await call('touch',{sessionId:state.session.id,currentTitleId:titleId,history});
}
async function changeMovie(direction,recordNo=true){
  if(state.navigating||!state.session||(direction<0&&!state.history.length))return;
  const stage=app.querySelector('.movie-stage');
  const sessionId=state.session.id;
  const button=stage?.querySelector(`[data-action="${direction>0?'next':'previous'}"]`);
  button?.classList.add('navigation-flash');setTimeout(()=>button?.classList.remove('navigation-flash'),600);
  state.navigating=true;
  try{
    const history=[...state.history];let index;
    if(direction>0){
      if(recordNo)await call('reject',{sessionId,titleId:currentTitle().id});
      history.push(currentTitle().id);index=(state.index+1)%state.filteredTitles.length;
    }else{
      const id=history.pop();index=state.filteredTitles.findIndex(t=>t.id===id);
      if(index<0)return;
      await call('unreject',{sessionId,titleId:id});
    }
    if(state.session?.id!==sessionId||!stage?.isConnected)return;
    await touchSession(state.filteredTitles[index].id,history);
    if(state.session?.id!==sessionId||!stage.isConnected)return;
    state.history=history;state.index=index;
    await refreshMovie(stage,direction);
  }catch(err){if(stage?.isConnected)stage.querySelector('.navigation-status').textContent='Non riesco a cambiare titolo. Riprova.';console.error(err);}
  finally{state.navigating=false;}
}
function nextMovie(recordNo=true){return changeMovie(1,recordNo);}
function previousMovie(){return changeMovie(-1);}

function availablePlatformsForTitle(t){
  const ids = state.links.filter(l => l.title_id === t.id && state.selectedPlatformIds.includes(l.platform_id)).map(l => l.platform_id);
  return state.platforms.filter(p => ids.includes(p.id));
}

async function renderConfirm(){
  if(state.navigating)return;
  const stage=app.querySelector('.movie-stage');if(!stage)return;
  if(stage.dataset.confirming)return;
  const watch=stage.querySelector('.watch-btn');
  state.navigating=true;watch?.classList.add('navigation-flash');
  await new Promise(resolve=>setTimeout(resolve,220));
  state.navigating=false;
  if(!stage.isConnected)return;
  stage.dataset.confirming='true';
  stage.querySelector('.movie-navigation').innerHTML='<p class="confirmation-question">Sei sicura?</p><div class="confirm-navigation navigation-arrows"><button class="ghost-btn arrow-btn" data-action="back-to-movie" aria-label="Torna al film">←</button><button class="ghost-btn confirm-btn preselected" data-action="confirm-title">Conferma</button></div>';
}
function cancelConfirm(){
  const stage=app.querySelector('.movie-stage');if(!stage)return;
  delete stage.dataset.confirming;stage.querySelector('.movie-navigation').innerHTML=movieNavigation();
  stage.focus({preventScroll:true});
}
function renderPlatformSummary(mode,savedPlatform=null){
  state.pendingMode=mode;
  const t=currentTitle();const ps=availablePlatformsForTitle(t);const count=state.consultation.titleIds.length;
  const link=savedPlatform?state.links.find(l=>l.title_id===t.id&&l.platform_id===savedPlatform.id):null;
  const url=platformUrl(link?.url);
  const quote=effectiveQuote(t,state.quotes);
  app.innerHTML=`<div class="shell">${topbar()}<div class="hero-center"><div class="empty choice-result"><h2 class="film-quote">${quote?`«${escapeHtml(quote.text)}»`:escapeHtml(standardQuote)}</h2><p class="quote-attribution">${quote?.speaker?`${escapeHtml(quote.speaker)} · `:''}${escapeHtml(t.name)}${quote?.source?` <a class="quote-source" href="${escapeHtml(quote.source)}" target="_blank" rel="noopener noreferrer" aria-label="Fonte della citazione">↗</a>`:''}</p><p class="choice-counter">${escapeHtml(choiceMessage(count))}</p><h3>Dove lo guardiamo?</h3><div class="platform-list">${ps.map((p,i)=>`<button class="platform-option ${savedPlatform?.id===p.id?'selected':''}" data-choice-platform="${p.id}" ${savedPlatform?'disabled':''}>${escapeHtml(p.name)} <kbd>${i+1}</kbd></button>`).join('')}</div><p class="choice-status" role="status"></p>${savedPlatform?(url?`<a class="ghost-btn platform-launch" href="${escapeHtml(url)}">Apri su ${escapeHtml(savedPlatform.name)} ⏎</a>`:'<p>Il collegamento diretto a questa piattaforma non è ancora configurato.</p>'):''}<button class="ghost-btn" data-action="home">Torna a Gaia</button></div></div></div>`;
}

function renderMode(){
  app.innerHTML = `<div class="shell">${topbar()}<div class="hero-center"><div><h1 style="font-size:clamp(42px,6vw,76px);letter-spacing:-.05em;margin:0 0 28px">Come è avvenuta la scelta?</h1><div class="mode-grid">
    <button class="mode-card preselected" data-mode="unlimited"><h2>Illimitata</h2><p>Nessun limite imposto alla scelta.</p></button>
    <button class="mode-card" data-mode="limited"><h2>Limitata</h2><p>Scelta fra pochi titoli.</p></button>
  </div></div></div></div>`;
}

async function finalize(mode){
  const sessionId=state.session.id;
  const t = currentTitle();
  const p = state.platforms.find(x => x.id === state.confirmPlatform);
  const now = new Date();
  const expected = (t.media_type === 'movie' && t.runtime_minutes) ? new Date(now.getTime() + t.runtime_minutes * 60000) : null;
  await call('finalize', {
    sessionId,
    deviceId: deviceId(),
    titleId: t.id,
    platformId: p.id,
    mode,
    expectedEndAt: expected?.toISOString() || null
  });
  if(state.session?.id!==sessionId)return;
  state.session = null;
  renderPlatformSummary(mode,p);

}

async function renderStats(){
  const { rows } = await call('stats');
  app.innerHTML = `<div class="shell">${topbar()}<div style="width:min(1100px,100%);margin:0 auto"><h1 style="font-size:clamp(44px,6vw,76px);letter-spacing:-.05em;margin:10px 0 26px">Statistiche</h1><div style="display:grid;gap:12px">${rows.map(r => `<div style="display:grid;grid-template-columns:minmax(220px,2fr) repeat(5,minmax(80px,1fr));gap:12px;align-items:center;padding:18px 20px;border:1px solid #30362b;border-radius:16px;background:#1a1d17"><strong>${escapeHtml(r.title.name)}</strong><span>Scelto ${r.chosen}</span><span>No ${r.no}</span><span>Limitata ${r.limited}</span><span>Illimitata ${r.unlimited}</span><span>Cambiato ${r.changed}</span></div>`).join('')}</div></div></div>`;
}

function renderEmpty(){
  app.innerHTML = `<div class="shell">${topbar()}<div class="hero-center"><div class="empty"><h2>Nessun titolo disponibile</h2><p>Modifica il filtro delle piattaforme o scegli un'altra categoria.</p><button class="primary" data-action="categories">Torna alle categorie</button></div></div></div>`;
}

function toggleMute(){
  state.muted = !state.muted;
  localStorage.setItem('gaia_muted', state.muted ? '1' : '0');
  if (state.muted && state.currentAudio) state.currentAudio.pause();
  app.querySelectorAll('[data-action="mute"]').forEach(b=>b.outerHTML=muteButton());
  if (!state.muted && document.querySelector('.movie-stage')) playAudio(currentTitle());
}

app.addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.disabled) return;
  if (b.dataset.action === 'previous') return previousMovie();
  if (b.dataset.action === 'next') return nextMovie(true);
  if (b.dataset.action === 'back-to-movie') return cancelConfirm();
  if (b.dataset.action === 'confirm-title') return renderMode();
  if (b.dataset.action === 'home') return renderIntro();
  if (b.dataset.action === 'watch') return renderConfirm();
  if (b.dataset.action === 'mute') return toggleMute();
  if (b.dataset.action === 'filters') return renderFilters();
  if (b.dataset.action === 'stats') return renderStats();
  if (b.dataset.action === 'close-filters') { document.querySelector('[data-overlay="filters"]')?.remove(); return; }
  if (b.dataset.platformFilter) {
    const id = b.dataset.platformFilter;
    const i = state.selectedPlatformIds.indexOf(id);
    if (i >= 0) state.selectedPlatformIds.splice(i, 1); else state.selectedPlatformIds.push(id);
    savePlatformFilter(); b.classList.toggle('selected'); return;
  }
  if (b.dataset.category) return startSession(b.dataset.category);
  if (b.dataset.action === 'categories') return renderCategories();
  if(b.dataset.mode)return renderPlatformSummary(b.dataset.mode);
  if(b.dataset.choicePlatform&&state.session){
    state.confirmPlatform=b.dataset.choicePlatform;
    app.querySelectorAll('[data-choice-platform]').forEach(x=>x.disabled=true);
    try{await finalize(state.pendingMode);}catch(err){app.querySelectorAll('[data-choice-platform]').forEach(x=>x.disabled=false);const status=app.querySelector('.choice-status');if(status)status.textContent='Non riesco a salvare la scelta. Riprova.';console.error(err);}
    return;
  }
});

for(const event of ['pointerover','focusin'])document.addEventListener(event,e=>{
  const mode=e.target.closest('.mode-card');
  if(mode)app.querySelectorAll('.mode-card').forEach(b=>b.classList.toggle('preselected',b===mode));
});
document.addEventListener('keydown', async e => {
  if (e.target.closest('input,textarea,select,form')) return;
  if(document.querySelector('.intro-screen')&&!document.querySelector('[data-overlay]')&&(e.code==='Space'||e.key==='Enter')&&(!e.target.closest('button')||e.target.closest('.intro-start'))){e.preventDefault();if(!e.repeat)renderCategories();return;}
  const categories=[...document.querySelectorAll('.category-card')];
  if(categories.length&&!document.querySelector('[data-overlay]')){
    const selected=categories.findIndex(b=>b.classList.contains('preselected'));
    if(['ArrowRight','ArrowLeft'].includes(e.key)){e.preventDefault();chooseCategory(categories[(selected+(e.key==='ArrowRight'?1:-1)+categories.length)%categories.length],true);return;}
    if(e.key==='Enter'&&(e.target.closest('.category-card')||!e.target.closest('button'))){e.preventDefault();categories[Math.max(selected,0)].click();return;}
  }
  const modes=[...app.querySelectorAll('.mode-card')];
  if(modes.length&&!app.querySelector('[data-overlay]')){
    const selected=Math.max(0,modes.findIndex(b=>b.classList.contains('preselected')));
    if(['ArrowRight','ArrowLeft'].includes(e.key)){
      e.preventDefault();const next=modes[(selected+1)%modes.length];
      modes.forEach(b=>b.classList.toggle('preselected',b===next));next.focus({preventScroll:true});return;
    }
    if(e.key==='Enter'&&!e.target.closest('button:not(.mode-card)')){e.preventDefault();modes[selected].click();return;}
  }
  if(/^[1-5]$/.test(e.key)&&!app.querySelector('[data-overlay]')){
    const platform=app.querySelectorAll('[data-choice-platform]')[Number(e.key)-1];
    if(platform&&!platform.disabled){e.preventDefault();if(!e.repeat)platform.click();return;}
  }
  if(e.target.closest('.cover-options')||e.target.closest('.curator'))return;
  if (e.key.toLowerCase() === 'm') { e.preventDefault(); return toggleMute(); }
  if(document.querySelector('[data-overlay]'))return;
  if (!state.session) return;
  if(document.querySelector('.movie-stage[data-confirming]')){
    if(['Escape','Backspace','ArrowLeft'].includes(e.key)){e.preventDefault();return cancelConfirm();}
    if(e.key==='Enter'&&!e.target.closest('button')){e.preventDefault();return renderMode();}
    return;
  }
  if (document.querySelector('.movie-stage')) {
    if(e.key==='Enter'&&e.target.closest('button'))return;
    if (e.key === 'ArrowRight') { e.preventDefault(); return nextMovie(true); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); return previousMovie(); }
    if (e.key === 'Enter') { e.preventDefault(); return renderConfirm(); }
  }
});

initFeatures({ app, state, loadData, renderCategories, startSession, call, deviceId, topbar });
document.addEventListener('gaia-render-movie', renderMovie);

(async function init(){
  try {
    await loadData();
    await checkInterruptedViewing();
    renderIntro();
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="shell"><div class="empty"><h2>Errore di connessione</h2><p>Gaia non riesce a leggere il catalogo in questo momento.</p></div></div>`;
  }
})();
