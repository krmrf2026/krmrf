import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(process.cwd());
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'krmrf-export-clean-'));
const dist = path.join(temp, 'dist');
const stale = path.join(dist, 'news', 'never-published-alias', 'index.html');
fs.mkdirSync(path.dirname(stale), { recursive: true });
fs.writeFileSync(stale, '<!doctype html><title>stale</title>\n');

const run = script => spawnSync(process.execPath, [path.join(ROOT, script)], {
  cwd: ROOT,
  env: { ...process.env, KRM_DIST_DIR: dist },
  encoding: 'utf8'
});

try {
  const exported = run('tools/export-public.mjs');
  if (exported.status !== 0) {
    throw new Error(`Тестовый экспорт завершился ошибкой:\n${exported.stdout || ''}\n${exported.stderr || ''}`);
  }
  if (fs.existsSync(stale)) {
    throw new Error('Публичный экспорт не удалил посторонний файл из предыдущей сборки.');
  }
  const validated = run('tools/public-validate.mjs');
  if (validated.status !== 0) {
    throw new Error(`Тестовая публичная сборка не прошла проверку:\n${validated.stdout || ''}\n${validated.stderr || ''}`);
  }
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

console.log('Очистка dist подтверждена: файл из предыдущей сборки не переживает новый экспорт.');
