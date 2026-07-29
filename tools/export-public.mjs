import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { listPublicFiles } from './lib/project.mjs';
import { generateRedirectPages } from './lib/redirects.mjs';

const ROOT = path.resolve(process.cwd());
const DIST = path.resolve(process.env.KRM_DIST_DIR || path.join(ROOT, 'dist'));

if (
  DIST === ROOT
  || DIST === path.parse(DIST).root
  || ROOT.startsWith(`${DIST}${path.sep}`)
) {
  console.error('Некорректный путь dist.');
  process.exit(1);
}

const clearDirectory = directory => {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    const stat = fs.lstatSync(target);
    if (stat.isDirectory() && !stat.isSymbolicLink()) {
      clearDirectory(target);
      fs.rmdirSync(target);
    } else {
      fs.unlinkSync(target);
    }
  }
};

clearDirectory(DIST);
fs.mkdirSync(DIST, { recursive: true });

const files = listPublicFiles(ROOT);
for (const rel of files) {
  const source = path.join(ROOT, rel);
  const target = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const redirectPages = generateRedirectPages({
  registryRoot: ROOT,
  outputRoot: DIST,
  version
});

const forbidden = [
  'package.json', 'package-lock.json', 'README.md', 'PUBLISHING.md', 'RECOVERY.md',
  'QUALITY.md', 'TECHNICAL_FREEZE.md',
  'tools', '.github', 'data/pages.json', 'data/pages.schema.json', 'data/taxonomy.json',
  'data/site.json', 'data/content-integrity.json', '_headers', '_redirects'
];
for (const rel of forbidden) {
  if (fs.existsSync(path.join(DIST, rel))) {
    console.error(`В публичную сборку попал служебный путь: ${rel}`);
    process.exit(1);
  }
}

console.log(`Публичная сборка создана: ${DIST}`);
console.log(`Файлов: ${files.length + redirectPages.length} (${redirectPages.length} страниц старых адресов).`);
