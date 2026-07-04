import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const today = new Date().toISOString().slice(0, 10);
const sourcesFile = 'data/sources.json';

const args = new Map();
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^--([^=]+)=(.+)$/);
  if (m) args.set(m[1], m[2]);
  else args.set(arg.replace(/^--/, ''), true);
}

const dryRun = args.has('dry-run');
const maxFileMb = Number(args.get('max-file-mb') || 10);
const maxTotalMb = Number(args.get('limit-mb') || 50);
const maxFileBytes = maxFileMb * 1024 * 1024;
const maxTotalBytes = maxTotalMb * 1024 * 1024;

const officialHosts = [
  'publication.pravo.gov.ru',
  'pravo.gov.ru',
  'sovminlnr.ru',
  'rosreestr.gov.ru',
  'lugansk.regions.rosreestr.ru',
  'gosuslugi.ru',
  'kremlin.ru',
  'mid.ru',
  'ukraine.ohchr.org',
  'ohchr.org',
  'ihl-databases.icrc.org',
  'icrc.org',
  'ombudsmanrf.org',
  'gvp.gov.ru',
  'base.garant.ru',
  'letters.mil.ru',
  'ukraine.un.org'
];

const blockedExtensions = /\.(mp4|mov|avi|mkv|webm|mp3|wav|zip|rar|7z)(\?|$)/i;

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function isOfficialSource(source) {
  const host = hostOf(source.url);
  const url = String(source.url || '').toLowerCase();

  if (!host) return false;
  if (blockedExtensions.test(url)) return false;

  return officialHosts.some(official => {
    return host === official || host.endsWith('.' + official);
  });
}

function safeName(value) {
  return String(value || 'source')
    .toLowerCase()
    .replace(/https?:\/\//g, '')
    .replace(/[^a-zа-яё0-9._-]+/giu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || 'source';
}

function extFrom(source, contentType) {
  const url = String(source.url || '').toLowerCase();
  const type = String(contentType || '').toLowerCase();

  if (type.includes('application/pdf') || url.endsWith('.pdf')) return '.pdf';
  if (type.includes('text/html') || type.includes('application/xhtml')) return '.html';
  if (type.includes('application/json')) return '.json';
  if (type.includes('text/plain')) return '.txt';
  if (type.includes('xml')) return '.xml';

  return '.html';
}

async function download(source) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch(source.url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'KRM-RF-Archive/2026.7 source preservation',
        'Accept': 'text/html,application/pdf,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5'
      }
    });

    const contentType = response.headers.get('content-type') || '';
    const buffer = Buffer.from(await response.arrayBuffer());

    if (buffer.length > maxFileBytes) {
      return {
        ok: false,
        skipped: true,
        reason: `больше лимита на файл ${maxFileMb} МБ`,
        bytes: buffer.length
      };
    }

    const ext = extFrom(source, contentType);
    const dir = path.join('data/sources/files', source.id);
    const filename = safeName(hostOf(source.url) || source.publisher || source.title) + ext;
    const dest = path.join(dir, filename);

    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

    if (!dryRun) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(dest, buffer);

      source.accessedAt = today;
      source.preservedAt = today;
      source.localCopy = '/' + dest.replaceAll(path.sep, '/');
      source.sha256 = sha256;
      source.status = 'preserved';
      source.notes = `Локальная копия официального источника сохранена KRM РФ ${today}. HTTP ${response.status}; content-type: ${contentType || 'unknown'}.`;

      if (Array.isArray(source.referencedBy)) {
        source.referencedBy = [...new Set(source.referencedBy)].sort();
      }
    }

    return {
      ok: true,
      status: response.status,
      contentType,
      bytes: buffer.length,
      sha256,
      localPath: '/' + dest.replaceAll(path.sep, '/')
    };
  } catch (error) {
    return {
      ok: false,
      reason: error.message,
      bytes: 0
    };
  } finally {
    clearTimeout(timeout);
  }
}

const sources = JSON.parse(fs.readFileSync(sourcesFile, 'utf8'));

const candidates = sources
  .filter(source => !source.localCopy)
  .filter(isOfficialSource);

console.log('Сохранение официальных источников KRM РФ');
console.log('');
console.log(`Кандидатов: ${candidates.length}`);
console.log(`Лимит на файл: ${maxFileMb} МБ`);
console.log(`Лимит за запуск: ${maxTotalMb} МБ`);
if (dryRun) console.log('Режим dry-run: файлы не будут записаны.');
console.log('');

let totalBytes = 0;
let saved = 0;
let skipped = 0;
let failed = 0;

for (const source of candidates) {
  if (totalBytes >= maxTotalBytes) {
    console.log(`Достигнут общий лимит ${maxTotalMb} МБ. Остановка.`);
    break;
  }

  console.log(`${source.id} | ${hostOf(source.url)} | ${source.title}`);
  const result = await download(source);

  if (result.ok) {
    saved++;
    totalBytes += result.bytes;
    console.log(`  OK: ${(result.bytes / 1024 / 1024).toFixed(2)} МБ`);
    console.log(`  ${result.localPath}`);
  } else if (result.skipped) {
    skipped++;
    console.log(`  SKIP: ${result.reason}`);
  } else {
    failed++;
    console.log(`  FAIL: ${result.reason}`);
  }
}

if (!dryRun) {
  fs.writeFileSync(sourcesFile, JSON.stringify(sources, null, 2) + '\n');
}

console.log('');
console.log(`Сохранено: ${saved}`);
console.log(`Пропущено: ${skipped}`);
console.log(`Ошибок: ${failed}`);
console.log(`Скачано: ${(totalBytes / 1024 / 1024).toFixed(2)} МБ`);
