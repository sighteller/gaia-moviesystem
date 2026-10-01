import { initFeatures } from './features.js';
const API_URL = 'https://mahjewznwqvdgtdjtekc.supabase.co/functions/v1/gaia-api';

const app = document.querySelector('#app');
const state = {
  titles: [], platforms: [], links: [],
  category: null, filteredTitles: [], index: 0,
  selectedPlatformIds: JSON.parse(localStorage.getItem('gaia_platforms') || 'null'),
  muted: localStorage.getItem('gaia_muted') === '1',
  session: null, history: [], confirmPlatform: null, currentAudio: null
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
function logo() { return `<div class="brand">Gaia <span>| Movie System</span></div>`; }
function muteButton() { return `<button class="icon-btn ${state.muted?'active':''}" data-action="mute">${state.muted?'MUTE attivo':'MUTE'}</button>`; }
function topbar(extra='') { return `<div class="topbar">${logo()}<div class="small-actions">${extra}${muteButton()}</div></div>`; }

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

function renderCategories(){
  state.category = null; state.session = null;
  app.innerHTML = `<div class="shell">${topbar('<button class="ghost-btn" data-action="discover">Scopri</button><button class="ghost-btn" data-action="admin">Aggiungi titolo</button><button class="ghost-btn" data-action="stats">Statistiche</button><button class="ghost-btn" data-action="filters">Piattaforme</button>')}<div class="hero-center"><div class="category-grid">
    <button class="category-card" data-category="animation"><h2>Animazione</h2><p>Film e serie animate</p></button>
    <button class="category-card" data-category="film"><h2>Film</h2><p>Film e serie con persone reali</p></button>
  </div></div></div>`;
}

function renderFilters(){
  const chips = state.platforms.map(p => `<button class="chip ${state.selectedPlatformIds.includes(p.id)?'selected':''}" data-platform-filter="${p.id}">${escapeHtml(p.name)}</button>`).join('');
  app.insertAdjacentHTML('beforeend', `<div class="platform-panel" data-overlay="filters"><div class="platform-box"><h2>Piattaforme disponibili</h2><p>Mostra solo i titoli disponibili su almeno una delle piattaforme selezionate.</p><div class="chips">${chips}</div><button class="primary" data-action="close-filters">Fatto</button></div></div>`);
}

function buildFilteredTitles(){
  const allowed = new Set(state.links.filter(l => state.selectedPlatformIds.includes(l.platform_id)).map(l => l.title_id));
  state.filteredTitles = state.titles.filter(t => t.category === state.category && allowed.has(t.id));
}

async function startSession(category){
  state.category = category; buildFilteredTitles(); state.index = 0;
  if (!state.filteredTitles.length) { renderEmpty(); return; }
  const { session } = await call('start', {
    deviceId: deviceId(), category,
    enabledPlatformIds: state.selectedPlatformIds,
    currentTitleId: state.filteredTitles[0].id
  });
  state.session = session; state.history = []; renderMovie();
}

function currentTitle(){ return state.filteredTitles[state.index]; }
function titleImage(t){ return t.dvd_cover_url || t.custom_image_url || t.poster_url || ''; }
function renderPoster(t){ const url = titleImage(t); return url ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(t.name)}">` : `<div class="poster-placeholder">${escapeHtml(t.name)}</div>`; }

function renderMovie(){
  const t = currentTitle(); if (!t) return renderEmpty();
  app.innerHTML = `<div class="shell">${topbar('<button class="ghost-btn" data-action="categories">Categorie</button>')}<div class="movie-stage">
    <div class="poster-wrap">${renderPoster(t)}</div>
    <div class="movie-info"><h1>${escapeHtml(t.name)}</h1><div class="movie-meta">${t.media_type==='series'?'Serie TV':'Film'}${t.release_year?' · '+t.release_year:''}</div><div class="hint">← precedente · → no / successivo · Invio conferma · M mute</div></div>
  </div></div>`;
  playAudio(t);
}

function playAudio(t){
  if (state.currentAudio) { state.currentAudio.pause(); state.currentAudio = null; }
  if (state.muted || !t.audio_url) return;
  const a = new Audio(t.audio_url); state.currentAudio = a; a.play().catch(()=>{});
}

async function touchSession(titleId=currentTitle()?.id){
  if (!state.session) return;
  await call('touch', { sessionId: state.session.id, currentTitleId: titleId, history: state.history });
}

async function nextMovie(recordNo=true){
  const t = currentTitle();
  if (recordNo) await call('reject', { sessionId: state.session.id, titleId: t.id });
  state.history.push(t.id);
  state.index = (state.index + 1) % state.filteredTitles.length;
  await touchSession(currentTitle().id); renderMovie();
}

async function previousMovie(){
  if (!state.history.length) return;
  const previousId = state.history.pop();
  const idx = state.filteredTitles.findIndex(t => t.id === previousId);
  if (idx < 0) return;
  state.index = idx;
  const t = currentTitle();
  await call('unreject', { sessionId: state.session.id, titleId: t.id });
  await touchSession(t.id); renderMovie();
}

function availablePlatformsForTitle(t){
  const ids = state.links.filter(l => l.title_id === t.id && state.selectedPlatformIds.includes(l.platform_id)).map(l => l.platform_id);
  return state.platforms.filter(p => ids.includes(p.id));
}

function renderConfirm(){
  const t = currentTitle(); const ps = availablePlatformsForTitle(t); state.confirmPlatform = null;
  app.innerHTML = `<div class="shell">${topbar()}<div class="confirm-layout"><div class="poster-wrap">${renderPoster(t)}</div><div class="confirm-copy"><h1>${escapeHtml(t.name)}</h1><h2>Sei sicura?</h2><div class="platform-list">${ps.map(p => `<button class="platform-option" data-platform="${p.id}">${escapeHtml(p.name)}</button>`).join('')}</div><button class="primary" data-action="confirm-platform" disabled>Conferma</button><div class="hint">Esc / Indietro = no e film successivo</div></div></div></div>`;
}

function renderMode(){
  app.innerHTML = `<div class="shell">${topbar()}<div class="hero-center"><div><h1 style="font-size:clamp(42px,6vw,76px);letter-spacing:-.05em;margin:0 0 28px">Come è avvenuta la scelta?</h1><div class="mode-grid">
    <button class="mode-card" data-mode="unlimited"><h2>Illimitata</h2><p>Nessun limite imposto alla scelta.</p></button>
    <button class="mode-card" data-mode="limited"><h2>Limitata</h2><p>Scelta fra pochi titoli.</p></button>
  </div></div></div></div>`;
}

async function finalize(mode){
  const t = currentTitle();
  const p = state.platforms.find(x => x.id === state.confirmPlatform);
  const link = state.links.find(l => l.title_id === t.id && l.platform_id === p.id);
  const now = new Date();
  const expected = (t.media_type === 'movie' && t.runtime_minutes) ? new Date(now.getTime() + t.runtime_minutes * 60000) : null;
  await call('finalize', {
    sessionId: state.session.id,
    deviceId: deviceId(),
    titleId: t.id,
    platformId: p.id,
    mode,
    expectedEndAt: expected?.toISOString() || null
  });
  state.session = null;
  if (link?.url) location.href = link.url;
  else {
    app.innerHTML = `<div class="shell">${topbar()}<div class="hero-center"><div class="empty"><h2>Scelta salvata</h2><p>${escapeHtml(t.name)} · ${escapeHtml(p.name)}</p><p>Il collegamento diretto a questa piattaforma non è ancora configurato.</p><button class="primary" data-action="categories">Torna a Gaia</button></div></div></div>`;
  }
}

async function renderStats(){
  const { rows } = await call('stats');
  app.innerHTML = `<div class="shell">${topbar('<button class="ghost-btn" data-action="categories">Categorie</button>')}<div style="width:min(1100px,100%);margin:0 auto"><h1 style="font-size:clamp(44px,6vw,76px);letter-spacing:-.05em;margin:10px 0 26px">Statistiche</h1><div style="display:grid;gap:12px">${rows.map(r => `<div style="display:grid;grid-template-columns:minmax(220px,2fr) repeat(5,minmax(80px,1fr));gap:12px;align-items:center;padding:18px 20px;border:1px solid #30362b;border-radius:16px;background:#1a1d17"><strong>${escapeHtml(r.title.name)}</strong><span>Scelto ${r.chosen}</span><span>No ${r.no}</span><span>Limitata ${r.limited}</span><span>Illimitata ${r.unlimited}</span><span>Cambiato ${r.changed}</span></div>`).join('')}</div></div></div>`;
}

function renderEmpty(){
  app.innerHTML = `<div class="shell">${topbar()}<div class="hero-center"><div class="empty"><h2>Nessun titolo disponibile</h2><p>Modifica il filtro delle piattaforme o scegli un'altra categoria.</p><button class="primary" data-action="categories">Torna alle categorie</button></div></div></div>`;
}

function toggleMute(){
  state.muted = !state.muted;
  localStorage.setItem('gaia_muted', state.muted ? '1' : '0');
  if (state.muted && state.currentAudio) state.currentAudio.pause();
  if (state.category && state.session) renderMovie(); else renderCategories();
}

app.addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
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
  if (b.dataset.mode) return finalize(b.dataset.mode);
});

document.addEventListener('keydown', async e => {
  if (e.target.closest('input,textarea,select,form')) return;
  if (e.key.toLowerCase() === 'm') { e.preventDefault(); return toggleMute(); }
  if (!state.session) return;
  if (document.querySelector('.confirm-copy')) {
    if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); return nextMovie(true); }
    if (e.key === 'Enter' && state.confirmPlatform) { e.preventDefault(); return renderMode(); }
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
    if (e.key === 'ArrowRight') { e.preventDefault(); return nextMovie(true); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); return previousMovie(); }
    if (e.key === 'Enter') { e.preventDefault(); return renderConfirm(); }
  }
});

initFeatures({ app, state, loadData, renderCategories, startSession, call, deviceId });
document.addEventListener('gaia-render-movie', renderMovie);

(async function init(){
  try {
    await loadData();
    await checkInterruptedViewing();
    if (!(await resumeSessionIfAny())) renderCategories();
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="shell"><div class="empty"><h2>Errore di connessione</h2><p>Gaia non riesce a leggere il catalogo in questo momento.</p></div></div>`;
  }
})();
