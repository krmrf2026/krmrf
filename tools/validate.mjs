import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { SITE_URL, TYPE_LABELS, SECTION_LABELS } from './lib/project.mjs';

const ROOT = path.resolve(process.cwd());
const errors = [];
const warnings = [];
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const exists = file => fs.existsSync(path.join(ROOT, file));
const readJson = file => JSON.parse(read(file));

const TYPES = new Set(Object.keys(TYPE_LABELS));
const SECTIONS = new Set(Object.keys(SECTION_LABELS));
const TODAY = new Date().toISOString().slice(0, 10);
const GUIDE_STATUSES = new Set(['current', 'review-due', 'superseded', 'archived']);

const decodeEntities = value => String(value || '')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&#039;/g, "'")
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
const stripTags = html => decodeEntities(String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
const normalizeText = value => stripTags(value).replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
const attr = (tag, name) => {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i'));
  return match ? decodeEntities(match[2]) : '';
};
const urlToFile = raw => {
  const url = String(raw || '').split('#')[0].split('?')[0];
  if (!url.startsWith('/')) return null;
  if (url === '/') return 'index.html';
  const clean = url.replace(/^\//, '');
  if (clean.endsWith('/')) return `${clean}index.html`;
  return clean;
};
const validDate = value => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const formatDateTime = value => {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return raw;
  const [, year, month, day, hour, minute] = match;
  const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  return `${Number(day)} ${months[Number(month) - 1]} ${year} года, ${hour}:${minute}`;
};

const externalLinks = html => {
  const main = html.match(/<main\b[\s\S]*?<\/main>/i)?.[0] || '';
  const urls = [];
  for (const match of main.matchAll(/<a\b[^>]*href=(["'])(https?:\/\/[^"']+)\1/gi)) {
    try {
      const url = decodeEntities(match[2]);
      const parsed = new URL(url);
      if (parsed.hostname === 'krmrf.ru' || parsed.hostname.endsWith('.krmrf.ru')) continue;
      urls.push(url);
    } catch {
      // External URLs are checked for valid HTTP(S) syntax below.
    }
  }
  return [...new Set(urls)];
};

let pages;
let search;
let sitemap;
let schema;
let taxonomy;
try { pages = readJson('data/pages.json'); } catch (error) { errors.push(`data/pages.json: ${error.message}`); pages = []; }
try { search = readJson('data/search-index.json'); } catch (error) { errors.push(`data/search-index.json: ${error.message}`); search = []; }
try { schema = readJson('data/pages.schema.json'); } catch (error) { errors.push(`data/pages.schema.json: ${error.message}`); schema = {}; }
try { taxonomy = readJson('data/taxonomy.json'); } catch (error) { errors.push(`data/taxonomy.json: ${error.message}`); taxonomy = { topics: {}, locations: {} }; }
try { sitemap = read('sitemap.xml'); } catch (error) { errors.push(`sitemap.xml: ${error.message}`); sitemap = ''; }

if (!Array.isArray(pages)) errors.push('data/pages.json должен содержать массив.');
if (search?.version !== 2 || !Array.isArray(search?.documents) || !search?.terms || typeof search.terms !== 'object') errors.push('data/search-index.json должен соответствовать формату v2.');
const knownTopics = new Set(Object.keys(taxonomy?.topics || {}));
const knownLocations = new Set(Object.keys(taxonomy?.locations || {}));

const schemaTypes = new Set(schema?.items?.properties?.type?.enum || []);
const schemaSections = new Set(schema?.items?.properties?.section?.enum || []);
for (const type of TYPES) if (!schemaTypes.has(type)) errors.push(`pages.schema.json не содержит type=${type}`);
for (const section of SECTIONS) if (!schemaSections.has(section)) errors.push(`pages.schema.json не содержит section=${section}`);

const ids = new Set();
const urls = new Set();
const pageByUrl = new Map();
for (const [index, item] of pages.entries()) {
  const prefix = `pages.json[${index}] ${item?.id || '?'}`;
  for (const field of ['id', 'type', 'title', 'seoTitle', 'seoDescription', 'url', 'section', 'datePublished', 'dateModified', 'excerpt', 'image', 'imageAlt']) {
    if (item?.[field] === undefined || item?.[field] === null || item?.[field] === '') errors.push(`${prefix}: отсутствует ${field}`);
  }
  if (!TYPES.has(item.type)) errors.push(`${prefix}: неизвестный type=${item.type}`);
  if (String(item.seoTitle || '').length > 56) errors.push(`${prefix}: seoTitle длиннее 56 символов.`);
  if (String(item.seoDescription || '').length < 50 || String(item.seoDescription || '').length > 160) errors.push(`${prefix}: seoDescription должен быть длиной 50–160 символов.`);
  if (!SECTIONS.has(item.section)) errors.push(`${prefix}: неизвестный section=${item.section}`);
  if (!/^\/[a-z0-9/_-]+\/$/i.test(item.url || '')) errors.push(`${prefix}: URL должен начинаться и заканчиваться слешем.`);
  if (!validDate(item.datePublished)) errors.push(`${prefix}: невозможная datePublished=${item.datePublished}`);
  if (!validDate(item.dateModified)) errors.push(`${prefix}: невозможная dateModified=${item.dateModified}`);
  if (validDate(item.datePublished) && validDate(item.dateModified) && item.dateModified < item.datePublished) errors.push(`${prefix}: dateModified раньше datePublished.`);
  if (ids.has(item.id)) errors.push(`Повторяющийся id: ${item.id}`);
  if (urls.has(item.url)) errors.push(`Повторяющийся URL: ${item.url}`);
  ids.add(item.id); urls.add(item.url); pageByUrl.set(item.url, item);

  if (item.topics !== undefined) {
    if (!Array.isArray(item.topics)) errors.push(`${prefix}: topics должен быть массивом.`);
    else for (const topic of item.topics) if (!knownTopics.has(topic)) errors.push(`${prefix}: неизвестный topic=${topic}; добавьте код в data/taxonomy.json или используйте существующий код.`);
  }
  if (item.locations !== undefined) {
    if (!Array.isArray(item.locations)) errors.push(`${prefix}: locations должен быть массивом.`);
    else for (const location of item.locations) if (!knownLocations.has(location)) errors.push(`${prefix}: неизвестная территория=${location}; добавьте её в data/taxonomy.json или используйте существующую.`);
  }

  if (item.type === 'guide') {
    if (!validDate(item.reviewAfter)) errors.push(`${prefix}: для памятки нужен корректный reviewAfter.`);
    if (!validDate(item.reviewedAt || item.dateModified)) errors.push(`${prefix}: для памятки нужен корректный reviewedAt/dateModified.`);
    if (!GUIDE_STATUSES.has(item.reviewStatus)) errors.push(`${prefix}: неизвестный reviewStatus=${item.reviewStatus}.`);
    if (validDate(item.reviewAfter) && item.reviewAfter < item.datePublished) errors.push(`${prefix}: reviewAfter раньше публикации.`);
    if (validDate(item.reviewAfter) && item.reviewAfter < TODAY && item.reviewStatus === 'current') errors.push(`${prefix}: срок reviewAfter наступил; памятку нужно проверить и изменить reviewStatus.`);
    if (item.reviewStatus === 'superseded' && !item.supersededBy) errors.push(`${prefix}: для superseded нужен supersededBy.`);
  }

  if (item.revisionHistory !== undefined) {
    if (!Array.isArray(item.revisionHistory) || !item.revisionHistory.length) errors.push(`${prefix}: revisionHistory должен быть непустым массивом.`);
    else {
      let latest = item.datePublished;
      for (const revision of item.revisionHistory) {
        if (!validDate(revision.date) || !revision.summary) errors.push(`${prefix}: каждая revisionHistory требует date и summary.`);
        if (revision.date > latest) latest = revision.date;
      }
      if (validDate(item.dateModified) && latest > item.dateModified) errors.push(`${prefix}: dateModified раньше последней записи revisionHistory.`);
    }
  }


  const file = urlToFile(item.url);
  if (!file || !exists(file)) {
    errors.push(`${prefix}: отсутствует HTML ${file || item.url}`);
    continue;
  }
  const image = String(item.image || '').replace(/^\//, '');
  if (!exists(image)) errors.push(`${prefix}: отсутствует изображение ${item.image}`);
  if (item.image?.startsWith('/assets/img/')) {
    const rel = item.image.slice('/assets/img/'.length);
    const parsed = path.posix.parse(rel);
    for (const width of [480, 960]) {
      const derived = `assets/img/derived/${parsed.dir ? `${parsed.dir}/` : ''}${parsed.name}-${width}.webp`;
      if (!exists(derived)) errors.push(`${prefix}: отсутствует производное изображение ${derived}`);
    }
  }

  const html = read(file);
  const expectedBodyClass = `page page-content page--${item.type === 'guide' ? 'guide' : item.type === 'dossier' ? 'dossier' : item.type === 'assessment' ? 'assessment' : 'article'}`;
  const bodyTag = html.match(/<body\b[^>]*>/i)?.[0] || '';
  const bodyClass = attr(bodyTag, 'class');
  if (bodyClass !== expectedBodyClass) errors.push(`${file}: body class должен быть "${expectedBodyClass}", сейчас "${bodyClass || 'нет'}".`);
  if (!/<main\b[^>]*id=["']main-content["'][^>]*>/i.test(html) && !/<main\b[^>]*id=["']main-content["'][^>]*>/i.test(html)) errors.push(`${file}: main должен иметь id="main-content".`);
  if (!html.includes('class="nav-toggle"') && !html.includes("class='nav-toggle'")) errors.push(`${file}: нет общей мобильной кнопки nav-toggle.`);
  if (!html.includes('id="site-navigation"') && !html.includes("id='site-navigation'")) errors.push(`${file}: нет общей навигации id="site-navigation".`);
  for (const asset of [...html.matchAll(/(?:href|src)=["'](\/assets\/(?:css|js)\/[^"']+)["']/gi)].map(match => match[1])) {
    if (!asset.includes('?v=')) errors.push(`${file}: ассет без версии для cache busting: ${asset}`);
  }
  const h1Matches = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)];
  if (h1Matches.length !== 1) errors.push(`${file}: H1 = ${h1Matches.length}, должен быть один.`);
  else if (normalizeText(h1Matches[0][1]) !== normalizeText(item.title)) errors.push(`${file}: H1 не совпадает с pages.json title.`);
  if (!/<html\b[^>]*\blang=["']ru["']/i.test(html)) errors.push(`${file}: отсутствует lang="ru".`);

  const title = normalizeText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
  const expectedTitle = `${item.seoTitle} — KRM РФ`;
  if (title !== normalizeText(expectedTitle)) errors.push(`${file}: <title> должен быть «${expectedTitle}».`);
  if (title.length > 65) errors.push(`${file}: <title> длиннее 65 символов.`);

  const canonicalTag = (html.match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i) || html.match(/<link\b[^>]*href=["'][^"']+["'][^>]*rel=["']canonical["'][^>]*>/i))?.[0] || '';
  const canonical = attr(canonicalTag, 'href');
  if (canonical !== `${SITE_URL}${item.url}`) errors.push(`${file}: canonical не совпадает с ${item.url}`);
  const metaValue = (attribute, key) => {
    const tag = (html.match(/<meta\b[^>]*>/gi) || []).find(candidate => attr(candidate, attribute).toLowerCase() === key.toLowerCase());
    return tag ? attr(tag, 'content') : '';
  };
  const expectedMeta = {
    description: item.seoDescription,
    'og:title': item.seoTitle,
    'og:description': item.seoDescription,
    'og:url': `${SITE_URL}${item.url}`,
    'twitter:title': item.seoTitle,
    'twitter:description': item.seoDescription
  };
  for (const [key, expected] of Object.entries(expectedMeta)) {
    const attribute = key.startsWith('og:') ? 'property' : 'name';
    const actual = metaValue(attribute, key);
    if (normalizeText(actual) !== normalizeText(expected)) errors.push(`${file}: ${key} не совпадает с pages.json.`);
  }

  const scripts = [...html.matchAll(/<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi)];
  if (!scripts.length) errors.push(`${file}: нет JSON-LD.`);
  let articleNode = null;
  scripts.forEach((match, scriptIndex) => {
    try {
      const data = JSON.parse(match[1]);
      const nodes = Array.isArray(data?.['@graph']) ? data['@graph'] : [data];
      articleNode ||= nodes.find(node => node && ['Article', 'NewsArticle', 'Report'].includes(node['@type']));
    } catch (error) {
      errors.push(`${file}: JSON-LD ${scriptIndex + 1} невалиден: ${error.message}`);
    }
  });
  if (!articleNode) errors.push(`${file}: JSON-LD не содержит Article.`);
  else {
    if (normalizeText(articleNode.headline) !== normalizeText(item.title)) errors.push(`${file}: JSON-LD headline не совпадает с H1/pages.json.`);
    if (normalizeText(articleNode.alternativeHeadline) !== normalizeText(item.seoTitle)) errors.push(`${file}: JSON-LD altHeadline не совпадает с seoTitle.`);
    if (normalizeText(articleNode.description) !== normalizeText(item.seoDescription)) errors.push(`${file}: JSON-LD description не совпадает с seoDescription.`);
    const expectedSchemaType = item.type === 'assessment' || item.type === 'dossier' ? 'Report' : item.type === 'article' ? 'NewsArticle' : 'Article';
    if (articleNode['@type'] !== expectedSchemaType) errors.push(`${file}: JSON-LD @type должен быть ${expectedSchemaType}.`);
    if (articleNode.datePublished !== item.datePublished) errors.push(`${file}: JSON-LD datePublished не совпадает с pages.json.`);
    if (articleNode.dateModified !== item.dateModified) errors.push(`${file}: JSON-LD dateModified не совпадает с pages.json.`);
  }

  const levels = [...html.matchAll(/<h([1-6])\b/gi)].map(match => Number(match[1]));
  for (let i = 1; i < levels.length; i += 1) if (levels[i] > levels[i - 1] + 1) errors.push(`${file}: скачок заголовков H${levels[i - 1]}→H${levels[i]}.`);
  for (const table of html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) if (!/<caption\b/i.test(table[1])) errors.push(`${file}: таблица без caption.`);

  const visibleSection = html.match(/<strong>Раздел:<\/strong>\s*([^<•]+)/i)?.[1]?.trim();
  if (visibleSection && normalizeText(visibleSection) !== normalizeText(SECTION_LABELS[item.section])) errors.push(`${file}: видимый раздел «${visibleSection}» не совпадает с ${SECTION_LABELS[item.section]}.`);
  if (item.type === 'guide' && !html.includes('KRM GUIDE STATUS START')) errors.push(`${file}: отсутствует генерируемый блок актуальности памятки.`);

  const linkedSources = externalLinks(html);
  for (const url of linkedSources) {
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) errors.push(`${file}: внешний URL использует неподдерживаемый протокол: ${url}`);
    } catch {
      errors.push(`${file}: невалидный внешний URL: ${url}`);
    }
  }
}

const searchDocuments = Array.isArray(search?.documents) ? search.documents : [];
const searchUrls = new Set(searchDocuments.map(item => item.url));
for (const url of urls) if (!searchUrls.has(url)) errors.push(`search-index.json не содержит ${url}`);
if (searchDocuments.length !== pages.length) errors.push('search-index.json: число документов не совпадает с pages.json.');
for (const item of searchDocuments) {
  if (!item.title || !item.url || !item.description) errors.push(`search-index.json ${item.url || '?'}: неполная запись.`);
  for (const field of ['topics', 'locations', 'period']) if (item[field] === undefined) errors.push(`search-index.json ${item.url}: отсутствует поле ${field}.`);
}
for (const [term, postings] of Object.entries(search?.terms || {})) {
  if (!term || !Array.isArray(postings) || !postings.length) errors.push(`search-index.json: некорректный термин «${term}».`);
  else if (postings.some(id => !Number.isInteger(id) || id < 0 || id >= searchDocuments.length)) errors.push(`search-index.json: термин «${term}» ссылается на неизвестный документ.`);
}

for (const item of pages) {
  const block = sitemap.match(new RegExp(`<url>\\s*<loc>${SITE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${item.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}<\\/loc>\\s*<lastmod>([^<]+)<\\/lastmod>`));
  if (!block) errors.push(`sitemap.xml не содержит ${item.url}`);
  else if (block[1] !== item.dateModified) errors.push(`sitemap.xml: lastmod ${item.url} не совпадает с dateModified.`);
}

const headersFile = read('_headers');
const requiredSecurityHeaders = [
  'Strict-Transport-Security: max-age=31536000; includeSubDomains',
  'X-Content-Type-Options: nosniff',
  'X-Frame-Options: DENY',
  'X-Permitted-Cross-Domain-Policies: none',
  'Referrer-Policy: strict-origin-when-cross-origin',
  'Origin-Agent-Cluster: ?1',
  'Cross-Origin-Opener-Policy: same-origin-allow-popups',
  "style-src-elem 'self'",
  "style-src-attr 'unsafe-inline'",
  "frame-ancestors 'none'",
  'block-all-mixed-content'
];
for (const header of requiredSecurityHeaders) {
  if (!headersFile.includes(header)) errors.push(`_headers: отсутствует обязательная политика «${header}».`);
}
if (headersFile.includes('mc.webvisor.org')) errors.push('_headers: разрешён неиспользуемый домен mc.webvisor.org.');
const styleDirective = headersFile.match(/(?:^|;\s*)style-src\s+([^;]+)/m)?.[1] || '';
if (!styleDirective) errors.push('_headers: отсутствует основная директива style-src.');
else if (styleDirective.includes("'unsafe-inline'")) errors.push("_headers: style-src не должен разрешать 'unsafe-inline'.");

const redirects = read('_redirects').split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
for (const line of redirects) {
  const [from, to, status] = line.split(/\s+/);
  if (!from || !to || !/^30[18]$/.test(status || '')) errors.push(`_redirects: неверная строка «${line}»`);
  if (sitemap.includes(`<loc>${SITE_URL}${from}</loc>`)) errors.push(`sitemap.xml содержит redirect-source ${from}`);
}

const requiredCatalogs = {
  'index.html': ['home:important', 'home:assessment', 'home:kremennaya', 'home:guide', 'home:dossier'],
  'news/index.html': ['news'],
  'news/svo/index.html': ['section:svo'],
  'news/lnr/index.html': ['section:lnr'],
  'news/civilian-impact/index.html': ['section:civilian-impact'],
  'news/politics/index.html': ['section:politics'],
  'reference/index.html': ['type:guide'],
  'assessment/index.html': ['type:assessment'],
  'war-crimes/index.html': ['type:dossier'],
  'kremennaya/index.html': ['chronicle:kremennaya'],
  'archive/index.html': ['archive']
};
for (const [file, keys] of Object.entries(requiredCatalogs)) {
  const html = read(file);
  keys.forEach(key => {
    if (!html.includes(`KRM CATALOG ${key} START`) || !html.includes(`KRM CATALOG ${key} END`)) errors.push(`${file}: отсутствуют маркеры ${key}`);
  });
}

const archive = read('archive/index.html');
for (const technical of ['/feed.xml', '/data/pages.json', '/sitemap.xml']) {
  const intro = archive.match(/<header class="page-intro">([\s\S]*?)<\/header>/)?.[1] || '';
  if (intro.includes(technical)) errors.push(`archive/index.html: техническая ссылка ${technical} осталась во вводном блоке.`);
}
for (const url of urls) if (!archive.includes(`href="${url}"`)) errors.push(`archive/index.html не содержит ${url}`);
for (const group of ['type', 'section', 'location']) if (!archive.includes(`data-filter-group="${group}"`)) errors.push(`archive/index.html: нет группы фильтров ${group}`);

try {
  const zones = readJson('data/zones.geojson');
  if (!zones || zones.type !== 'FeatureCollection') errors.push('data/zones.geojson: ожидается FeatureCollection.');
  if (!zones.updated) errors.push('data/zones.geojson: отсутствует поле updated.');
  if (!Array.isArray(zones.features)) errors.push('data/zones.geojson: отсутствует массив features.');

  const changes = readJson('data/map-changes.json');
  if (changes?.schema !== 'krmrf-map-changes-v1') errors.push('data/map-changes.json: неверный schema.');
  if (!Array.isArray(changes?.changes) || !changes.changes.length) errors.push('data/map-changes.json: нужен непустой changes.');
  const latestChange = changes?.changes?.[0];
  if (latestChange) {
    if (!latestChange.id || !latestChange.zonesUpdated || !latestChange.title || !latestChange.summary) {
      errors.push('data/map-changes.json: последняя запись требует id, zonesUpdated, title и summary.');
    }
    if (zones.updated && latestChange.zonesUpdated && String(latestChange.zonesUpdated) !== String(zones.updated)) {
      errors.push('data/map-changes.json: changes[0].zonesUpdated должен совпадать с data/zones.geojson updated.');
    }
    if (latestChange.relatedUrl) {
      const relatedFile = urlToFile(latestChange.relatedUrl);
      if (!relatedFile || !exists(relatedFile)) errors.push(`data/map-changes.json: битая relatedUrl ${latestChange.relatedUrl}`);
    }
    const mapHtml = read('map/index.html');
    if (!mapHtml.includes(`data-updated-iso=\"${zones.updated}\"`) && !mapHtml.includes(`data-updated-iso='${zones.updated}'`)) errors.push('map/index.html: статичная дата не совпадает с zones.updated.');
    if (!normalizeText(mapHtml).includes(normalizeText(latestChange.title))) errors.push('map/index.html: нет последнего заголовка из map-changes.json.');
    if (/mapSnapshot/.test(mapHtml)) errors.push('map/index.html: остался устаревший элемент mapSnapshot.');
  }
} catch (error) {
  errors.push(`Карта: ${error.message}`);
}

const htmlFiles = [];
const walk = directory => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'dist', 'releases', 'krmrf-releases'].includes(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.html')) htmlFiles.push(full);
  }
};
walk(ROOT);
for (const full of htmlFiles) {
  const rel = path.relative(ROOT, full).replace(/\\/g, '/');
  const html = fs.readFileSync(full, 'utf8');
  for (const link of html.matchAll(/<a\b[^>]*>/gi)) {
    const tag = link[0];
    if (/target=["']_blank["']/i.test(tag) && !/rel=["'][^"']*noopener/i.test(tag)) errors.push(`${rel}: target="_blank" без rel="noopener".`);
  }
  const refs = [...html.matchAll(/\b(?:href|src)=["']([^"']+)["']/gi)].map(match => match[1]);
  for (const match of html.matchAll(/\bsrcset\s*=\s*(["'])([\s\S]*?)\1/gi)) {
    refs.push(...match[2].split(',').map(item => item.trim().split(/\s+/)[0]).filter(Boolean));
  }
  for (const ref of refs) {
    if (!ref.startsWith('/') || ref.startsWith('//')) continue;
    const file = urlToFile(ref);
    if (file && !exists(file)) errors.push(`${rel}: битая локальная ссылка ${ref}`);
  }
}

for (const full of htmlFiles) {
  const rel = path.relative(ROOT, full).replace(/\\/g, '/');
  const html = fs.readFileSync(full, 'utf8');
  if (/^(?:google|yandex_)[a-z0-9]+\.html$/i.test(path.basename(rel))) continue;
  const robotsTag = (html.match(/<meta\b[^>]*name=["']robots["'][^>]*>/i) || [])[0] || '';
  const indexable = !/noindex/i.test(attr(robotsTag, 'content')) && !/<meta\s+http-equiv=["']refresh["']/i.test(html);
  if (indexable) {
    const title = normalizeText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
    const descriptionTag = (html.match(/<meta\b[^>]*name=["']description["'][^>]*>/i) || [])[0] || '';
    const description = attr(descriptionTag, 'content');
    if (!title || title.length > 65) errors.push(`${rel}: индексируемый title должен быть длиной 1–65 символов.`);
    if (!description || description.length < 50 || description.length > 160) errors.push(`${rel}: индексируемый description должен быть длиной 50–160 символов.`);
    const canonicalTag = (html.match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i) || html.match(/<link\b[^>]*href=["'][^"']+["'][^>]*rel=["']canonical["'][^>]*>/i))?.[0] || '';
    if (!attr(canonicalTag, 'href').startsWith(`${SITE_URL}/`)) errors.push(`${rel}: индексируемая страница без корректного canonical.`);
  }
  if (/\sstyle=["']/.test(html)) errors.push(`${rel}: inline-style запрещён строгой CSP.`);
  const identifiers = [...html.matchAll(/\bid=["']([^"']+)["']/gi)].map(match => match[1]);
  const duplicateIds = [...new Set(identifiers.filter((id, index) => identifiers.indexOf(id) !== index))];
  if (duplicateIds.length) errors.push(`${rel}: повторяющиеся id: ${duplicateIds.join(', ')}.`);
  for (const image of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = image[0];
    if (!/\balt=["']/.test(tag)) errors.push(`${rel}: изображение без alt.`);
    if (!/\bwidth=["']/.test(tag) || !/\bheight=["']/.test(tag)) errors.push(`${rel}: изображение без width/height.`);
  }
  for (const match of html.matchAll(/(<button\b[^>]*>)([\s\S]*?)<\/button>/gi)) {
    const text = normalizeText(match[2]);
    if (!text && !/\baria-label=["'][^"']+/i.test(match[1])) errors.push(`${rel}: кнопка без доступного имени.`);
  }
  for (const match of html.matchAll(/(<a\b[^>]*>)([\s\S]*?)<\/a>/gi)) {
    const text = normalizeText(match[2]);
    if (!text && !/\baria-label=["'][^"']+/i.test(match[1])) errors.push(`${rel}: ссылка без доступного имени.`);
  }
  if (/<html\b/i.test(html) && !/<meta\s+http-equiv=["']refresh["']/i.test(html)) {
    if (!/<html\b[^>]*lang=["']ru["']/i.test(html)) errors.push(`${rel}: отсутствует lang="ru".`);
    if (!/<meta\b[^>]*name=["']viewport["']/i.test(html)) errors.push(`${rel}: отсутствует viewport.`);
  }
}

const imageRoot = path.join(ROOT, 'assets/img');
const walkImages = directory => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walkImages(full);
    else {
      const rel = path.relative(ROOT, full).replace(/\\/g, '/');
      const size = fs.statSync(full).size;
      if (!path.extname(entry.name)) errors.push(`${rel}: файл изображения без расширения.`);
      if (size < 100) errors.push(`${rel}: подозрительно маленький файл изображения (${size} байт).`);
    }
  }
};
walkImages(imageRoot);

const jsFiles = [];
const toolFiles = [];
for (const entry of fs.readdirSync(path.join(ROOT, 'assets/js'))) if (entry.endsWith('.js')) jsFiles.push(`assets/js/${entry}`);
for (const entry of fs.readdirSync(path.join(ROOT, 'tools'))) if (entry.endsWith('.mjs')) toolFiles.push(`tools/${entry}`);
for (const file of [...jsFiles, ...toolFiles]) {
  const check = spawnSync(process.execPath, ['--check', path.join(ROOT, file)], { encoding: 'utf8' });
  if (check.status !== 0) errors.push(`${file}: синтаксическая ошибка JavaScript: ${check.stderr.trim()}`);
}

for (const file of jsFiles) {
  const source = read(file);
  if (/cache\s*:\s*['"]no-store['"]/i.test(source)) errors.push(`${file}: запрещён cache: no-store.`);
  if (/fetch\(\s*['"]\/data\/pages\.json/i.test(source)) errors.push(`${file}: клиент не должен загружать data/pages.json.`);
}

if (warnings.length) console.warn(`${warnings.length} предупреждений (не блокируют публикацию):\n${warnings.map(item => `• ${item}`).join('\n')}`);
if (errors.length) {
  console.error(`Проверка не пройдена: ${errors.length} ошибок.`);
  console.error(errors.map(item => `• ${item}`).join('\n'));
  process.exit(1);
}
console.log(`Проверка пройдена: ${pages.length} публикаций, ${htmlFiles.length} HTML-страниц, ошибок нет.`);
