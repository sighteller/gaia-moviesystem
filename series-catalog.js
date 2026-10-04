// Group catalog records without replacing their IDs or viewing history.
const normalized = value => String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('it');
const episodePattern = /^(.*?)\s*(\d{1,2})x(\d{1,3})(?:[\s._:-]+(.*))?$/i;

export function buildSeriesIndex(titles) {
  const byId = new Map(titles.map(title => [title.id, title]));
  const series = titles.filter(title => title.media_type === 'series' && !title.series_id);
  const byName = new Map();
  for (const title of series) {
    const key = normalized(title.name);
    byName.set(key, [...(byName.get(key) || []), title]);
  }
  const parents = new Map(), children = new Map(), metadata = new Map();
  for (const title of titles) {
    const match = String(title.name || '').match(episodePattern);
    let parent = title.series_id ? byId.get(title.series_id) : null;
    if (!parent && !title.series_id && title.media_type !== 'series' && match?.[1]?.trim()) {
      const matches = byName.get(normalized(match[1])) || [];
      if (matches.length === 1) parent = matches[0];
    }
    if (!parent || parent.id === title.id || parent.media_type !== 'series' || parent.series_id) continue;
    const season = title.season_number ?? (match ? Number(match[2]) : null);
    const episode = title.episode_number ?? (match ? Number(match[3]) : null);
    parents.set(title.id, parent.id);
    metadata.set(title.id, { season, episode });
    if (!children.has(parent.id)) children.set(parent.id, []);
    children.get(parent.id).push(title);
  }
  for (const rows of children.values()) rows.sort((a, b) => {
    const x = metadata.get(a.id), y = metadata.get(b.id);
    return (x.season ?? Infinity) - (y.season ?? Infinity) ||
      (x.episode ?? Infinity) - (y.episode ?? Infinity) || a.name.localeCompare(b.name, 'it');
  });
  return { byId, parents, children, metadata };
}

export function episodeLabel(title) {
  const match = String(title.name || '').match(episodePattern);
  return match?.[4] ? match[4].replace(/[._]+/g, ' ').trim() : title.name;
}

export function catalogEntries(titles, { query = '', filter = 'active', dirtyIds = new Set() } = {}) {
  const index = buildSeriesIndex(titles);
  const searchable = value => normalized(value).normalize('NFD').replace(/\p{M}/gu, '');
  const search = searchable(query);
  const matchesName = title => searchable(title.name).includes(search);
  const matchesFilter = title => filter === 'all' ||
    filter === 'active' && (title.active || title.request_status === 'pending') ||
    filter === 'requested' && title.request_status === 'pending' ||
    filter === 'archived' && !title.active && title.request_status !== 'pending' ||
    filter === 'dirty' && dirtyIds.has(title.id) ||
    filter === 'no-quote' && !title.quote_override?.text;
  const entries = [];
  for (const title of titles) {
    if (index.parents.has(title.id)) continue;
    const children = index.children.get(title.id) || [];
    const rootHit = matchesName(title) && matchesFilter(title);
    // Preserve archived episode records inside a visible series; their status stays explicit.
    const childHits = children.filter(child => matchesName(child) &&
      (filter === 'active' ? title.active || child.active : matchesFilter(child)));
    if (!rootHit && !childHits.length) continue;
    entries.push({ title, children: rootHit ? children : childHits });
  }
  entries.sort((a,b) => Number(b.title.request_status==='pending')-Number(a.title.request_status==='pending') || (a.title.request_status==='pending'&&b.title.request_status==='pending'?String(b.title.requested_at).localeCompare(String(a.title.requested_at)):a.title.name.localeCompare(b.title.name,'it')));
  return { entries, index };
}
