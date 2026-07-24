import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { listFiles } from './lib/project.mjs';

const ROOT = path.resolve(process.cwd());
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex');
const snapshot = () => new Map(listFiles(ROOT).map(file => [file, digest(file)]));

const before = snapshot();
const run = spawnSync(process.execPath, [path.join(ROOT, 'tools/build.mjs')], {
  cwd: ROOT,
  encoding: 'utf8'
});
if (run.status !== 0) {
  process.stdout.write(run.stdout || '');
  process.stderr.write(run.stderr || '');
  process.exit(run.status || 1);
}
const after = snapshot();
const changes = [];
for (const file of new Set([...before.keys(), ...after.keys()])) {
  if (!before.has(file)) changes.push(`создан после повторной сборки: ${file}`);
  else if (!after.has(file)) changes.push(`удалён после повторной сборки: ${file}`);
  else if (before.get(file) !== after.get(file)) changes.push(`изменился после повторной сборки: ${file}`);
}

if (changes.length) {
  console.error('Сборка неидемпотентна: повторный запуск изменил файлы.');
  console.error(changes.map(item => `• ${item}`).join('\n'));
  process.exit(1);
}
console.log('Идемпотентность подтверждена: повторная сборка не меняет файлы.');
