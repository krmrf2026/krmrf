import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(process.cwd());
const errors = [];
const warnings = [];
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const exists = file => fs.existsSync(path.join(ROOT, file));
const pages = JSON.parse(read('data/pages.json'));
const search = JSON.parse(read('data/search-index.json'));
const sitemap = read('sitemap.xml');

const attr = (tag, name) => {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i'));
  return match ? match[2] : '';
};

const urlToFile = raw => {
  const url = String(raw || '').split('#')[0].split('?')[0];
  if (!url.startsWith('/')) return null;
  if (url === '/') return 'index.html';
  const clean = url.replace(/^\//, '');
  if (clean.endsWith('/')) return `${clean}index.html`;
  return clean;
};

if (!Array.isArray(pages)) errors.push('data/pages.json должен содержать массив.');
const ids = new Set();
const urls = new Set();
for (const item of pages) {
  for (const field of ['id', 'type', 'title', 'url', 'section', 'datePublished', 'dateModified', 'excerpt', 'image', 'imageAlt']) {
    if (item[field] === undefined || item[field] === null || item[field] === '') errors.push(`${item.id || '?'}: отсутствует ${field}`);
  }
  if (ids.has(item.id)) errors.push(`Повторяющийся id: ${item.id}`);
  if (urls.has(item.url)) errors.push(`Повторяющийся URL: ${item.url}`);
  ids.add(item.id); urls.add(item.url);
  const file = urlToFile(item.url);
  if (!file || !exists(file)) {
    errors.push(`${item.id}: отсутствует HTML ${file || item.url}`);
    continue;
  }
  if (!exists(item.image.replace(/^\//, ''))) errors.push(`${item.id}: отсутствует изображение ${item.image}`);
  const html = read(file);
  const h1 = (html.match(/<h1\b/gi) || []).length;
  if (h1 !== 1) errors.push(`${file}: H1 = ${h1}, должен быть один.`);
  if (!/<html\b[^>]*\blang=["']ru["']/i.test(html)) errors.push(`${file}: отсутствует lang="ru".`);
  const canonicalTag = (html.match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i) || html.match(/<link\b[^>]*href=["'][^"']+["'][^>]*rel=["']canonical["'][^>]*>/i))?.[0] || '';
  const canonical = attr(canonicalTag, 'href');
  if (canonical !== `https://krmrf.ru${item.url}`) errors.push(`${file}: canonical не совпадает с ${item.url}`);
  if (!/<meta\b[^>]*name=["']description["']/i.test(html)) errors.push(`${file}: нет meta description.`);
  const scripts = [...html.matchAll(/<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi)];
  if (!scripts.length) errors.push(`${file}: нет JSON-LD.`);
  scripts.forEach((match, index) => {
    try { JSON.parse(match[1]); } catch (error) { errors.push(`${file}: JSON-LD ${index + 1} невалиден: ${error.message}`); }
  });
}

const searchUrls = new Set(search.map(item => item.url));
for (const url of urls) if (!searchUrls.has(url)) errors.push(`search-index.json не содержит ${url}`);
for (const url of urls) if (!sitemap.includes(`<loc>https://krmrf.ru${url}</loc>`)) errors.push(`sitemap.xml не содержит ${url}`);

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
  if (intro.includes(technical)) errors.push(`archive/index.html: техническая ссылка ${technical} осталась в вводном блоке.`);
}
for (const url of urls) if (!archive.includes(`href="${url}"`)) errors.push(`archive/index.html не содержит ${url}`);

const htmlFiles = [];
const walk = directory => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['.git', 'node_modules'].includes(entry.name)) continue;
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
  for (const ref of refs) {
    if (!ref.startsWith('/') || ref.startsWith('//')) continue;
    const file = urlToFile(ref);
    if (file && !exists(file)) errors.push(`${rel}: битая локальная ссылка ${ref}`);
  }
}

const jsFiles = fs.readdirSync(path.join(ROOT, 'assets/js')).filter(file => file.endsWith('.js'))
  .map(file => `assets/js/${file}`);
for (const file of [...jsFiles, 'tools/build.mjs', 'tools/validate.mjs', 'tools/serve.mjs']) {
  const check = spawnSync(process.execPath, ['--check', path.join(ROOT, file)], { encoding: 'utf8' });
  if (check.status !== 0) errors.push(`${file}: синтаксическая ошибка JavaScript: ${check.stderr.trim()}`);
}

if (warnings.length) console.warn(warnings.map(item => `Предупреждение: ${item}`).join('\n'));
if (errors.length) {
  console.error(`Проверка не пройдена: ${errors.length} ошибок.`);
  console.error(errors.map(item => `• ${item}`).join('\n'));
  process.exit(1);
}
console.log(`Проверка пройдена: ${pages.length} публикаций, ${htmlFiles.length} HTML-страниц, ошибок нет.`);
