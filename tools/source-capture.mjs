import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';

const ROOT = process.cwd();
const [sourceId, inputFile, archiveUrl = ''] = process.argv.slice(2);
if (!sourceId || !inputFile) {
  console.error('Использование: npm run source:capture -- <source-id> <путь-к-файлу> [archive-url]');
  process.exit(1);
}

const registryPath = path.join(ROOT, 'data/sources.json');
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const source = registry.find(item => item.id === sourceId);
if (!source) {
  console.error(`Источник ${sourceId} не найден в data/sources.json.`);
  process.exit(1);
}

const absoluteInput = path.resolve(inputFile);
if (!fs.existsSync(absoluteInput) || !fs.statSync(absoluteInput).isFile()) {
  console.error(`Файл не найден: ${absoluteInput}`);
  process.exit(1);
}

const safeName = path.basename(absoluteInput).replace(/[^a-zA-Z0-9._-]+/g, '-') || 'source.bin';
const relative = path.posix.join('data/sources/files', sourceId, safeName);
const destination = path.join(ROOT, relative);
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.copyFileSync(absoluteInput, destination);
const buffer = fs.readFileSync(destination);
const today = new Date().toISOString().slice(0, 10);

source.accessedAt = today;
source.localCopy = `/${relative}`;
source.sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
source.status = 'preserved';
if (archiveUrl) {
  try { new URL(archiveUrl); } catch { throw new Error(`Неверный archive-url: ${archiveUrl}`); }
  source.archiveUrl = archiveUrl;
}
source.notes = source.notes || 'Локальная копия сохранена редакцией KRM РФ.';

fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
console.log(`Источник сохранён: ${sourceId}`);
console.log(`Локальная копия: /${relative}`);
console.log(`SHA-256: ${source.sha256}`);
