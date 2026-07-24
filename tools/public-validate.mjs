import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { listFiles, listPublicFiles } from './lib/project.mjs';

const ROOT = path.resolve(process.cwd());
const DIST = path.resolve(process.env.KRM_DIST_DIR || path.join(ROOT, 'dist'));
const errors = [];
if (!fs.existsSync(DIST)) {
  console.error('dist отсутствует. Выполните npm run export:public.');
  process.exit(1);
}
const expected = listPublicFiles(ROOT);
const actual = listFiles(DIST);
for (const file of expected) if (!actual.includes(file)) errors.push(`В dist отсутствует: ${file}`);
for (const file of actual) if (!expected.includes(file)) errors.push(`Лишний файл в dist: ${file}`);

const urlToFile = raw => {
  const value = String(raw || '').split('#')[0].split('?')[0];
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  if (value === '/') return 'index.html';
  const clean = value.slice(1);
  return clean.endsWith('/') ? `${clean}index.html` : clean;
};
for (const file of actual.filter(file => file.endsWith('.html'))) {
  const html = fs.readFileSync(path.join(DIST, file), 'utf8');
  const refs = [...html.matchAll(/\b(?:href|src)=["']([^"']+)["']/gi)].map(match => match[1]);
  for (const match of html.matchAll(/\bsrcset\s*=\s*(["'])([\s\S]*?)\1/gi)) {
    refs.push(...match[2].split(',').map(item => item.trim().split(/\s+/)[0]).filter(Boolean));
  }
  for (const ref of refs) {
    const target = urlToFile(ref);
    if (target && !fs.existsSync(path.join(DIST, target))) errors.push(`${file}: битая ссылка ${ref}`);
  }
}
for (const forbidden of ['tools', '.github', 'package.json', 'README.md', 'data/pages.json', 'data/content-integrity.json']) {
  if (fs.existsSync(path.join(DIST, forbidden))) errors.push(`Служебный путь попал в dist: ${forbidden}`);
}
if (errors.length) {
  console.error(errors.map(item => `• ${item}`).join('\n'));
  process.exit(1);
}
console.log(`Публичная сборка проверена: ${actual.length} файлов, служебных данных и битых ссылок нет.`);
