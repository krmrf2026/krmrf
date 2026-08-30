import fs from 'node:fs';
import { ARTICLE_IMAGE_SIZES } from './lib/image-sizes.mjs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(process.cwd());
const WIDTHS = [480, 960];
const pages = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/pages.json'), 'utf8'));
const SITE_ORIGIN = 'https://krmrf.ru';
const required = new Map();
const imageInfoCache = new Map();

const works = (command, args = ['-version']) => {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  return result.status === 0;
};

const magickCommand = process.platform === 'win32' ? 'magick.exe' : 'magick';
const hasMagick = works(magickCommand, ['identify', '-version']);
const convertCommand = hasMagick ? magickCommand : process.platform === 'win32' ? null : 'convert';
const identifyCommand = hasMagick ? magickCommand : process.platform === 'win32' ? null : 'identify';
const identifyPrefix = hasMagick ? ['identify'] : [];

if (!convertCommand || !identifyCommand || !works(convertCommand) || !works(identifyCommand)) {
  console.error('Для проверки и создания адаптивных изображений нужен ImageMagick.');
  console.error('Ubuntu/Codespaces: sudo apt-get update && sudo apt-get install -y imagemagick');
  process.exit(1);
}

const attr = (tag, name) => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return tag.match(new RegExp(`\\b${escaped}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i'))?.[2] || '';
};

const setAttr = (tag, name, value) => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const encoded = String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;');
  const pattern = new RegExp(`\\s+${escaped}\\s*=\\s*(["'])[\\s\\S]*?\\1`, 'i');
  if (pattern.test(tag)) return tag.replace(pattern, ` ${name}="${encoded}"`);
  return tag.replace(/\s*\/?>$/, ending => ` ${name}="${encoded}"${ending.includes('/') ? '/>' : '>'}`);
};

const removeAttr = (tag, name) => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return tag.replace(new RegExp(`\\s+${escaped}\\s*=\\s*(["'])[\\s\\S]*?\\1`, 'i'), '');
};

const htmlFileFor = url => path.join(ROOT, ...String(url).split('/').filter(Boolean), 'index.html');

const localImageUrl = (raw, htmlFile) => {
  let value = String(raw || '').split('#')[0].split('?')[0].trim();
  if (!value) return null;

  if (/^https?:\/\//i.test(value)) {
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      return null;
    }
    if (parsed.origin !== SITE_ORIGIN) return null;
    value = parsed.pathname;
  }

  if (!value.startsWith('/')) {
    const htmlDirectory = path.posix.dirname(`/${path.relative(ROOT, htmlFile).replaceAll(path.sep, '/')}`);
    value = path.posix.join(htmlDirectory, value);
  }

  value = path.posix.normalize(value);
  if (!value.startsWith('/assets/img/') || value.includes('/derived/')) return null;
  return value;
};

const sourcePath = imageUrl => imageUrl.replace(/^\//, '');

const derivedPath = (imageUrl, width) => {
  const relative = imageUrl.replace(/^\//, '').replace(/^assets\/img\//, '');
  const parsed = path.posix.parse(relative);
  return path.posix.join('assets/img/derived', parsed.dir, `${parsed.name}-${width}.webp`);
};

const identify = relativeFile => {
  if (imageInfoCache.has(relativeFile)) return imageInfoCache.get(relativeFile);
  const absolute = path.join(ROOT, relativeFile);
  if (!fs.existsSync(absolute)) throw new Error(`Не найдено изображение: ${relativeFile}`);
  const result = spawnSync(
    identifyCommand,
    [...identifyPrefix, '-ping', '-format', '%w %h', absolute],
    { encoding: 'utf8' }
  );
  if (result.status !== 0) {
    throw new Error(`Не удалось прочитать изображение ${relativeFile}: ${result.stderr || result.stdout}`);
  }
  const [width, height] = result.stdout.trim().split(/\s+/).map(Number);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error(`Некорректные размеры изображения ${relativeFile}: ${result.stdout}`);
  }
  const info = { width, height };
  imageInfoCache.set(relativeFile, info);
  return info;
};

const addRequired = ({ imageUrl, width, reason }) => {
  const source = sourcePath(imageUrl);
  const output = derivedPath(imageUrl, width);
  const key = output;
  if (!required.has(key)) required.set(key, { source, output, width, reasons: new Set() });
  if (reason) required.get(key).reasons.add(reason);
};

const registerImage = (imageUrl, reason) => {
  const source = sourcePath(imageUrl);
  const info = identify(source);
  for (const width of WIDTHS.filter(candidate => candidate < info.width)) {
    addRequired({ imageUrl, width, reason });
  }
  return info;
};

const pageSources = new Map();

for (const page of pages) {
  const file = htmlFileFor(page.url);
  const html = fs.readFileSync(file, 'utf8');
  const main = html.match(/<main\b[\s\S]*?<\/main>/i)?.[0] || '';
  const sources = new Set();

  for (const match of main.matchAll(/<img\b[^>]*>/gi)) {
    const imageUrl = localImageUrl(attr(match[0], 'src'), file);
    if (!imageUrl) continue;
    registerImage(imageUrl, page.url);
    sources.add(imageUrl);
  }

  const catalogImage = localImageUrl(page.image, file);
  if (catalogImage) {
    registerImage(catalogImage, `${page.url} (pages.json)`);
    sources.add(catalogImage);
  }

  pageSources.set(file, sources);
}

const currentDerived = [];
const walkDerived = directory => {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walkDerived(absolute);
    else if (entry.isFile() && /-(?:480|960)\.webp$/i.test(entry.name)) {
      currentDerived.push(path.relative(ROOT, absolute).replaceAll(path.sep, '/'));
    }
  }
};

walkDerived(path.join(ROOT, 'assets/img/derived'));

let removed = 0;
for (const file of currentDerived) {
  if (required.has(file)) continue;
  fs.rmSync(path.join(ROOT, file));
  imageInfoCache.delete(file);
  removed += 1;
}

let created = 0;
let repaired = 0;
for (const item of [...required.values()].sort((a, b) => a.output.localeCompare(b.output))) {
  const output = path.join(ROOT, item.output);
  const exists = fs.existsSync(output);
  const valid = exists && identify(item.output).width === item.width;
  if (valid) continue;

  fs.mkdirSync(path.dirname(output), { recursive: true });
  const args = [
    ...(hasMagick ? [] : []),
    path.join(ROOT, item.source),
    '-auto-orient',
    '-resize',
    `${item.width}x>`,
    '-strip',
    '-quality',
    '84',
    output
  ];
  const result = spawnSync(convertCommand, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(`Не удалось создать ${item.output}: ${result.stderr || result.stdout}`);
    process.exit(1);
  }
  imageInfoCache.delete(item.output);
  const generated = identify(item.output);
  if (generated.width !== item.width) {
    console.error(`Неверная ширина ${item.output}: ${generated.width}, ожидалось ${item.width}.`);
    process.exit(1);
  }
  if (exists) repaired += 1;
  else created += 1;
}

const responsiveTag = (tag, htmlFile) => {
  const imageUrl = localImageUrl(attr(tag, 'src'), htmlFile);
  if (!imageUrl) return tag;
  const info = identify(sourcePath(imageUrl));
  const candidates = WIDTHS
    .filter(width => width < info.width)
    .map(width => `/${derivedPath(imageUrl, width)} ${width}w`);

  let updated = setAttr(tag, 'src', imageUrl);
  updated = setAttr(updated, 'width', info.width);
  updated = setAttr(updated, 'height', info.height);
  updated = setAttr(updated, 'decoding', 'async');

  if (candidates.length) {
    candidates.push(`${imageUrl} ${info.width}w`);
    updated = setAttr(updated, 'srcset', candidates.join(', '));
    updated = setAttr(
      updated,
      'sizes',
      ARTICLE_IMAGE_SIZES
    );
  } else {
    updated = removeAttr(updated, 'srcset');
    updated = removeAttr(updated, 'sizes');
  }

  return updated;
};

let updatedPages = 0;
for (const [file] of pageSources) {
  const html = fs.readFileSync(file, 'utf8');
  const updated = html.replace(
    /<main\b[\s\S]*?<\/main>/i,
    main => main.replace(/<img\b[^>]*>/gi, tag => responsiveTag(tag, file))
  );
  if (updated !== html) {
    fs.writeFileSync(file, updated, 'utf8');
    updatedPages += 1;
  }
}

console.log(`Изображения проверены: ${imageInfoCache.size} исходных/производных файлов.`);
console.log(`Адаптивные варианты: ${required.size}; создано ${created}, исправлено ${repaired}, удалено лишних ${removed}.`);
console.log(`HTML синхронизирован: ${updatedPages} публикаций.`);
