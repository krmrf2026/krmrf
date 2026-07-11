import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(process.cwd());
const DATA_DIR = path.join(ROOT, 'data');
const SITE_URL = 'https://krmrf.ru';

const SECTION_LABELS = {
  kremennaya: 'Кременная',
  svo: 'СВО',
  law: 'Справочник',
  lnr: 'ЛНР',
  'civilian-impact': 'Гражданские последствия',
  politics: 'Политика',
  warcrimes: 'Досье',
  assessment: 'Оценки фронта'
};

const TYPE_LABELS = {
  article: 'Материал',
  guide: 'Практическая памятка',
  assessment: 'Оценка фронта',
  dossier: 'CASE FILE'
};

const HOME_LIMITS = { important: 3, assessment: 1, kremennaya: 3, guide: 3, dossier: 2 };

const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const write = (file, content) => fs.writeFileSync(path.join(ROOT, file), content, 'utf8');
const exists = file => fs.existsSync(path.join(ROOT, file));
const readJson = file => JSON.parse(read(file));
const writeJson = (file, value) => write(file, `${JSON.stringify(value, null, 2)}\n`);

const escapeHtml = value => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const escapeXml = escapeHtml;
const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const decodeEntities = value => String(value || '')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&#039;/g, "'")
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

const stripTags = html => decodeEntities(String(html || '')
  .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
  .replace(/<nav\b[\s\S]*?<\/nav>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim());

const extractParagraphs = html => [...String(html || '').matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
  .map(match => stripTags(match[1]))
  .filter(text => text.length >= 20)
  .slice(0, 30);

const attr = (tag, name) => {
  const match = tag.match(new RegExp(`\\b${escapeRegExp(name)}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i'));
  return match ? decodeEntities(match[2]) : '';
};

const metaContent = (html, name) => {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  const tag = tags.find(item => attr(item, 'name').toLowerCase() === name.toLowerCase());
  return tag ? attr(tag, 'content') : '';
};

const canonicalHref = html => {
  const tags = html.match(/<link\b[^>]*>/gi) || [];
  const tag = tags.find(item => attr(item, 'rel').toLowerCase() === 'canonical');
  return tag ? attr(tag, 'href') : '';
};

const formatDate = value => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(value || '');
  const [, year, month, day] = match;
  const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  return `${Number(day)} ${months[Number(month) - 1]} ${year} года`;
};

const formatArchiveDate = value => formatDate(value).replace(/ года$/, '');

const monthTitle = value => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})/);
  if (!match) return 'Без даты';
  const [, year, month] = match;
  const months = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  return `${months[Number(month) - 1]} ${year}`;
};

const sortNewest = (a, b) => String(b.datePublished || '').localeCompare(String(a.datePublished || ''))
  || String(a.title || '').localeCompare(String(b.title || ''), 'ru');

const urlToHtmlFile = url => {
  const clean = String(url || '').replace(/^\//, '').replace(/\/$/, '');
  return clean ? `${clean}/index.html` : 'index.html';
};

const derivedImageCandidates = image => {
  if (!image?.startsWith('/assets/img/')) return [];
  const rel = image.slice('/assets/img/'.length);
  const parsed = path.posix.parse(rel);
  return [480, 960].map(width => ({
    width,
    url: `/assets/img/derived/${parsed.dir ? `${parsed.dir}/` : ''}${parsed.name}-${width}.webp`
  })).filter(item => exists(item.url.replace(/^\//, '')));
};

const imageMarkup = item => {
  if (!item.image) return '';
  const candidates = derivedImageCandidates(item.image);
  const srcset = candidates.length
    ? ` srcset="${candidates.map(entry => `${escapeHtml(entry.url)} ${entry.width}w`).join(', ')}"`
    : '';
  return `<img alt="${escapeHtml(item.imageAlt || '')}" decoding="async" height="360" loading="lazy" sizes="(max-width: 640px) calc(100vw - 1.25rem), (max-width: 900px) calc(50vw - 2rem), 370px" src="${escapeHtml(item.image)}"${srcset} width="640"/>`;
};

const cardHtml = (item, catalogKey = '') => {
  const section = SECTION_LABELS[item.section] || item.section || 'Материалы';
  const type = TYPE_LABELS[item.type] || item.type || 'Материал';
  const topics = Array.isArray(item.topics) && item.topics.length
    ? ` data-topics="${escapeHtml(item.topics.join(' '))}"`
    : '';
  const catalog = catalogKey ? ` data-catalog="${escapeHtml(catalogKey)}"` : '';
  return `<article class="material-card"${catalog} data-section="${escapeHtml(item.section)}"${topics} data-type="${escapeHtml(item.type)}">${imageMarkup(item)}<div class="material-card__body"><p class="eyebrow">${escapeHtml(type)} · ${escapeHtml(section)}</p><h2><a href="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a></h2><p>${escapeHtml(item.excerpt || '')}</p><p class="card-meta"><time datetime="${escapeHtml(item.datePublished)}">${escapeHtml(formatDate(item.datePublished))}</time></p></div></article>`;
};

const selectHome = (pages, group) => {
  if (group === 'assessment') return pages.filter(item => item.type === 'assessment').sort(sortNewest).slice(0, 1);
  const explicit = pages
    .filter(item => item.home && Number.isFinite(Number(item.home[group])))
    .sort((a, b) => Number(a.home[group]) - Number(b.home[group]));
  if (explicit.length) return explicit.slice(0, HOME_LIMITS[group] || explicit.length);
  let fallback = pages;
  if (group === 'kremennaya') fallback = pages.filter(item => item.section === 'kremennaya');
  if (group === 'guide') fallback = pages.filter(item => item.type === 'guide');
  if (group === 'dossier') fallback = pages.filter(item => item.type === 'dossier');
  if (group === 'important') fallback = pages.filter(item => item.type === 'article' && item.section !== 'politics');
  return [...fallback].sort(sortNewest).slice(0, HOME_LIMITS[group] || 3);
};

const selectItems = (pages, key) => {
  if (key === 'news') return pages.filter(item => item.type === 'article' || item.type === 'guide').sort(sortNewest);
  if (key.startsWith('section:')) return pages.filter(item => item.section === key.slice(8)).sort(sortNewest);
  if (key.startsWith('type:')) return pages.filter(item => item.type === key.slice(5)).sort(sortNewest);
  if (key.startsWith('chronicle:')) return pages.filter(item => item.section === key.slice(10)).sort(sortNewest);
  if (key.startsWith('home:')) return selectHome(pages, key.slice(5));
  return [];
};

const replaceCatalog = (html, key, items, innerOverride = null) => {
  const token = escapeRegExp(key);
  const pattern = new RegExp(`<!-- KRM CATALOG ${token} START -->([\\s\\S]*?)<!-- KRM CATALOG ${token} END -->`);
  const match = html.match(pattern);
  if (!match) throw new Error(`Не найден блок каталога «${key}»`);
  const segment = match[1].trim();
  let replacement;
  if (key === 'home:assessment') {
    replacement = items.length ? cardHtml(items[0], key) : segment;
  } else {
    const rootMatch = segment.match(/^<([a-z0-9-]+)([^>]*)>[\s\S]*<\/\1>$/i);
    if (!rootMatch) throw new Error(`Не удалось разобрать контейнер «${key}»`);
    const [, tag, attrs] = rootMatch;
    const inner = innerOverride ?? items.map(item => cardHtml(item)).join('');
    replacement = `<${tag}${attrs}>${inner}</${tag}>`;
  }
  return html.replace(pattern, `<!-- KRM CATALOG ${key} START -->${replacement}<!-- KRM CATALOG ${key} END -->`);
};


const latestKremennayaStateItem = pages => {
  const kremennaya = pages.filter(item => item.section === 'kremennaya');
  const stateItems = kremennaya.filter(item => {
    const topics = Array.isArray(item.topics) ? item.topics : [];
    return topics.length === 0 || topics.some(topic => ['safety', 'daily', 'infrastructure'].includes(topic));
  });
  return [...(stateItems.length ? stateItems : kremennaya)].sort(sortNewest)[0] || null;
};

const syncKremennayaIntro = (html, latestState) => {
  let updated = html;

  if (latestState) {
    const currentState = `<section class="current-state"><h2>Последнее зафиксированное состояние</h2><p>${escapeHtml(latestState.excerpt || '')}</p><p><a href="${escapeHtml(latestState.url)}">Открыть материал от ${escapeHtml(formatDate(latestState.datePublished))}</a></p></section>`;
    updated = updated.replace(/<section class="current-state">[\s\S]*?<\/section>/, currentState);
  }

  const chronicleIntro = `<section class="chronicle-intro"><h2>Что сохраняет хроника</h2><p>В этом разделе собраны материалы о Кременной: безопасность, БПЛА, дороги, транспорт, топливо, связь, коммунальные службы, повреждения гражданской инфраструктуры и изменения повседневной жизни города. Хроника помогает смотреть не на один отдельный эпизод, а на то, как обстановка менялась по датам.</p></section>`;
  updated = updated.replace(/<section class="chronicle-intro">[\s\S]*?<\/section>/, chronicleIntro);

  return updated;
};

const syncPublicationMetadata = (html, item, buildDate) => {
  let updated = html.replace(
    /<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/g,
    (whole, jsonText) => {
      let data;
      try { data = JSON.parse(jsonText); } catch { return whole; }
      const nodes = Array.isArray(data?.['@graph']) ? data['@graph'] : [data];
      const article = nodes.find(node => node && ['Article', 'NewsArticle', 'Report'].includes(node['@type']));
      if (!article) return whole;
      article.headline = item.title;
      article.datePublished = item.datePublished;
      article.dateModified = item.dateModified;
      article.url = `${SITE_URL}${item.url}`;
      article.mainEntityOfPage = `${SITE_URL}${item.url}`;
      article.image = `${SITE_URL}${item.image}`;
      return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
    }
  );

  const section = SECTION_LABELS[item.section] || item.section;
  updated = updated.replace(/(<strong>Раздел:<\/strong>\s*)[^<•]+/i, `$1${section}`);

  const revisionMarker = `<!-- KRM REVISION META START -->${item.dateModified > item.datePublished
    ? `<p class="revision-meta">Материал обновлён: <time datetime="${escapeHtml(item.dateModified)}">${escapeHtml(formatDate(item.dateModified))}</time></p>`
    : ''}<!-- KRM REVISION META END -->`;
  if (/<!-- KRM REVISION META START -->[\s\S]*?<!-- KRM REVISION META END -->/.test(updated)) {
    updated = updated.replace(/<!-- KRM REVISION META START -->[\s\S]*?<!-- KRM REVISION META END -->/, revisionMarker);
  } else if (item.dateModified > item.datePublished) {
    const metaMatch = updated.match(/<p\b[^>]*class="[^"]*(?:article-meta|meta)[^"]*"[^>]*>[\s\S]*?<\/p>/i);
    if (metaMatch) updated = updated.replace(metaMatch[0], `${metaMatch[0]}${revisionMarker}`);
    else updated = updated.replace(/(<h1\b[^>]*>[\s\S]*?<\/h1>)/i, `$1${revisionMarker}`);
  }

  if (item.type === 'guide') {
    const due = item.reviewAfter < buildDate;
    const statusClass = due ? 'guide-status--review' : 'guide-status--current';
    const statusText = due
      ? `Срок плановой проверки наступил ${formatDate(item.reviewAfter)}. Перед практическим применением сверьте нормы с официальным органом.`
      : `Плановая повторная проверка актуальности — не позднее ${formatDate(item.reviewAfter)}.`;
    const reviewed = item.reviewedAt || item.dateModified;
    const block = `<!-- KRM GUIDE STATUS START --><aside class="guide-status ${statusClass}" aria-label="Статус актуальности памятки"><p><strong>${due ? 'Требует повторной проверки' : 'Контроль актуальности'}</strong></p><p>Последняя редакционная проверка: <time datetime="${escapeHtml(reviewed)}">${escapeHtml(formatDate(reviewed))}</time>. ${escapeHtml(statusText)}</p></aside><!-- KRM GUIDE STATUS END -->`;
    if (/<!-- KRM GUIDE STATUS START -->[\s\S]*?<!-- KRM GUIDE STATUS END -->/.test(updated)) {
      updated = updated.replace(/<!-- KRM GUIDE STATUS START -->[\s\S]*?<!-- KRM GUIDE STATUS END -->/, block);
    } else {
      const metaMatch = updated.match(/<p\b[^>]*class="[^"]*(?:article-meta|meta)[^"]*"[^>]*>[\s\S]*?<\/p>/i);
      if (metaMatch) updated = updated.replace(metaMatch[0], `${metaMatch[0]}${block}`);
      else updated = updated.replace(/(<h1\b[^>]*>[\s\S]*?<\/h1>)/i, `$1${block}`);
    }
  }
  return updated;
};



const formatDateTime = value => {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return formatDate(raw.slice(0, 10));
  const [, year, month, day, hour, minute] = match;
  const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  return `${Number(day)} ${months[Number(month) - 1]} ${year} года, ${hour}:${minute}`;
};

const updateItemList = (html, items) => html.replace(
  /<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/g,
  (whole, jsonText) => {
    let data;
    try { data = JSON.parse(jsonText); } catch { return whole; }
    const nodes = Array.isArray(data?.['@graph']) ? data['@graph'] : [data];
    const list = nodes.find(node => node && node['@type'] === 'ItemList');
    if (!list) return whole;
    list.itemListElement = items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: `${SITE_URL}${item.url}`,
      name: item.title
    }));
    return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
  }
);

const archiveInner = (pages, searchByUrl) => {
  const groups = new Map();
  [...pages].sort(sortNewest).forEach(item => {
    const key = String(item.datePublished).slice(0, 7);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  return [...groups.values()].map(items => {
    const rows = items.map(item => {
      const search = searchByUrl.get(item.url) || {};
      const topics = Array.isArray(item.topics) ? item.topics.join(' ') : '';
      const locations = Array.isArray(item.locations) ? item.locations.join('|') : '';
      const haystack = [item.title, item.excerpt, item.period, topics, locations,
        SECTION_LABELS[item.section], TYPE_LABELS[item.type], search.description]
        .filter(Boolean).join(' ');
      return `<li data-id="${escapeHtml(item.id)}" data-url="${escapeHtml(item.url)}" data-locations="${escapeHtml(locations)}" data-search="${escapeHtml(haystack)}" data-section="${escapeHtml(item.section)}" data-topics="${escapeHtml(topics)}" data-type="${escapeHtml(item.type)}" data-year="${escapeHtml(String(item.datePublished).slice(0, 4))}"><time datetime="${escapeHtml(item.datePublished)}">${escapeHtml(formatArchiveDate(item.datePublished))}</time><span>${escapeHtml(TYPE_LABELS[item.type] || 'Материал')}</span><a href="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a></li>`;
    }).join('');
    return `<section class="archive-group"><h2>${escapeHtml(monthTitle(items[0].datePublished))}</h2><ol class="archive-list">${rows}</ol></section>`;
  }).join('');
};

const feedXml = (title, selfPath, homePath, items, limit = 30) => {
  const sorted = [...items].sort(sortNewest).slice(0, limit);
  const updated = sorted[0]?.dateModified || sorted[0]?.datePublished || '2026-01-01';
  const entries = sorted.map(item => `  <entry>\n    <title>${escapeXml(item.title)}</title>\n    <link href="${SITE_URL}${escapeXml(item.url)}" />\n    <id>${SITE_URL}${escapeXml(item.url)}</id>\n    <updated>${escapeXml(item.dateModified || item.datePublished)}T12:00:00+03:00</updated>\n    <summary>${escapeXml(item.excerpt || '')}</summary>\n  </entry>`).join('\n');
  return `<?xml version='1.0' encoding='utf-8'?>\n<feed xmlns="http://www.w3.org/2005/Atom">\n  <title>${escapeXml(title)}</title>\n  <link href="${SITE_URL}${selfPath}" rel="self" />\n  <link href="${SITE_URL}${homePath}" />\n  <id>${SITE_URL}${homePath}</id>\n  <updated>${updated}T12:00:00+03:00</updated>\n${entries}\n</feed>\n`;
};

const parseSitemap = xml => {
  const map = new Map();
  for (const match of xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?[\s\S]*?<\/url>/g)) {
    map.set(match[1], match[2] || '');
  }
  return map;
};

const sitemapXml = (pages, oldMap, buildDate, redirectedPaths = new Set()) => {
  const publicationUrls = new Set(pages.map(item => `${SITE_URL}${item.url}`));
  const requiredStaticPaths = [
    '/', '/about/', '/archive/', '/assessment/', '/kremennaya/', '/map/',
    '/methodology/', '/news/', '/news/civilian-impact/', '/news/lnr/', '/news/politics/',
    '/news/svo/', '/privacy/', '/reference/', '/search/', '/war-crimes/'
  ];
  const staticMap = new Map(oldMap);
  for (const pathname of requiredStaticPaths) {
    const url = `${SITE_URL}${pathname}`;
    if (!staticMap.has(url)) staticMap.set(url, buildDate);
  }
  const fixed = [...staticMap.entries()]
    .filter(([url]) => !publicationUrls.has(url) && !url.endsWith('/404.html') && !redirectedPaths.has(new URL(url).pathname))
    .map(([url, lastmod]) => ({ url, lastmod: lastmod || buildDate }));
  const pubs = pages.map(item => ({
    url: `${SITE_URL}${item.url}`,
    lastmod: item.dateModified || item.datePublished
  }));
  const all = [...fixed, ...pubs].sort((a, b) => a.url.localeCompare(b.url));
  const body = all.map(item => `  <url>\n    <loc>${escapeXml(item.url)}</loc>\n    <lastmod>${escapeXml(item.lastmod)}</lastmod>\n  </url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
};

const errors = [];
const pages = readJson('data/pages.json');
if (!Array.isArray(pages)) throw new Error('data/pages.json должен содержать массив');

const ids = new Set();
const urls = new Set();
for (const [index, item] of pages.entries()) {
  const prefix = `pages.json[${index}]`;
  for (const field of ['id', 'type', 'title', 'url', 'section', 'datePublished', 'dateModified', 'excerpt', 'image', 'imageAlt']) {
    if (item[field] === undefined || item[field] === null || item[field] === '') errors.push(`${prefix}: отсутствует поле ${field}`);
  }
  if (ids.has(item.id)) errors.push(`${prefix}: повторяющийся id ${item.id}`);
  if (urls.has(item.url)) errors.push(`${prefix}: повторяющийся url ${item.url}`);
  ids.add(item.id); urls.add(item.url);
  if (!/^\/.*\/$/.test(item.url)) errors.push(`${prefix}: URL должен начинаться и заканчиваться слешем: ${item.url}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(item.datePublished)) errors.push(`${prefix}: неверная datePublished`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(item.dateModified)) errors.push(`${prefix}: неверная dateModified`);
  const htmlFile = urlToHtmlFile(item.url);
  if (!exists(htmlFile)) errors.push(`${prefix}: отсутствует HTML ${htmlFile}`);
  if (item.image && !exists(item.image.replace(/^\//, ''))) errors.push(`${prefix}: отсутствует изображение ${item.image}`);
}
if (errors.length) {
  console.error(errors.map(error => `• ${error}`).join('\n'));
  process.exit(1);
}

const site = readJson('data/site.json');
const packageJson = readJson('package.json');
site.version = packageJson.version;
site.buildDate = site.buildDate || packageJson.version.match(/\d{4}\.\d{1,2}\.\d{1,2}/)?.[0]?.replaceAll('.', '-') || new Date().toISOString().slice(0, 10);

for (const item of pages) {
  const file = urlToHtmlFile(item.url);
  write(file, syncPublicationMetadata(read(file), item, site.buildDate));
}

const enriched = pages.map(item => {
  const html = read(urlToHtmlFile(item.url));
  const main = html.match(/<main\b[\s\S]*?<\/main>/i)?.[0] || html;
  return {
    ...item,
    htmlDescription: metaContent(html, 'description') || item.excerpt,
    canonical: canonicalHref(html),
    searchText: stripTags(main),
    paragraphs: extractParagraphs(main)
  };
});

const searchIndex = enriched.map(item => ({
  title: item.title,
  url: item.url,
  section: SECTION_LABELS[item.section] || item.section,
  type: TYPE_LABELS[item.type] || item.type,
  date: item.datePublished,
  description: item.excerpt || item.htmlDescription,
  text: item.searchText,
  topics: Array.isArray(item.topics) ? item.topics.join(' ') : '',
  locations: Array.isArray(item.locations) ? item.locations.join(' ') : '',
  period: item.period || ''
})).sort((a, b) => String(b.date).localeCompare(String(a.date)));
const searchByUrl = new Map(searchIndex.map(item => [item.url, item]));

const pageJobs = [
  ['news/index.html', 'news'],
  ['news/svo/index.html', 'section:svo'],
  ['news/lnr/index.html', 'section:lnr'],
  ['news/civilian-impact/index.html', 'section:civilian-impact'],
  ['news/politics/index.html', 'section:politics'],
  ['reference/index.html', 'type:guide'],
  ['assessment/index.html', 'type:assessment'],
  ['war-crimes/index.html', 'type:dossier'],
  ['kremennaya/index.html', 'chronicle:kremennaya']
];

for (const [file, key] of pageJobs) {
  const items = selectItems(enriched, key);
  let html = read(file);
  html = replaceCatalog(html, key, items);
  if (key === 'chronicle:kremennaya') {
    html = syncKremennayaIntro(html, latestKremennayaStateItem(enriched));
  }
  html = updateItemList(html, items);
  write(file, html);
}

let home = read('index.html');
for (const group of ['important', 'assessment', 'kremennaya', 'guide', 'dossier']) {
  const key = `home:${group}`;
  home = replaceCatalog(home, key, selectItems(enriched, key));
}
const latestAssessment = enriched.filter(item => item.type === 'assessment').sort(sortNewest)[0];
if (latestAssessment) {
  home = home.replace(/<a class="button" href="[^"]*">Последняя оценка<\/a>/, `<a class="button" href="${escapeHtml(latestAssessment.url)}">Последняя оценка</a>`);
}
write('index.html', home);

let archive = read('archive/index.html');
archive = replaceCatalog(archive, 'archive', enriched, archiveInner(enriched, searchByUrl));
archive = updateItemList(archive, [...enriched].sort(sortNewest));
write('archive/index.html', archive);

writeJson('data/search-index.json', searchIndex);

const previousNews = exists('data/news.json') ? readJson('data/news.json') : [];
const previousAssessments = exists('data/assessment.json') ? readJson('data/assessment.json') : [];
const previousDossiers = exists('data/war-crimes.json') ? readJson('data/war-crimes.json') : [];
const previousNewsById = new Map(previousNews.map(item => [item.id, item]));
const previousAssessmentById = new Map(previousAssessments.map(item => [item.id, item]));
const previousDossierById = new Map(previousDossiers.map(item => [item.id, item]));

writeJson('data/assessment.json', enriched.filter(item => item.type === 'assessment').sort(sortNewest).map(item => ({
  ...(previousAssessmentById.get(item.id) || {}),
  id: item.id,
  section: 'assessment',
  title: item.title,
  updated: item.dateModified,
  period: item.period || previousAssessmentById.get(item.id)?.period || '',
  image: item.image,
  excerpt: item.excerpt,
  summary: previousAssessmentById.get(item.id)?.summary || item.excerpt,
  url: item.url
})));
writeJson('data/war-crimes.json', enriched.filter(item => item.type === 'dossier').sort(sortNewest).map(item => ({
  ...(previousDossierById.get(item.id) || {}),
  id: item.id,
  type: item.type,
  title: item.title,
  url: item.url,
  section: item.section,
  datePublished: item.datePublished,
  dateModified: item.dateModified,
  status: item.status ?? previousDossierById.get(item.id)?.status ?? null,
  excerpt: item.excerpt,
  image: item.image,
  imageAlt: item.imageAlt
})));
writeJson('data/news.json', enriched.filter(item => ['article', 'guide', 'dossier'].includes(item.type)).sort(sortNewest).map(item => ({
  ...(previousNewsById.get(item.id) || {}),
  id: item.id,
  section: item.section,
  title: item.title,
  updated: item.dateModified,
  image: item.image,
  excerpt: item.excerpt,
  paragraphs: previousNewsById.get(item.id)?.paragraphs?.length
    ? previousNewsById.get(item.id).paragraphs
    : item.paragraphs,
  url: item.url
})));

site.contentCount = enriched.length;
writeJson('data/site.json', site);

write('feed.xml', feedXml('KRM РФ — материалы', '/feed.xml', '/', enriched, 30));
write('assessment/feed.xml', feedXml('KRM РФ — оценки фронта', '/assessment/feed.xml', '/assessment/', enriched.filter(item => item.type === 'assessment'), 20));
write('kremennaya/feed.xml', feedXml('KRM РФ — Кременная', '/kremennaya/feed.xml', '/kremennaya/', enriched.filter(item => item.section === 'kremennaya'), 20));

const oldSitemap = parseSitemap(read('sitemap.xml'));
const redirectedPaths = new Set(read('_redirects').split(/\r?\n/)
  .map(line => line.trim()).filter(line => line && !line.startsWith('#'))
  .map(line => line.split(/\s+/)[0]));
write('sitemap.xml', sitemapXml(enriched, oldSitemap, site.buildDate, redirectedPaths));

console.log(`Сборка завершена: ${enriched.length} публикаций.`);
console.log('Обновлены главная, индексы, архив, поиск, JSON, sitemap и Atom-ленты.');
