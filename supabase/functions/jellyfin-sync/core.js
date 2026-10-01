export function normalizeItem(x, coverBase) {
  const id=String(x.Id||'').replaceAll('-','').toLowerCase();
  if(!/^[a-f0-9]{32}$/.test(id)||!['Movie','Series'].includes(x.Type)||!String(x.Name||'').trim()) throw new Error('Invalid Jellyfin item');
  const positive=(v,max)=>Number.isInteger(Number(v))&&Number(v)>0&&Number(v)<=max?Number(v):null;
  const genres=(Array.isArray(x.Genres)?x.Genres:[]).slice(0,50).map(g=>({name:String(g).slice(0,100)}));
  const tag=String(x.ImageTags?.Primary||'');
  const cover=x.GaiaCoverUrl;
  if(cover && !cover.startsWith(coverBase+id+'/')) throw new Error('Invalid cover URL');
  return {id,name:String(x.Name).trim().slice(0,300),original_title:String(x.OriginalTitle||x.Name).slice(0,300),
    media_type:x.Type==='Series'?'series':'movie',year:positive(x.ProductionYear,3000),
    runtime:positive(Math.round(Number(x.RunTimeTicks)/600000000),100000),
    tmdb_id:positive(x.ProviderIds?.Tmdb,2147483647),imdb_id:/^tt\d+$/.test(x.ProviderIds?.Imdb||'')?x.ProviderIds.Imdb:null,
    category:genres.some(g=>/^(animation|animazione|animación|anime)$/i.test(g.name))?'animation':'film',
    overview:String(x.Overview||'').slice(0,20000),genres,cover_url:cover||null,image_tag:tag.slice(0,128),
    collections:(Array.isArray(x.GaiaCollections)?x.GaiaCollections:[]).slice(0,100).map(c=>String(c).slice(0,300))};
}
export function due(state,now=Date.now()) {
  return !state.last_success_at || now-Date.parse(state.last_success_at)>=7*86400000 ||
    (!!state.requested_at && (!state.fulfilled_at || Date.parse(state.requested_at)>Date.parse(state.fulfilled_at)));
}
export function validImage(bytes) {
  return bytes.length>4 && bytes.length<=1048576 &&
    ((bytes[0]===255&&bytes[1]===216&&bytes[2]===255)?'image/jpeg':
      bytes.length>8&&[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n)?'image/png':null);
}
