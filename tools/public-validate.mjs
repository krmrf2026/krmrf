import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { listFiles, listPublicFiles } from './lib/project.mjs';
import { META_CSP, REFERRER_POLICY } from './lib/hosting.mjs';
import {
  REDIRECT_MARKER,
  redirectPages
} from './lib/redirects.mjs';

const ROOT = path.resolve(process.cwd());
const DIST = path.resolve(process.env.KRM_DIST_DIR || path.join(ROOT, 'dist'));
const errors = [];
if (!fs.existsSync(DIST)) {
  console.error('dist отсутствует. Выполните npm run export:public.');
  process.exit(1);
}
const redirects = redirectPages(ROOT);
const expected = [...new Set([
  ...listPublicFiles(ROOT),
  ...redirects.map(item => item.file)
])].sort((a, b) => a.localeCompare(b, 'ru'));
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
for (const redirect of redirects) {
  const html = fs.readFileSync(path.join(DIST, redirect.file), 'utf8');
  const absoluteTarget = `https://krmrf.ru${redirect.to}`;
  if (!html.includes(REDIRECT_MARKER)) errors.push(`${redirect.file}: отсутствует маркер страницы-перенаправления.`);
  if (!html.includes(`data-redirect-target="${redirect.to}"`)) errors.push(`${redirect.file}: неверная JavaScript-цель.`);
  if (!html.includes(`<meta content="${META_CSP}" http-equiv="Content-Security-Policy"/>`)) {
    errors.push(`${redirect.file}: отсутствует точная meta CSP.`);
  }
  if (!html.includes(`<meta content="${REFERRER_POLICY}" name="referrer"/>`)) {
    errors.push(`${redirect.file}: отсутствует meta referrer policy.`);
  }
  if (!html.includes(`content="0; url=${redirect.to}"`)) errors.push(`${redirect.file}: неверный мгновенный meta refresh.`);
  if (!html.includes(`href="${absoluteTarget}" rel="canonical"`)) errors.push(`${redirect.file}: неверный canonical.`);
  if (!/name="robots"[^>]*content="noindex,follow"|content="noindex,follow"[^>]*name="robots"/i.test(html)) {
    errors.push(`${redirect.file}: отсутствует noindex,follow.`);
  }
  if (!html.includes(`href="${redirect.to}"`)) errors.push(`${redirect.file}: отсутствует обычная ссылка на цель.`);
}
for (const forbidden of [
  'tools', '.github', 'package.json', 'README.md', 'data/pages.json',
  'data/content-integrity.json', '_headers', '_redirects'
]) {
  if (fs.existsSync(path.join(DIST, forbidden))) errors.push(`Служебный путь попал в dist: ${forbidden}`);
}
if (fs.readFileSync(path.join(DIST, 'CNAME'), 'utf8').trim() !== 'krmrf.ru') {
  errors.push('CNAME должен содержать только krmrf.ru.');
}
if (errors.length) {
  console.error(errors.map(item => `• ${item}`).join('\n'));
  process.exit(1);
}
console.log(`Публичная сборка проверена: ${actual.length} файлов, ${redirects.length} старых адресов, служебных данных и битых ссылок нет.`);
