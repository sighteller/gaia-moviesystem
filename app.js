import { recordConsultation, choiceMessage, platformUrl } from './choice-summary.js?v=20261001f';
import { mountCoverPicker } from './cover-picker.js?v=20261001f';
import { initFeatures } from './features.js?v=20261001f';
const API_URL = 'https://mahjewznwqvdgtdjtekc.supabase.co/functions/v1/gaia-api';

const app = document.querySelector('#app');
const state = {
  titles: [], platforms: [], links: [],
  category: null, filteredTitles: [], index: 0,
  selectedPlatformIds: JSON.parse(localStorage.getItem('gaia_platforms') || 'null'),
  muted: localStorage.getItem('gaia_muted') === '1',
  session: null, history: [], confirmPlatform: null, currentAudio: null, navigating:false,
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
function logo() { return `<button class="brand" data-action="categories" aria-label="Home"><img src="assets/gaia-logo.svg" alt="Gaia · Movie System" width="235" height="30"></button>`; }
function muteButton() { return `<button class="icon-btn ${state.muted?'active':''}" data-action="mute" aria-label="${state.muted?'Attiva audio':'Disattiva audio'}" aria-pressed="${state.muted}">${svgIcon('<path d="M11 5 6 9H3v6h3l5 4z"/>'+(state.muted?'<path d="m16 9 5 6m0-6-5 6"/>':'<path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>'))}</button>`; }
function topbar(extra='') { return `<div class="topbar">${logo()}<div class="small-actions">${extra}<button class="icon-btn" data-action="stats" aria-label="Statistiche">${svgIcon('<path d="M4 20V10m8 10V4m8 16v-7M2 20h20"/>')}</button><button class="ghost-btn" data-action="filters">Filtri</button>${muteButton()}</div></div>`; }

async function loadData() {
  const data = await call('catalog');
  state.titles = data.titles || [];
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

function homeActions(){return '<button class="ghost-btn" data-action="discover">Scopri</button><button class="ghost-btn" data-action="add-title">Aggiungi titolo</button>';}

function renderIntro(){
  state.category=null;state.session=null;
  if(state.currentAudio){state.currentAudio.pause();state.currentAudio=null;}
  app.innerHTML=`<div class="shell">${topbar(homeActions())}<section class="intro-screen"><h1 class="intro-greeting"><span>Ciao Gaia!</span><span class="intro-question"><span>che</span>${homeCarousel()}<span>film</span></span><span>vediamo oggi?</span></h1><button class="intro-start" data-action="categories">Cominciamo <span aria-hidden="true">⏎</span></button></section></div>`;

}

function renderCategories(){
  state.category = null; state.session = null;
  if (state.currentAudio) { state.currentAudio.pause(); state.currentAudio = null; }
  app.innerHTML = `<div class="shell">${topbar(homeActions())}<div class="hero-center category-screen"><div class="category-grid">
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
  app.insertAdjacentHTML('beforeend', `<div class="platform-panel" data-overlay="filters"><div class="platform-box"><h2>Filtri</h2><p>Mostra solo i titoli disponibili su almeno una delle piattaforme selezionate.</p><div class="chips">${chips}</div><button class="primary" data-action="close-filters">Fatto</button></div></div>`);
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
function moviePeek(){
  const next=state.filteredTitles[(state.index+1)%state.filteredTitles.length];
  return state.filteredTitles.length>1?`<div class="movie-peek" aria-hidden="true">${renderPoster(next)}</div>`:'';
}
function renderMovie(){
  const t = currentTitle(); if (!t) return renderEmpty();
  state.consultation=recordConsultation(state.consultation,t.id);
  app.innerHTML = `<div class="shell movie-shell">${topbar()}<div class="movie-stage" tabindex="-1">
    <div class="poster-column"><div class="poster-wrap">${renderPoster(t)}</div><div class="cover-options"></div></div>
    <div class="movie-info"><div class="movie-copy">${movieCopy(t)}</div><div class="movie-navigation"><div class="navigation-arrows"><button class="ghost-btn arrow-btn" data-action="previous" aria-label="Titolo precedente" ${state.history.length?'':'disabled'}>←</button><button class="ghost-btn arrow-btn" data-action="next" aria-label="No, titolo successivo">→</button></div><button class="watch-btn" data-action="watch">Guarda <span aria-hidden="true">⏎</span></button><p class="navigation-status" role="status"></p></div></div>
  </div><div class="movie-peek-slot">${moviePeek()}</div></div>`;
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
  app.querySelector('.movie-peek-slot').innerHTML=moviePeek();
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

function renderConfirm(){
  if(state.navigating)return;
  const t = currentTitle(); const ps = availablePlatformsForTitle(t); state.confirmPlatform = null;
  app.innerHTML = `<div class="shell">${topbar()}<div class="confirm-layout"><div class="poster-wrap">${renderPoster(t)}</div><div class="confirm-copy"><h1>${escapeHtml(t.name)}</h1><h2>Sei sicura?</h2><div class="platform-list">${ps.map(p => `<button class="platform-option" data-platform="${p.id}">${escapeHtml(p.name)}</button>`).join('')}</div><div class="confirm-navigation navigation-arrows"><button class="ghost-btn arrow-btn" data-action="back-to-movie" aria-label="Torna al film">←</button><button class="ghost-btn confirm-btn" data-action="confirm-platform" disabled>Conferma</button></div></div></div></div>`;
}

function renderMode(){
  app.innerHTML = `<div class="shell">${topbar()}<div class="hero-center"><div><h1 style="font-size:clamp(42px,6vw,76px);letter-spacing:-.05em;margin:0 0 28px">Come è avvenuta la scelta?</h1><div class="mode-grid">
    <button class="mode-card" data-mode="unlimited"><h2>Illimitata</h2><p>Nessun limite imposto alla scelta.</p></button>
    <button class="mode-card" data-mode="limited"><h2>Limitata</h2><p>Scelta fra pochi titoli.</p></button>
  </div></div></div></div>`;
}

async function finalize(mode){
  const sessionId=state.session.id;
  const count=state.consultation.titleIds.length;
  const t = currentTitle();
  const p = state.platforms.find(x => x.id === state.confirmPlatform);
  const link = state.links.find(l => l.title_id === t.id && l.platform_id === p.id);
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
  const url=platformUrl(link?.url);
  app.innerHTML = `<div class="shell">${topbar()}<div class="hero-center"><div class="empty choice-result"><h2>${escapeHtml(choiceMessage(count))}</h2><p>${escapeHtml(t.name)} · ${escapeHtml(p.name)}</p><p class="choice-counter">${count} ${count===1?'titolo consultato':'titoli consultati'} prima della scelta.</p>${url?`<a class="primary platform-launch" href="${escapeHtml(url)}">Apri su ${escapeHtml(p.name)} ⏎</a>`:'<p>Il collegamento diretto a questa piattaforma non è ancora configurato.</p>'}<button class="ghost-btn" data-action="categories">Torna a Gaia</button></div></div></div>`;

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
  if (b.dataset.action === 'back-to-movie') return renderMovie();
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
  if (b.dataset.platform) {
    state.confirmPlatform = b.dataset.platform;
    document.querySelectorAll('.platform-option').forEach(x => x.classList.toggle('selected', x.dataset.platform === state.confirmPlatform));
    document.querySelector('[data-action="confirm-platform"]').disabled = false;
    return;
  }
  if (b.dataset.action === 'confirm-platform' && state.confirmPlatform) return renderMode();
  if (b.dataset.mode) {
    app.querySelectorAll('[data-mode]').forEach(x=>x.disabled=true);
    try{await finalize(b.dataset.mode);}catch(err){app.querySelectorAll('[data-mode]').forEach(x=>x.disabled=false);app.querySelector('.mode-error')?.remove();app.querySelector('.mode-grid')?.insertAdjacentHTML('afterend','<p class="mode-error" role="alert">Non riesco a salvare la scelta. Riprova.</p>');console.error(err);}
    return;
  }
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
  if(e.target.closest('.cover-options')||e.target.closest('.curator'))return;
  if (e.key.toLowerCase() === 'm') { e.preventDefault(); return toggleMute(); }
  if(document.querySelector('[data-overlay]'))return;
  if (!state.session) return;
  if (document.querySelector('.confirm-copy')) {
    if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); return renderMovie(); }
    if (e.key === 'Enter' && state.confirmPlatform && !e.target.closest('button')) { e.preventDefault(); return renderMode(); }
    const opts = [...document.querySelectorAll('.platform-option')];
    if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && opts.length) {
      e.preventDefault();
      let idx = opts.findIndex(x => x.dataset.platform === state.confirmPlatform);
      idx = e.key === 'ArrowRight' ? (idx + 1) % opts.length : (idx - 1 + opts.length) % opts.length;
      opts[idx].click();
    }
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
