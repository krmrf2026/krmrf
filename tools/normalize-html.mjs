import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(process.cwd());
const SITE_URL = 'https://krmrf.ru';
const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/site.json'), 'utf8'));
const pages = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/pages.json'), 'utf8'));
const assetVersion = site.assetVersion || site.version;

const SECTION_LABELS = {
  kremennaya: 'Кременная',
  svo: 'СВО',
  law: 'Справочник',
  lnr: 'ЛНР',
  'civilian-impact': 'Гражданские последствия',
  politics: 'Политика',
  assessment: 'Оценки фронта',
  warcrimes: 'Досье'
};

const escapeHtml = value => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const escapeRegExp = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const routeToFile = url => `${String(url).replace(/^\//, '').replace(/\/$/, '')}/index.html`;
const pageByFile = new Map(pages.map(page => [routeToFile(page.url), page]));

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

const readUInt24LE = (buffer, offset) => buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);

const webpSize = buffer => {
  if (buffer.length < 30 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') return null;
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const type = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const data = offset + 8;
    if (type === 'VP8X' && data + 10 <= buffer.length) {
      return { width: readUInt24LE(buffer, data + 4) + 1, height: readUInt24LE(buffer, data + 7) + 1 };
    }
    if (type === 'VP8L' && data + 5 <= buffer.length && buffer[data] === 0x2f) {
      const b1 = buffer[data + 1];
      const b2 = buffer[data + 2];
      const b3 = buffer[data + 3];
      const b4 = buffer[data + 4];
      return {
        width: 1 + b1 + ((b2 & 0x3f) << 8),
        height: 1 + ((b2 >> 6) & 0x03) + (b3 << 2) + ((b4 & 0x0f) << 10)
      };
    }
    if (type === 'VP8 ' && data + 10 <= buffer.length && buffer[data + 3] === 0x9d && buffer[data + 4] === 0x01 && buffer[data + 5] === 0x2a) {
      return {
        width: buffer.readUInt16LE(data + 6) & 0x3fff,
        height: buffer.readUInt16LE(data + 8) & 0x3fff
      };
    }
    offset = data + size + (size % 2);
  }
  return null;
};

const pngSize = buffer => {
  if (buffer.length < 24 || buffer.toString('hex', 0, 8) !== '89504e470d0a1a0a') return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
};

const jpegSize = buffer => {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 4 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    const marker = buffer[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    const length = buffer.readUInt16BE(offset);
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5) };
    }
    offset += length;
  }
  return null;
};

const imageSizeCache = new Map();
const imageSize = rawUrl => {
  const clean = String(rawUrl || '').split('#')[0].split('?')[0];
  if (!clean.startsWith('/assets/')) return null;
  if (imageSizeCache.has(clean)) return imageSizeCache.get(clean);
  const file = path.join(ROOT, clean.replace(/^\//, ''));
  if (!fs.existsSync(file)) { imageSizeCache.set(clean, null); return null; }
  const buffer = fs.readFileSync(file);
  const ext = path.extname(file).toLowerCase();
  const size = ext === '.webp' ? webpSize(buffer) : ext === '.png' ? pngSize(buffer) : ['.jpg', '.jpeg'].includes(ext) ? jpegSize(buffer) : null;
  imageSizeCache.set(clean, size);
  return size;
};

const getAttr = (tag, name) => {
  const match = tag.match(new RegExp(`\\b${escapeRegExp(name)}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i'));
  return match ? match[2] : '';
};

const setAttr = (tag, name, value) => {
  const pattern = new RegExp(`\\s${escapeRegExp(name)}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i');
  const replacement = ` ${name}="${escapeHtml(value)}"`;
  return pattern.test(tag) ? tag.replace(pattern, replacement) : tag.replace(/\s*\/?\s*>$/, `${replacement}$&`);
};

const upsertMeta = (html, attribute, key, content, anchor = /<meta\b[^>]*(?:property|name)=["']og:title["'][^>]*>/i) => {
  const pattern = new RegExp(`<meta\\b(?=[^>]*\\b${escapeRegExp(attribute)}\\s*=\\s*(["'])${escapeRegExp(key)}\\1)[^>]*>`, 'i');
  const tag = `<meta content="${escapeHtml(content)}" ${attribute}="${key}"/>`;
  if (pattern.test(html)) return html.replace(pattern, tag);
  const match = html.match(anchor);
  if (match) return html.replace(match[0], `${tag}\n${match[0]}`);
  return html.replace(/<\/head>/i, `${tag}\n</head>`);
};

const normalizeAssetVersions = html => html.replace(
  /(\/(?:assets\/(?:css|js|vendor)\/)[^"'?#\s]+)(?:\?v=[^"'\s]+)?/g,
  `$1?v=${assetVersion}`
);

const normalizeMetrika = html => {
  if (!html.includes('id="site-navigation"') && !html.includes("id='site-navigation'")) return html;
  const block = `<!-- Yandex.Metrika counter -->\n<script defer src="/assets/js/metrika.js?v=${assetVersion}"></script>\n<noscript><div><img src="https://mc.yandex.ru/watch/110383043" style="position:absolute; left:-9999px" alt=""/></div></noscript>\n<!-- /Yandex.Metrika counter -->`;
  if (/<!-- Yandex\.Metrika counter -->[\s\S]*?<!-- \/Yandex\.Metrika counter -->/i.test(html)) {
    return html.replace(/<!-- Yandex\.Metrika counter -->[\s\S]*?<!-- \/Yandex\.Metrika counter -->/i, block);
  }
  return html.replace(/<\/head>/i, `${block}\n</head>`);
};

const normalizeFooter = html => {
  if (!html.includes('site-footer__meta')) return html;
  return html.replace(
    /<div class="container container--wide site-footer__meta">[\s\S]*?<\/div>/i,
    `<div class="container container--wide site-footer__meta"><span>Версия архива: ${escapeHtml(site.version)}</span><span>Техническая сборка: ${escapeHtml(site.buildDate)}</span></div>`
  );
};

const normalizeCommonLayoutWhitespace = html => {
  if (!html.includes('id="site-navigation"') && !html.includes("id='site-navigation'")) return html;
  const normalizeBlock = block => block.replace(/>\s+</g, '>\n<');
  let updated = html.replace(/<header\b[^>]*class=["'][^"']*\bsite-header\b[^"']*["'][^>]*>[\s\S]*?<\/header>/i, normalizeBlock);
  updated = updated.replace(/<footer\b[^>]*class=["'][^"']*\bsite-footer\b[^"']*["'][^>]*>[\s\S]*?<\/footer>/i, normalizeBlock);
  return updated;
};

const normalizeCommonMeta = (html, page = null) => {
  if (!html.includes('id="site-navigation"') && !html.includes("id='site-navigation'")) return html;
  const title = page?.title || getAttr(html.match(/<meta\b[^>]*property=["']og:title["'][^>]*>/i)?.[0] || '', 'content') || 'KRM РФ';
  const imageAlt = page?.imageAlt || getAttr(html.match(/<meta\b[^>]*property=["']og:image:alt["'][^>]*>/i)?.[0] || '', 'content') || title;
  let updated = html;
  updated = upsertMeta(updated, 'property', 'og:locale', 'ru_RU', /<meta\b[^>]*property=["']og:type["'][^>]*>/i);
  updated = upsertMeta(updated, 'property', 'og:site_name', 'KRM РФ', /<meta\b[^>]*property=["']og:title["'][^>]*>/i);
  updated = upsertMeta(updated, 'property', 'og:image:alt', imageAlt, /<meta\b[^>]*name=["']twitter:card["'][^>]*>/i);
  updated = upsertMeta(updated, 'name', 'twitter:image:alt', imageAlt, /<link\b[^>]*rel=["']icon["'][^>]*>/i);
  if (page) {
    updated = upsertMeta(updated, 'property', 'article:published_time', `${page.datePublished}T00:00:00+03:00`, /<meta\b[^>]*name=["']twitter:card["'][^>]*>/i);
    updated = upsertMeta(updated, 'property', 'article:modified_time', `${page.dateModified}T00:00:00+03:00`, /<meta\b[^>]*name=["']twitter:card["'][^>]*>/i);
    updated = upsertMeta(updated, 'property', 'article:section', SECTION_LABELS[page.section] || page.section, /<meta\b[^>]*name=["']twitter:card["'][^>]*>/i);
  }
  return updated;
};

const normalizeSrcsets = html => html.replace(/<img\b[^>]*>/gi, tag => {
  const srcset = getAttr(tag, 'srcset');
  if (!srcset) return tag;
  const candidates = [];
  for (const raw of srcset.split(',')) {
    const parts = raw.trim().split(/\s+/);
    if (!parts[0]) continue;
    const size = imageSize(parts[0]);
    if (size?.width) candidates.push({ url: parts[0], width: size.width });
    else candidates.push({ url: parts[0], width: Number.parseInt(parts[1] || '', 10) || 0 });
  }
  const byWidth = new Map();
  for (const candidate of candidates) {
    const previous = byWidth.get(candidate.width);
    const candidateDerived = candidate.url.includes('/derived/');
    const previousDerived = previous?.url.includes('/derived/');
    if (!previous || (previousDerived && !candidateDerived)) byWidth.set(candidate.width, candidate);
  }
  const normalized = [...byWidth.values()].sort((a, b) => a.width - b.width)
    .map(candidate => candidate.width ? `${candidate.url} ${candidate.width}w` : candidate.url)
    .join(', ');
  return setAttr(tag, 'srcset', normalized);
});

const normalizeNonCardImageDimensions = html => {
  const cardRanges = [...html.matchAll(/<article\b[^>]*class=["'][^"']*\bmaterial-card\b[^"']*["'][^>]*>[\s\S]*?<\/article>/gi)]
    .map(match => [match.index, match.index + match[0].length]);
  return html.replace(/<img\b[^>]*>/gi, (tag, offset) => {
    if (cardRanges.some(([start, end]) => offset >= start && offset < end)) return tag;
    const src = getAttr(tag, 'src');
    const size = imageSize(src);
    if (!size) return tag;
    let updated = setAttr(tag, 'width', String(size.width));
    updated = setAttr(updated, 'height', String(size.height));
    return updated;
  });
};

let changed = 0;
for (const file of htmlFiles) {
  const relative = path.relative(ROOT, file).replace(/\\/g, '/');
  const original = fs.readFileSync(file, 'utf8');
  let updated = original;
  const page = pageByFile.get(relative) || null;
  updated = normalizeCommonMeta(updated, page);
  updated = normalizeMetrika(updated);
  updated = normalizeAssetVersions(updated);
  updated = normalizeFooter(updated);
  updated = normalizeCommonLayoutWhitespace(updated);
  updated = normalizeSrcsets(updated);
  updated = normalizeNonCardImageDimensions(updated);
  if (updated !== original) {
    fs.writeFileSync(file, updated, 'utf8');
    changed += 1;
  }
}

console.log(`Нормализация HTML завершена: изменено ${changed} файлов из ${htmlFiles.length}.`);
