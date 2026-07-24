import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { listPublicFiles } from './lib/project.mjs';

const ROOT = path.resolve(process.cwd());
const DIST = path.resolve(process.env.KRM_DIST_DIR || path.join(ROOT, 'dist'));

if (DIST === ROOT || ROOT.startsWith(`${DIST}${path.sep}`)) {
  console.error('Некорректный путь dist.');
  process.exit(1);
}

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

const files = listPublicFiles(ROOT);
for (const rel of files) {
  const source = path.join(ROOT, rel);
  const target = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

const forbidden = [
  'package.json', 'package-lock.json', 'README.md', 'PUBLISHING.md', 'RECOVERY.md',
  'tools', '.github', 'data/pages.json', 'data/pages.schema.json', 'data/taxonomy.json',
  'data/news.json', 'data/assessment.json', 'data/war-crimes.json'
];
for (const rel of forbidden) {
  if (fs.existsSync(path.join(DIST, rel))) {
    console.error(`В публичную сборку попал служебный путь: ${rel}`);
    process.exit(1);
  }
}

console.log(`Публичная сборка создана: ${DIST}`);
console.log(`Файлов: ${files.length}`);
