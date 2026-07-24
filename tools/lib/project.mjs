import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const SITE_URL = 'https://krmrf.ru';

export const SECTION_LABELS = Object.freeze({
  kremennaya: 'Кременная',
  svo: 'СВО',
  law: 'Справочник',
  lnr: 'ЛНР',
  'civilian-impact': 'Гражданские последствия',
  politics: 'Политика',
  warcrimes: 'Досье',
  assessment: 'Оценки фронта'
});

export const TYPE_LABELS = Object.freeze({
  article: 'Материал',
  guide: 'Практическая памятка',
  assessment: 'Оценка фронта',
  dossier: 'CASE FILE'
});

export const SOURCE_EXCLUDED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'releases',
  'krmrf-releases'
]);

export const SOURCE_EXCLUDED_FILES = new Set([
  '.DS_Store',
  'SHA256SUMS'
]);

export const PUBLIC_ROOT_FILES = new Set([
  '404.html',
  'CNAME',
  '_headers',
  '_redirects',
  'feed.xml',
  'google3409616a5ee877bf.html',
  'index.html',
  'robots.txt',
  'sitemap.xml',
  'yandex_714f993ff2afaee8.html'
]);

export const PUBLIC_DIRS = new Set([
  'about',
  'archive',
  'assessment',
  'assets',
  'kremennaya',
  'map',
  'methodology',
  'news',
  'privacy',
  'reference',
  'search',
  'war-crimes'
]);

export const PUBLIC_DATA_FILES = new Set([
  'map-changes.json',
  'rf_regions.json',
  'search-index.json',
  'zones.geojson'
]);

export const normalizeRel = value => value.replace(/\\/g, '/');

export const listFiles = (root, {
  excludedDirs = SOURCE_EXCLUDED_DIRS,
  excludedFiles = SOURCE_EXCLUDED_FILES
} = {}) => {
  const files = [];
  const walk = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && excludedDirs.has(entry.name)) continue;
      if (entry.isFile() && excludedFiles.has(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) files.push(normalizeRel(path.relative(root, absolute)));
    }
  };
  walk(root);
  return files.sort((a, b) => a.localeCompare(b));
};

export const listPublicFiles = root => {
  const result = [];
  for (const file of listFiles(root)) {
    const parts = file.split('/');
    if (parts.length === 1 && PUBLIC_ROOT_FILES.has(file)) {
      result.push(file);
      continue;
    }
    if (parts[0] === 'data' && parts.length === 2 && PUBLIC_DATA_FILES.has(parts[1])) {
      result.push(file);
      continue;
    }
    if (PUBLIC_DIRS.has(parts[0])) result.push(file);
  }
  return result.sort((a, b) => a.localeCompare(b));
};

export const readJson = (root, file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));

export const sha256 = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
