const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const picture=t=>{try{const u=new URL(t.dvd_cover_url||t.custom_image_url||t.poster_url);return u.protocol==='https:'?'<img src="'+esc(u.href)+'" alt="" loading="lazy">':'<span class="rank-placeholder"></span>';}catch{return '<span class="rank-placeholder"></span>';}};
export function rankMovement(current,previous){
 if(!previous)return {text:'—',className:'',label:'Confronto non ancora disponibile'};
 const old=previous.find(x=>x.titleId===current.titleId);
 if(!old)return {text:'Nuovo',className:'',label:'Nuovo ingresso in classifica'};
 const delta=old.rank-current.rank;
 return delta>0?{text:'↑ '+delta,className:'up',label:'Sale di '+delta+' posizioni'}:delta<0?{text:'↓ '+Math.abs(delta),className:'down',label:'Scende di '+Math.abs(delta)+' posizioni'}:{text:'—',className:'',label:'Posizione invariata'};
}
export function initStatistics({app,state,call,topbar}){
 let data=null,tab='algorithm',period='week',version=0;
 const number=x=>Number(x||0).toLocaleString('it-IT',{maximumFractionDigits:2});
 function draw(){
  const byId=new Map(state.titles.map(t=>[t.id,t]));
  const rows=(tab==='algorithm'?data.algorithm:data.favorites.filter(x=>x.period===period)).filter(x=>byId.has(x.titleId));
  const at=new Date(data.calculatedAt).toLocaleString('it-IT');
  const tabs='<div class="stats-tabs" aria-label="Classifiche"><button class="ghost-btn '+(tab==='algorithm'?'active':'')+'" data-stats-tab="algorithm" aria-pressed="'+(tab==='algorithm')+'">Algoritmo</button><button class="ghost-btn '+(tab==='favorites'?'active':'')+'" data-stats-tab="favorites" aria-pressed="'+(tab==='favorites')+'">Più scelti</button></div>';
  const periods=tab==='favorites'?'<div class="stats-tabs" aria-label="Periodo">'+[['week','Ultimi 7 giorni'],['month','Ultimi 30 giorni'],['all','Tutto lo storico']].map(([value,label])=>'<button class="ghost-btn '+(period===value?'active':'')+'" data-stats-period="'+value+'" aria-pressed="'+(period===value)+'">'+label+'</button>').join('')+'</div>':'';
  const intro=tab==='algorithm'?'<p>Punteggi del modello attuale, ricalcolati come all’inizio di una nuova sessione. Tutto il catalogo disponibile, senza filtri di piattaforma.</p><p class="hint">L’ordine delle proposte può variare per lasciare spazio alla scoperta. Apri una riga per capire il punteggio.</p><p class="hint">'+(data.previousAt?'Frecce rispetto alla fotografia di ieri, '+esc(new Date(data.previousAt).toLocaleString('it-IT'))+'.':'Prima giornata: nessun confronto con ieri disponibile. Le fotografie giornaliere iniziano da oggi.')+'</p>':'<p>I primi 30 titoli del periodo. Ogni nuova scelta conta, compresi i rewatch; i “No” non sottraggono punti.</p><p class="hint">Il totale unisce le scelte registrate in Gaia e le giornate di visione dello storico importato. Le giornate presenti in entrambe le fonti non vengono sommate due volte. Non è una misura dei film completati.</p>';
  const cards=rows.map(row=>{
   const title=byId.get(row.titleId),movement=rankMovement(row,data.previous);
   const summary='<span class="rank-position">'+row.rank+'</span>'+picture(title)+'<strong class="rank-title">'+esc(title.name)+'</strong><span class="rank-score">'+number(tab==='algorithm'?row.score:row.count)+'</span>'+(tab==='algorithm'?'<span class="rank-movement '+movement.className+'" aria-label="'+esc(movement.label)+'">'+esc(movement.text)+'</span>':'');
   return tab==='algorithm'?'<details class="ranking-item"><summary class="ranking-row">'+summary+'</summary><div class="rank-breakdown"><dl>'+[['Scelta recente',row.recent],['Rewatch',row.repeatPoints],['Storico',row.history],['Base dallo storico importato',row.initial],['Penalizzazioni',-row.penalty]].map(([label,value])=>'<div><dt>'+label+'</dt><dd>'+number(value)+'</dd></div>').join('')+'</dl><p>Totale: '+number(row.score)+' punti. Calcolato il '+esc(at)+'.</p></div></details>':'<div class="ranking-item"><div class="ranking-row favorites-row">'+summary+'</div><p class="favorite-sources">'+row.choices+' scelte Gaia · '+row.importedDays+' giornate importate</p></div>';
  }).join('');
  app.innerHTML='<div class="shell">'+topbar()+'<section class="statistics-screen"><h1>Statistiche</h1>'+tabs+periods+intro+'<p class="hint">Aggiornato: '+esc(at)+(data.mode==='test'?' · Modello in fase di test':'')+'</p><div class="ranking-head '+(tab==='favorites'?'favorites-row':'')+'"><span>#</span><span></span><span>Titolo</span><span>'+(tab==='algorithm'?'Punti':'Totale')+'</span>'+(tab==='algorithm'?'<span>Andamento</span>':'')+'</div><div class="ranking-list">'+(cards||'<p>Nessuna scelta registrata in questo periodo.</p>')+'</div></section></div>';
 }
 app.addEventListener('click',e=>{
  const b=e.target.closest('[data-stats-tab],[data-stats-period]');if(!b||!data||!app.querySelector('.statistics-screen'))return;
  if(b.dataset.statsTab)tab=b.dataset.statsTab;if(b.dataset.statsPeriod)period=b.dataset.statsPeriod;draw();
 });
 return async function renderStats(){
  const current=++version;state.session=null;if(state.currentAudio)state.currentAudio.pause();
  app.innerHTML='<div class="shell">'+topbar()+'<section class="statistics-screen"><h1>Statistiche</h1><p role="status">Preparo le classifiche…</p></section></div>';
  try{const result=await call('stats');if(current!==version||!app.querySelector('.statistics-screen'))return;data=result;draw();}
  catch{if(current===version&&app.querySelector('.statistics-screen'))app.querySelector('.statistics-screen').innerHTML='<h1>Statistiche</h1><p role="alert">Non riesco a caricare le classifiche. Riprova tra poco.</p><button class="ghost-btn" data-action="stats">Riprova</button>';}
 };
}
