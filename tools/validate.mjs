import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(process.cwd());
const SITE_URL = 'https://krmrf.ru';
const errors = [];
const warnings = [];
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const exists = file => fs.existsSync(path.join(ROOT, file));
const readJson = file => JSON.parse(read(file));
const sha256 = buffer => crypto.createHash('sha256').update(buffer).digest('hex');

const TYPE_LABELS = {
  article: 'Материал', guide: 'Практическая памятка',
  assessment: 'Оценка фронта', dossier: 'CASE FILE'
};
const SECTION_LABELS = {
  kremennaya: 'Кременная', svo: 'СВО', law: 'Справочник', lnr: 'ЛНР',
  'civilian-impact': 'Гражданские последствия', politics: 'Политика',
  assessment: 'Оценки фронта', warcrimes: 'Досье'
};
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
      // Broken absolute links are caught below by registry validation.
    }
  }
  return [...new Set(urls)];
};

let pages;
let search;
let sitemap;
let sources;
let schema;
let preservationQueue;
try { pages = readJson('data/pages.json'); } catch (error) { errors.push(`data/pages.json: ${error.message}`); pages = []; }
try { search = readJson('data/search-index.json'); } catch (error) { errors.push(`data/search-index.json: ${error.message}`); search = []; }
try { sources = readJson('data/sources.json'); } catch (error) { errors.push(`data/sources.json: ${error.message}`); sources = []; }
try { schema = readJson('data/pages.schema.json'); } catch (error) { errors.push(`data/pages.schema.json: ${error.message}`); schema = {}; }
try { preservationQueue = readJson('data/source-preservation-queue.json'); } catch (error) { errors.push(`data/source-preservation-queue.json: ${error.message}`); preservationQueue = []; }
try { sitemap = read('sitemap.xml'); } catch (error) { errors.push(`sitemap.xml: ${error.message}`); sitemap = ''; }

if (!Array.isArray(pages)) errors.push('data/pages.json должен содержать массив.');
if (!Array.isArray(search)) errors.push('data/search-index.json должен содержать массив.');
if (!Array.isArray(sources)) errors.push('data/sources.json должен содержать массив.');
if (!Array.isArray(preservationQueue)) errors.push('data/source-preservation-queue.json должен содержать массив.');

const schemaTypes = new Set(schema?.items?.properties?.type?.enum || []);
const schemaSections = new Set(schema?.items?.properties?.section?.enum || []);
for (const type of TYPES) if (!schemaTypes.has(type)) errors.push(`pages.schema.json не содержит type=${type}`);
for (const section of SECTIONS) if (!schemaSections.has(section)) errors.push(`pages.schema.json не содержит section=${section}`);

const sourceById = new Map();
let unpreservedSourceCount = 0;
let unpreservedPriorityCount = 0;
const sourceByUrl = new Map();
for (const source of sources) {
  if (!source?.id || !source?.url) {
    errors.push('sources.json: запись без id или url.');
    continue;
  }
  if (sourceById.has(source.id)) errors.push(`sources.json: повторяющийся id ${source.id}`);
  if (sourceByUrl.has(source.url)) errors.push(`sources.json: повторяющийся URL ${source.url}`);
  sourceById.set(source.id, source);
  sourceByUrl.set(source.url, source);
  try { new URL(source.url); } catch { errors.push(`sources.json: невалидный URL ${source.url}`); }
  if (!source.title || !source.publisher || !validDate(source.registeredAt)) errors.push(`sources.json ${source.id}: нужны title, publisher и корректный registeredAt.`);
  if (source.accessedAt !== null && source.accessedAt !== undefined && !validDate(source.accessedAt)) errors.push(`sources.json ${source.id}: неверный accessedAt.`);
  if (source.localCopy) {
    const local = source.localCopy.replace(/^\//, '');
    if (!exists(local)) errors.push(`sources.json ${source.id}: отсутствует localCopy ${source.localCopy}`);
    else if (!/^[a-f0-9]{64}$/.test(source.sha256 || '')) errors.push(`sources.json ${source.id}: для localCopy нужен SHA-256.`);
    else if (sha256(fs.readFileSync(path.join(ROOT, local))) !== source.sha256) errors.push(`sources.json ${source.id}: SHA-256 localCopy не совпадает.`);
  }
  if (!['normal', 'medium', 'high'].includes(source.preservationPriority || '')) errors.push(`sources.json ${source.id}: неверный preservationPriority.`);
  if (!Array.isArray(source.referencedBy)) errors.push(`sources.json ${source.id}: referencedBy должен быть массивом.`);
  if (!source.accessedAt || (!source.archiveUrl && !source.localCopy)) {
    unpreservedSourceCount += 1;
    if (source.preservationPriority === 'high' || source.preservationPriority === 'medium') unpreservedPriorityCount += 1;
  }
}
if (unpreservedSourceCount) warnings.push(`В реестре ${unpreservedSourceCount} источников без сохранённой копии; ${unpreservedPriorityCount} из них находятся в приоритетной очереди data/source-preservation-queue.json.`);
const queuedIds = new Set(preservationQueue.map(item => item.sourceId));
for (const source of sources) {
  const shouldQueue = ['high', 'medium'].includes(source.preservationPriority) && !source.localCopy && !source.archiveUrl;
  if (shouldQueue && !queuedIds.has(source.id)) errors.push(`Очередь источников: отсутствует ${source.id}.`);
  if (!shouldQueue && queuedIds.has(source.id)) errors.push(`Очередь источников: лишняя запись ${source.id}.`);
}

const ids = new Set();
const urls = new Set();
const pageByUrl = new Map();
for (const [index, item] of pages.entries()) {
  const prefix = `pages.json[${index}] ${item?.id || '?'}`;
  for (const field of ['id', 'type', 'title', 'url', 'section', 'datePublished', 'dateModified', 'excerpt', 'image', 'imageAlt']) {
    if (item?.[field] === undefined || item?.[field] === null || item?.[field] === '') errors.push(`${prefix}: отсутствует ${field}`);
  }
  if (!TYPES.has(item.type)) errors.push(`${prefix}: неизвестный type=${item.type}`);
  if (!SECTIONS.has(item.section)) errors.push(`${prefix}: неизвестный section=${item.section}`);
  if (!/^\/[a-z0-9/_-]+\/$/i.test(item.url || '')) errors.push(`${prefix}: URL должен начинаться и заканчиваться слешем.`);
  if (!validDate(item.datePublished)) errors.push(`${prefix}: невозможная datePublished=${item.datePublished}`);
  if (!validDate(item.dateModified)) errors.push(`${prefix}: невозможная dateModified=${item.dateModified}`);
  if (validDate(item.datePublished) && validDate(item.dateModified) && item.dateModified < item.datePublished) errors.push(`${prefix}: dateModified раньше datePublished.`);
  if (ids.has(item.id)) errors.push(`Повторяющийся id: ${item.id}`);
  if (urls.has(item.url)) errors.push(`Повторяющийся URL: ${item.url}`);
  ids.add(item.id); urls.add(item.url); pageByUrl.set(item.url, item);

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

  if (!Array.isArray(item.sourceIds)) errors.push(`${prefix}: sourceIds должен быть массивом, допускается пустой.`);
  else {
    if (new Set(item.sourceIds).size !== item.sourceIds.length) errors.push(`${prefix}: sourceIds содержит повторы.`);
    for (const id of item.sourceIds) if (!sourceById.has(id)) errors.push(`${prefix}: неизвестный sourceId ${id}`);
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
  const h1Matches = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)];
  if (h1Matches.length !== 1) errors.push(`${file}: H1 = ${h1Matches.length}, должен быть один.`);
  else if (normalizeText(h1Matches[0][1]) !== normalizeText(item.title)) errors.push(`${file}: H1 не совпадает с pages.json title.`);
  if (!/<html\b[^>]*\blang=["']ru["']/i.test(html)) errors.push(`${file}: отсутствует lang="ru".`);

  const title = normalizeText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
  if (!title.includes(normalizeText(item.title))) errors.push(`${file}: <title> не содержит точный заголовок публикации.`);

  const canonicalTag = (html.match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i) || html.match(/<link\b[^>]*href=["'][^"']+["'][^>]*rel=["']canonical["'][^>]*>/i))?.[0] || '';
  const canonical = attr(canonicalTag, 'href');
  if (canonical !== `${SITE_URL}${item.url}`) errors.push(`${file}: canonical не совпадает с ${item.url}`);
  for (const selector of [
    /<meta\b[^>]*name=["']description["'][^>]*>/i,
    /<meta\b[^>]*property=["']og:title["'][^>]*>/i,
    /<meta\b[^>]*property=["']og:url["'][^>]*>/i,
    /<meta\b[^>]*name=["']twitter:title["'][^>]*>/i
  ]) if (!selector.test(html)) errors.push(`${file}: отсутствует обязательный метатег.`);

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
  const linkedIds = new Set(linkedSources.map(url => sourceByUrl.get(url)?.id).filter(Boolean));
  for (const url of linkedSources) if (!sourceByUrl.has(url)) errors.push(`${file}: внешний источник не зарегистрирован в sources.json: ${url}`);
  for (const id of linkedIds) if (!item.sourceIds.includes(id)) errors.push(`${file}: sourceIds не содержит ${id}.`);
  for (const id of item.sourceIds) {
    const source = sourceById.get(id);
    if (source && !linkedSources.includes(source.url)) warnings.push(`${file}: sourceId ${id} не найден среди ссылок основного текста.`);
  }
}

const searchUrls = new Set(search.map(item => item.url));
for (const url of urls) if (!searchUrls.has(url)) errors.push(`search-index.json не содержит ${url}`);
for (const item of search) {
  if (!item.title || !item.url || !item.description || !item.text) errors.push(`search-index.json ${item.url || '?'}: неполная запись.`);
  for (const field of ['topics', 'locations', 'period']) if (item[field] === undefined) errors.push(`search-index.json ${item.url}: отсутствует поле ${field}.`);
}

for (const item of pages) {
  const block = sitemap.match(new RegExp(`<url>\\s*<loc>${SITE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${item.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}<\\/loc>\\s*<lastmod>([^<]+)<\\/lastmod>`));
  if (!block) errors.push(`sitemap.xml не содержит ${item.url}`);
  else if (block[1] !== item.dateModified) errors.push(`sitemap.xml: lastmod ${item.url} не совпадает с dateModified.`);
}

const redirects = read('_redirects').split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
for (const line of redirects) {
  const [from, to, status] = line.split(/\s+/);
  if (!from || !to || !/^30[18]$/.test(status || '')) errors.push(`_redirects: неверная строка «${line}»`);
  if (sitemap.includes(`<loc>${SITE_URL}${from}</loc>`)) errors.push(`sitemap.xml содержит redirect-source ${from}`);
}

const requiredCatalogs = {
  'index.html': ['home:important', 'home:assessment', 'home:kremennaya', 'home:guide', 'home:dossier'],
  'news/index.html': ['news'],
  'news/kremennaya/index.html': ['section:kremennaya'],
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
  const manifest = readJson('data/map/manifest.json');
  const current = fs.readFileSync(path.join(ROOT, manifest.current.replace(/^\//, '')));
  if (sha256(current) !== manifest.currentHash) errors.push('data/map/manifest.json: currentHash не совпадает с zones.geojson.');
  if (!Array.isArray(manifest.snapshots) || !manifest.snapshots.length) errors.push('data/map/manifest.json: нет снимков карты.');
  else {
    const snapshotIds = new Set();
    const snapshotFiles = new Set();
    for (const snapshot of manifest.snapshots) {
      if (snapshotIds.has(snapshot.id)) errors.push(`Карта: повторяющийся id снимка ${snapshot.id}.`);
      if (snapshotFiles.has(snapshot.file)) errors.push(`Карта: повторяющийся файл снимка ${snapshot.file}.`);
      snapshotIds.add(snapshot.id); snapshotFiles.add(snapshot.file);
    const file = snapshot.file?.replace(/^\//, '');
    if (!file || !exists(file)) errors.push(`Карта: отсутствует снимок ${snapshot.file}`);
    else if (sha256(fs.readFileSync(path.join(ROOT, file))) !== snapshot.sha256) errors.push(`Карта: SHA-256 снимка ${snapshot.id} не совпадает.`);
      if (!snapshot.validFrom || !snapshot.assessmentUrl || !snapshot.methodologyUrl || !snapshot.confidence) errors.push(`Карта: неполные provenance-метаданные снимка ${snapshot.id}.`);
    }
  }
  if (!exists('map/archive/index.html')) errors.push('Карта: отсутствует пользовательская страница архива снимков.');
} catch (error) {
  errors.push(`Карта: ${error.message}`);
}

const htmlFiles = [];
const walk = directory => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'releases'].includes(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.html')) htmlFiles.push(full);
  }
};
walk(ROOT);
for (const full of htmlFiles) {
  const rel = path.relative(ROOT, full).replace(/\\/g, '/');
  const html = fs.readFileSync(full, 'utf8');
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

const jsFiles = [];
const toolFiles = [];
for (const entry of fs.readdirSync(path.join(ROOT, 'assets/js'))) if (entry.endsWith('.js')) jsFiles.push(`assets/js/${entry}`);
for (const entry of fs.readdirSync(path.join(ROOT, 'tools'))) if (entry.endsWith('.mjs')) toolFiles.push(`tools/${entry}`);
for (const file of [...jsFiles, ...toolFiles]) {
  const check = spawnSync(process.execPath, ['--check', path.join(ROOT, file)], { encoding: 'utf8' });
  if (check.status !== 0) errors.push(`${file}: синтаксическая ошибка JavaScript: ${check.stderr.trim()}`);
}

if (warnings.length) console.warn(`${warnings.length} предупреждений (не блокируют публикацию):\n${warnings.map(item => `• ${item}`).join('\n')}`);
if (errors.length) {
  console.error(`Проверка не пройдена: ${errors.length} ошибок.`);
  console.error(errors.map(item => `• ${item}`).join('\n'));
  process.exit(1);
}
console.log(`Проверка пройдена: ${pages.length} публикаций, ${htmlFiles.length} HTML-страниц, ошибок нет.`);
