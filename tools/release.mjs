import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import process from 'node:process';

const ROOT = process.cwd();
const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/site.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const version = pkg.version || site.version;
const releaseDir = path.join(ROOT, 'releases');
fs.mkdirSync(releaseDir, { recursive: true });

const excludedDirectories = new Set(['.git', 'node_modules', 'releases']);
const excludedFiles = new Set(['.DS_Store', 'SHA256SUMS']);
const files = [];
const walk = directory => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    if (!entry.isDirectory() && excludedFiles.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute);
    else files.push(path.relative(ROOT, absolute).replace(/\\/g, '/'));
  }
};
walk(ROOT);
files.sort((a, b) => a.localeCompare(b));

const sha256 = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const sums = files.map(file => `${sha256(fs.readFileSync(path.join(ROOT, file)))}  ${file}`).join('\n') + '\n';
fs.writeFileSync(path.join(ROOT, 'SHA256SUMS'), sums, 'utf8');
const archiveFiles = [...files, 'SHA256SUMS'].sort((a, b) => a.localeCompare(b));

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
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
  const dosTime = (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate();
  return { dosTime, dosDate };
};

const { dosTime, dosDate } = dosDateTime(site.buildDate);
const localParts = [];
const centralParts = [];
let offset = 0;

for (const file of archiveFiles) {
  const name = Buffer.from(`krmrf-main/${file}`, 'utf8');
  const data = fs.readFileSync(path.join(ROOT, file));
  const compressed = zlib.deflateRawSync(data, { level: 9 });
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6);
  local.writeUInt16LE(8, 8);
  local.writeUInt16LE(dosTime, 10);
  local.writeUInt16LE(dosDate, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);
  localParts.push(local, name, compressed);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(dosTime, 12);
  central.writeUInt16LE(dosDate, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt16LE(0, 30);
  central.writeUInt16LE(0, 32);
  central.writeUInt16LE(0, 34);
  central.writeUInt16LE(0, 36);
  central.writeUInt32LE(0, 38);
  central.writeUInt32LE(offset, 42);
  centralParts.push(central, name);
  offset += local.length + name.length + compressed.length;
}

const centralDirectory = Buffer.concat(centralParts);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(0, 4);
end.writeUInt16LE(0, 6);
end.writeUInt16LE(archiveFiles.length, 8);
end.writeUInt16LE(archiveFiles.length, 10);
end.writeUInt32LE(centralDirectory.length, 12);
end.writeUInt32LE(offset, 16);
end.writeUInt16LE(0, 20);

const archive = Buffer.concat([...localParts, centralDirectory, end]);
const archiveName = `krmrf-site-${version}.zip`;
const archivePath = path.join(releaseDir, archiveName);
fs.writeFileSync(archivePath, archive);
const archiveHash = sha256(archive);
fs.writeFileSync(`${archivePath}.sha256`, `${archiveHash}  ${archiveName}\n`, 'utf8');
console.log(`Релиз создан: releases/${archiveName}`);
console.log(`SHA-256: ${archiveHash}`);
