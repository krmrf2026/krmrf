// Dates of publication remain the ordering key for the archive and news.
// Open case files are maintained over time: their last substantive revision wins.
export const HOME_LIMITS = Object.freeze({ important: 3, assessment: 1, kremennaya: 3, guide: 3, dossier: 2 });

export const sortNewest = (a, b) => String(b.datePublished || '').localeCompare(String(a.datePublished || ''))
  || String(a.title || '').localeCompare(String(b.title || ''), 'ru')
  || String(a.url || '').localeCompare(String(b.url || ''));

export const sortRecentlyUpdated = (a, b) => String(b.dateModified || b.datePublished || '')
  .localeCompare(String(a.dateModified || a.datePublished || '')) || sortNewest(a, b);

export const homeFallback = (pages, group) => {
  if (group === 'assessment') return pages.filter(item => item.type === 'assessment');
  if (group === 'kremennaya') return pages.filter(item => item.section === 'kremennaya');
  if (group === 'guide') return pages.filter(item => item.type === 'guide');
  if (group === 'dossier') return pages.filter(item => item.type === 'dossier');
  if (group === 'important') return pages.filter(item => item.type === 'article' && item.section !== 'politics');
  return [];
};

export const selectHome = (pages, group, excludedUrls = new Set()) => {
  // Legacy home.dossier pins must never hide a newly revised case file.
  const explicit = group === 'dossier' ? [] : pages
    .filter(item => Number.isInteger(item.home?.[group]) && item.home[group] > 0)
    .sort((a, b) => a.home[group] - b.home[group] || sortNewest(a, b));
  const fallback = homeFallback(pages, group).sort(group === 'dossier' ? sortRecentlyUpdated : sortNewest);
  const seen = new Set(excludedUrls);
  return [...explicit, ...fallback].filter(item => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  }).slice(0, HOME_LIMITS[group] || 3);
};

export const selectItems = (pages, key) => {
  if (key === 'news') return pages.filter(item => item.type === 'article' || item.type === 'guide').sort(sortNewest);
  if (key.startsWith('section:')) return pages.filter(item => item.section === key.slice(8)).sort(sortNewest);
  if (key.startsWith('type:')) return pages.filter(item => item.type === key.slice(5))
    .sort(key === 'type:dossier' ? sortRecentlyUpdated : sortNewest);
  if (key.startsWith('chronicle:')) return pages.filter(item => item.section === key.slice(10)).sort(sortNewest);
  return [];
};
