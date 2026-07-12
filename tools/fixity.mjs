import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';

const ROOT = process.cwd();
const manifest = path.join(ROOT, 'SHA256SUMS');
if (!fs.existsSync(manifest)) {
  console.error('SHA256SUMS не найден. Сначала выполните npm run release.');
  process.exit(1);
}

const isForbiddenRootArtifact = name =>
  name === 'FETCH_HEAD' ||
  name === 'node' ||
  name.startsWith('krmrf-static-archive@');

const errors = [];

for (const name of fs.readdirSync(ROOT)) {
  if (isForbiddenRootArtifact(name)) {
    errors.push(`Посторонний файл в корне репозитория: ${name}`);
  }
}

for (const line of fs.readFileSync(manifest, 'utf8').split(/\r?\n/).filter(Boolean)) {
  const match = line.match(/^([a-f0-9]{64})  (.+)$/);
  if (!match) {
    errors.push(`Неверная строка manifest: ${line}`);
    continue;
  }
  const [, expected, rel] = match;

  if (!rel.includes('/') && isForbiddenRootArtifact(rel)) {
    errors.push(`Запрещённая запись в SHA256SUMS: ${rel}`);
    continue;
  }

  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) {
    errors.push(`Отсутствует: ${rel}`);
    continue;
  }
  const actual = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (actual !== expected) errors.push(`Не совпадает SHA-256: ${rel}`);
}

if (errors.length) {
  console.error(errors.map(item => `• ${item}`).join('\n'));
  process.exit(1);
}
console.log('Контроль целостности пройден: все файлы из SHA256SUMS совпадают.');
