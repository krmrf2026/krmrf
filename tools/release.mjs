import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import process from 'node:process';
import { listFiles, sha256 } from './lib/project.mjs';

const ROOT = path.resolve(process.cwd());
const DIST = path.resolve(process.env.KRM_DIST_DIR || path.join(ROOT, 'dist'));
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/site.json'), 'utf8'));
const version = pkg.version;
const releaseDir = path.resolve(process.env.KRM_RELEASE_DIR || path.join(ROOT, '..', 'krmrf-releases'));
fs.mkdirSync(releaseDir, { recursive: true });
if (!fs.existsSync(DIST)) throw new Error('dist отсутствует. Выполните npm run qa.');

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    table[index] = value >>> 0;
  }
  return table;
})();
const crc32 = buffer => {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};
const dosDateTime = value => {
  const date = new Date(`${value || '2026-01-01'}T12:00:00Z`);
  const year = Math.max(1980, date.getUTCFullYear());
  return {
    time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate()
  };
};

const createZip = (entries, rootName) => {
  const { time, date } = dosDateTime(site.buildDate);
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const name = Buffer.from(`${rootName}/${entry.name}`, 'utf8');
    const data = entry.data;
    const compressed = zlib.deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8); local.writeUInt16LE(time, 10); local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10); central.writeUInt16LE(time, 12); central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28); central.writeUInt16LE(0, 30); central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36); central.writeUInt32LE(0, 38); central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + compressed.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
};

const sourceFiles = listFiles(ROOT);
const sourceSums = `${sourceFiles.map(file => `${sha256(fs.readFileSync(path.join(ROOT, file)))}  ${file}`).join('\n')}\n`;
fs.writeFileSync(path.join(ROOT, 'SHA256SUMS'), sourceSums);
const sourceEntries = sourceFiles.map(name => ({ name, data: fs.readFileSync(path.join(ROOT, name)) }));
sourceEntries.push({ name: 'SHA256SUMS', data: Buffer.from(sourceSums) });

const publicFiles = listFiles(DIST);
const publicSums = `${publicFiles.map(file => `${sha256(fs.readFileSync(path.join(DIST, file)))}  ${file}`).join('\n')}\n`;
const publicEntries = publicFiles.map(name => ({ name, data: fs.readFileSync(path.join(DIST, name)) }));
publicEntries.push({ name: 'SHA256SUMS', data: Buffer.from(publicSums) });

const outputs = [
  [`krmrf-source-${version}.zip`, createZip(sourceEntries, 'krmrf-main')],
  [`krmrf-public-${version}.zip`, createZip(publicEntries, 'krmrf-public')]
];
const releaseManifest = { schema: 'krmrf-release-v1', version, buildDate: site.buildDate, files: [] };
for (const [name, archive] of outputs) {
  const target = path.join(releaseDir, name);
  fs.writeFileSync(target, archive);
  const hash = sha256(archive);
  fs.writeFileSync(`${target}.sha256`, `${hash}  ${name}\n`);
  releaseManifest.files.push({ name, sha256: hash, bytes: archive.length });
  console.log(`Создан: ${target}`);
}
fs.writeFileSync(path.join(releaseDir, `krmrf-release-${version}.json`), `${JSON.stringify(releaseManifest, null, 2)}\n`);
console.log(`Релиз ${version} создан: исходный и публичный архивы.`);
