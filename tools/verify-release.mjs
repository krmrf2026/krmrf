import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { sha256 } from './lib/project.mjs';

const ROOT = path.resolve(process.cwd());
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const releaseDir = path.resolve(process.env.KRM_RELEASE_DIR || path.join(ROOT, '..', 'krmrf-releases'));
const archives = [
  [`krmrf-source-${pkg.version}.zip`, 'krmrf-main/'],
  [`krmrf-public-${pkg.version}.zip`, 'krmrf-public/']
];
const errors = [];
for (const [name, prefix] of archives) {
  const file = path.join(releaseDir, name);
  const sidecar = `${file}.sha256`;
  if (!fs.existsSync(file) || !fs.existsSync(sidecar)) {
    errors.push(`Отсутствует архив или checksum: ${name}`);
    continue;
  }
  const expected = fs.readFileSync(sidecar, 'utf8').trim().split(/\s+/)[0];
  if (sha256(fs.readFileSync(file)) !== expected) errors.push(`Не совпадает checksum архива: ${name}`);
  const test = spawnSync('unzip', ['-tqq', file], { encoding: 'utf8' });
  if (test.status !== 0) errors.push(`ZIP повреждён: ${name}: ${test.stderr || test.stdout}`);
  const list = spawnSync('unzip', ['-Z1', file], { encoding: 'utf8' });
  if (list.status !== 0) errors.push(`Не удалось прочитать ZIP: ${name}`);
  else {
    for (const entry of list.stdout.split(/\r?\n/).filter(Boolean)) {
      if (!entry.startsWith(prefix) || entry.includes('../') || entry.startsWith('/') || entry.includes('\\')) errors.push(`Небезопасный путь в ${name}: ${entry}`);
    }
    if (!list.stdout.includes(`${prefix}SHA256SUMS`)) errors.push(`${name}: внутри нет SHA256SUMS.`);
  }
}
if (errors.length) {
  console.error(errors.map(item => `• ${item}`).join('\n'));
  process.exit(1);
}
console.log('Релизные архивы проверены: checksum, структура и ZIP-целостность в норме.');
