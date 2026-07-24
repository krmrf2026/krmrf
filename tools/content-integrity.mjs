import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { sha256 } from './lib/project.mjs';

const ROOT = path.resolve(process.cwd());
const MANIFEST = path.join(ROOT, 'data/content-integrity.json');
const pages = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/pages.json'), 'utf8'));

const stableArticle = html => {
  let article = html.match(/<article\b[^>]*class=["'][^"']*\barticle\b[^"']*["'][^>]*>[\s\S]*?<\/article>/i)?.[0] || '';
  article = article
    .replace(/<!-- KRM GUIDE STATUS START -->[\s\S]*?<!-- KRM GUIDE STATUS END -->/g, '')
    .replace(/<!-- KRM REVISION META START -->[\s\S]*?<!-- KRM REVISION META END -->/g, '')
    .replace(/<p\b[^>]*class=["'][^"']*(?:article-meta|revision-meta)[^"']*["'][^>]*>[\s\S]*?<\/p>/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .trim();
  return article;
};

const current = Object.fromEntries(pages.map(item => {
  const file = path.join(ROOT, item.url.replace(/^\//, ''), 'index.html');
  const stable = stableArticle(fs.readFileSync(file, 'utf8'));
  if (!stable) throw new Error(`Не найден article для ${item.url}`);
  return [item.url, sha256(Buffer.from(stable, 'utf8'))];
}));

if (process.argv.includes('--write')) {
  fs.writeFileSync(MANIFEST, `${JSON.stringify({ schema: 'krmrf-content-integrity-v1', pages: current }, null, 2)}\n`);
  console.log(`Зафиксирована целостность текстов: ${Object.keys(current).length} публикаций.`);
  process.exit(0);
}

if (!fs.existsSync(MANIFEST)) {
  console.error('data/content-integrity.json отсутствует. Выполните npm run content:lock после осознанной редакционной правки.');
  process.exit(1);
}
const saved = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const errors = [];
for (const url of new Set([...Object.keys(saved.pages || {}), ...Object.keys(current)])) {
  if (!saved.pages?.[url]) errors.push(`Новая публикация не зафиксирована: ${url}`);
  else if (!current[url]) errors.push(`Публикация исчезла: ${url}`);
  else if (saved.pages[url] !== current[url]) errors.push(`Изменился текст публикации: ${url}`);
}
if (errors.length) {
  console.error(errors.map(item => `• ${item}`).join('\n'));
  process.exit(1);
}
console.log(`Целостность текстов подтверждена: ${Object.keys(current).length} публикаций.`);
