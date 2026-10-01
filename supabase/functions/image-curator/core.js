export const ALLOWED_PLATFORMS = ['jellyfin','netflix','disney-plus','prime-video','rai-play'];
export function normalizeMetadata(d, type) {
  const year = Number((d.release_date || d.first_air_date || '').slice(0,4)) || null;
  return {
    name: d.title || d.name, original_title: d.original_title || d.original_name,
    release_year: year, runtime_minutes: type === 'movie' ? (d.runtime || null) : null,
    overview: d.overview || '', genres: d.genres || [], original_language: d.original_language,
    poster_url: d.poster_path ? 'https://image.tmdb.org/t/p/original' + d.poster_path : null,
    backdrop_url: d.backdrop_path ? 'https://image.tmdb.org/t/p/original' + d.backdrop_path : null
  };
}
export function curate(candidates) {
  const seen = new Set();
  return candidates.filter(c => {
    const ratio=c.width/c.height;
    if(c.width<650 || c.height<1000 || ratio<0.64 || ratio>0.75 || seen.has(c.url)) return false;
    seen.add(c.url); return true;
  }).sort((a,b) => {
    const score = c => (c.language==='it'?4:c.language==='en'?2:!c.language?1:0)
      - Math.abs(c.width/c.height - 129.5/183)*10 + Math.min(c.height,4000)/4000;
    return score(b)-score(a);
  }).slice(0,24);
}
