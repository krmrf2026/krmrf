import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { sha256 } from './lib/project.mjs';

const ROOT = path.resolve(process.cwd());
const targetDir = path.resolve(process.env.KRM_RELEASE_DIR || path.join(ROOT, '..', 'krmrf-releases'));
const apply = process.argv.includes('--apply');
if (process.argv.slice(2).some(arg => !['--apply', '--dry-run'].includes(arg))) {
  console.error('Использование: node tools/prune-releases.mjs [--dry-run | --apply]');
  process.exit(2);
}
if (targetDir === ROOT || targetDir === path.parse(targetDir).root || targetDir === os.homedir()) {
  throw new Error('Небезопасный каталог релизов: отказ от очистки.');
}
if (!fs.existsSync(targetDir)) {
  console.log('Каталог релизов не существует: очищать нечего.');
  process.exit(0);
}
const latestNames = ['krmrf-source.zip', 'krmrf-public.zip'];
for (const name of latestNames) {
  const archive = path.join(targetDir, name);
  const checksum = `${archive}.sha256`;
  if (!fs.existsSync(archive) || !fs.existsSync(checksum)) {
    throw new Error(`Нет нового проверенного снимка: ${name}. Старые архивы не трогаем.`);
  }
  const expected = fs.readFileSync(checksum, 'utf8').match(/^([a-f0-9]{64})  /)?.[1];
  if (!expected || sha256(fs.readFileSync(archive)) !== expected) {
    throw new Error(`Повреждён текущий снимок ${name}. Старые архивы не трогаем.`);
  }
}
let total = 0;
let files = 0;
let groups = 0;
for (const entry of fs.readdirSync(targetDir, { withFileTypes: true })) {
  if (!entry.isFile()) continue;
  const match = entry.name.match(/^krmrf-release-(\d{4}\.\d{1,2}\.\d{1,2}-r\d+)\.json$/);
  if (!match) continue;
  const version = match[1];
  const manifestPath = path.join(targetDir, entry.name);
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); }
  catch { console.warn(`Пропущен повреждённый манифест ${entry.name}`); continue; }
  if (manifest.schema !== 'krmrf-release-v1' || manifest.version !== version || !Array.isArray(manifest.files)) continue;
  const expected = [`krmrf-source-${version}.zip`, `krmrf-public-${version}.zip`];
  if (manifest.files.length !== 2 || !expected.every(name => manifest.files.some(file => file.name === name))) continue;
  const owned = [manifestPath];
  let valid = true;
  for (const name of expected) {
    const file = manifest.files.find(item => item.name === name);
    const zipPath = path.join(targetDir, name);
    const checksumPath = `${zipPath}.sha256`;
    try {
      if (!fs.lstatSync(zipPath).isFile() || !fs.lstatSync(checksumPath).isFile()) throw new Error('not ordinary file');
      if (fs.statSync(zipPath).size !== file.bytes || sha256(fs.readFileSync(zipPath)) !== file.sha256) throw new Error('checksum mismatch');
      const checkText = fs.readFileSync(checksumPath, 'utf8');
      if (checkText !== `${file.sha256}  ${name}\n`) throw new Error('sidecar mismatch');
      owned.push(zipPath, checksumPath);
    } catch { valid = false; break; }
  }
  if (!valid) { console.warn(`Пропущен ${entry.name}: файлы не прошли проверку владельца и SHA256.`); continue; }
  groups += 1;
  for (const file of owned) {
    const size = fs.statSync(file).size;
    console.log(`${apply ? 'Удаление' : 'Можно удалить'}: ${file} (${size} байт)`);
    if (apply) fs.unlinkSync(file);
    total += size;
    files += 1;
  }
}
console.log(`${apply ? 'Удалено' : 'Найдено'}: ${groups} старых комплектов, ${files} файлов, ${total} байт.${apply ? '' : ' Для удаления запустите с --apply.'}`);
