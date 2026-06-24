import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const WIDTHS = [480, 960];
const pages = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/pages.json'), 'utf8'));
const command = process.platform === 'win32' ? 'magick.exe' : 'magick';
const probe = spawnSync(command, ['-version'], { encoding: 'utf8' });
const required = new Map();

const cleanUrl = value => String(value || '').split('#')[0].split('?')[0];

const derivedPath = (image, width) => {
  const relative = image.replace(/^\//, '').replace(/^assets\/img\//, '');
  const parsed = path.posix.parse(relative);
  return path.posix.join('assets/img/derived', parsed.dir, `${parsed.name}-${width}.webp`);
};

const addRequired = ({ source, output, width, reason }) => {
  const key = output;
  if (!required.has(key)) required.set(key, { source, output, width, reasons: new Set() });
  if (reason) required.get(key).reasons.add(reason);
};

const addPageImage = page => {
  const image = cleanUrl(page.image);
  if (!image.startsWith('/assets/img/') || image.includes('/derived/')) return;
  const source = image.replace(/^\//, '');
  for (const width of WIDTHS) {
    addRequired({ source, output: derivedPath(image, width), width, reason: page.id || page.url || 'pages.json' });
  }
};

const sourceFromDerived = derivedUrl => {
  const clean = cleanUrl(derivedUrl);
  if (!clean.startsWith('/assets/img/derived/')) return null;
  const relative = clean.slice('/assets/img/derived/'.length);
  const match = relative.match(/^(.*)-(\d+)\.webp$/i);
  if (!match) return null;
  const [, base, widthRaw] = match;
  const width = Number(widthRaw);
  if (!WIDTHS.includes(width)) return null;
  return {
    source: `assets/img/${base}.webp`,
    output: clean.replace(/^\//, ''),
    width
  };
};

const htmlFiles = [];
const walk = directory => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'releases'].includes(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.html')) htmlFiles.push(full);
  }
};

for (const page of pages) addPageImage(page);

walk(ROOT);
for (const full of htmlFiles) {
  const html = fs.readFileSync(full, 'utf8');
  const rel = path.relative(ROOT, full).replace(/\\/g, '/');
  for (const match of html.matchAll(/\bsrcset\s*=\s*(["'])([\s\S]*?)\1/gi)) {
    const candidates = match[2].split(',').map(item => item.trim().split(/\s+/)[0]).filter(Boolean);
    for (const candidate of candidates) {
      const derived = sourceFromDerived(candidate);
      if (derived) addRequired({ ...derived, reason: rel });
    }
  }
}

const missing = [...required.values()].filter(item => !fs.existsSync(path.join(ROOT, item.output)));

if (!missing.length) {
  console.log(`Производные изображения уже существуют: проверено ${required.size} файлов.`);
  process.exit(0);
}
if (probe.status !== 0) {
  console.error(`Не хватает ${missing.length} производных изображений, но ImageMagick не найден.`);
  console.error('Установите ImageMagick, выполните npm run images локально и добавьте созданные WebP в commit.');
  missing.forEach(item => console.error(`• ${[...item.reasons].join(', ')}: ${item.output}`));
  process.exit(1);
}

for (const item of missing) {
  const source = path.join(ROOT, item.source);
  const output = path.join(ROOT, item.output);
  if (!fs.existsSync(source)) {
    console.error(`Исходное изображение не найдено: ${item.source}`);
    console.error(`Нужно для: ${[...item.reasons].join(', ')}`);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const result = spawnSync(command, [source, '-auto-orient', '-resize', `${item.width}x>`, '-strip', '-quality', '84', output], { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(`Не удалось создать ${item.output}: ${result.stderr || result.stdout}`);
    process.exit(1);
  }
  console.log(`Создано: ${item.output}`);
}
console.log(`Генерация завершена: ${missing.length} файлов.`);
