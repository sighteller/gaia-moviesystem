// Selections are intent signals, not confirmed viewing or a rating.
export function recommend(titles, links, platformIds, selections) {
  const allowed=new Set(links.filter(l=>platformIds.includes(l.platform_id)).map(l=>l.title_id));
  const eligible=titles.filter(t=>allowed.has(t.id));
  const positive=selections.filter(s=>s.viewing_status!=='changed');
  const counts=new Map(), categories=new Map();
  for(const s of positive){
    counts.set(s.title_id,(counts.get(s.title_id)||0)+1);
    const t=titles.find(t=>t.id===s.title_id);
    if(t) categories.set(t.category,(categories.get(t.category)||0)+1);
  }
  const favorites=eligible.filter(t=>counts.has(t.id)).sort((a,b)=>counts.get(b.id)-counts.get(a.id)||a.name.localeCompare(b.name));
  const ideas=eligible.filter(t=>!counts.has(t.id)).sort((a,b)=>(categories.get(b.category)||0)-(categories.get(a.category)||0)||a.name.localeCompare(b.name));
  return {favorites:favorites.slice(0,8).map(t=>({title:t,reason:counts.get(t.id)>1?'Una scelta che ritorna: puoi rivederlo.':'Lo hai già scelto: potrebbe piacerti ritrovarlo.'})),
    ideas:ideas.slice(0,12).map(t=>({title:t,reason:categories.get(t.category)?'Dalla categoria che scegli più spesso.':'Un’idea dal tuo catalogo.'})),
    hasHistory:positive.length>0};
}
