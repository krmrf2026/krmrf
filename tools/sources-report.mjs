import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sourcesFile = path.join(root, 'data/sources.json');
const queueFile = path.join(root, 'data/source-preservation-queue.json');
const filesDir = path.join(root, 'data/sources/files');

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function bytesToHuman(bytes) {
  const units = ['Б', 'КБ', 'МБ', 'ГБ'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index++;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }

  return out;
}

const sources = readJson(sourcesFile, []);
const queue = readJson(queueFile, []);

const total = sources.length;
const withLocalCopy = sources.filter(s => s.localCopy).length;
const withArchiveUrl = sources.filter(s => s.archiveUrl).length;
const withSha256 = sources.filter(s => s.sha256).length;
const preserved = sources.filter(s => s.localCopy || s.archiveUrl).length;
const unpreserved = sources.filter(s => !s.localCopy && !s.archiveUrl).length;

const files = walk(filesDir);
const totalSize = files.reduce((sum, file) => sum + fs.statSync(file).size, 0);

const biggest = files
  .map(file => ({
    file: path.relative(root, file).replaceAll(path.sep, '/'),
    size: fs.statSync(file).size
  }))
  .sort((a, b) => b.size - a.size)
  .slice(0, 20);

const domains = new Map();

for (const source of sources) {
  try {
    const host = new URL(source.url).hostname.replace(/^www\./, '');
    domains.set(host, (domains.get(host) || 0) + 1);
  } catch {}
}

const topDomains = [...domains.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20);

console.log('Отчёт по источникам KRM РФ');
console.log('');
console.log(`Всего источников: ${total}`);
console.log(`В очереди сохранения: ${Array.isArray(queue) ? queue.length : 0}`);
console.log(`Есть localCopy: ${withLocalCopy}`);
console.log(`Есть archiveUrl: ${withArchiveUrl}`);
console.log(`Есть sha256: ${withSha256}`);
console.log(`Считаются сохранёнными: ${preserved}`);
console.log(`Без сохранённой копии/архива: ${unpreserved}`);
console.log('');
console.log(`Вес data/sources/files: ${bytesToHuman(totalSize)}`);
console.log(`Файлов локальных источников: ${files.length}`);

if (biggest.length) {
  console.log('');
  console.log('Самые большие локальные копии:');
  for (const item of biggest) {
    console.log(`${bytesToHuman(item.size).padStart(8)}  ${item.file}`);
  }
}

if (topDomains.length) {
  console.log('');
  console.log('Домены источников:');
  for (const [domain, count] of topDomains) {
    console.log(`${String(count).padStart(3)}  ${domain}`);
  }
}
