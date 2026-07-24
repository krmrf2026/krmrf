import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { listFiles, sha256 } from './lib/project.mjs';

const ROOT = path.resolve(process.cwd());
const manifestFile = path.join(ROOT, 'SHA256SUMS');
if (!fs.existsSync(manifestFile)) {
  console.error('SHA256SUMS не найден. Сначала выполните npm run release.');
  process.exit(1);
}
const expected = new Map();
const errors = [];
for (const line of fs.readFileSync(manifestFile, 'utf8').split(/\r?\n/).filter(Boolean)) {
  const match = line.match(/^([a-f0-9]{64})  ([^\\].*)$/);
  if (!match || match[2].includes('..') || path.isAbsolute(match[2])) errors.push(`Неверная строка manifest: ${line}`);
  else if (expected.has(match[2])) errors.push(`Повтор в SHA256SUMS: ${match[2]}`);
  else expected.set(match[2], match[1]);
}
const actualFiles = listFiles(ROOT);
for (const file of actualFiles) {
  if (!expected.has(file)) errors.push(`Файл не зафиксирован в SHA256SUMS: ${file}`);
  else if (sha256(fs.readFileSync(path.join(ROOT, file))) !== expected.get(file)) errors.push(`Не совпадает SHA-256: ${file}`);
}
for (const file of expected.keys()) if (!actualFiles.includes(file)) errors.push(`Отсутствует файл из SHA256SUMS: ${file}`);
if (errors.length) {
  console.error(errors.map(item => `• ${item}`).join('\n'));
  process.exit(1);
}
console.log(`Контроль целостности пройден: ${actualFiles.length} файлов полностью совпадают с SHA256SUMS.`);
