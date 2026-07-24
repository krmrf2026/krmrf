import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import process from 'node:process';

const ROOT = path.resolve(process.cwd());
const errors = [];
const size = file => fs.statSync(path.join(ROOT, file)).size;
const gzipSize = file => zlib.gzipSync(fs.readFileSync(path.join(ROOT, file)), { level: 9 }).length;
const filesIn = (directory, extension) => fs.readdirSync(path.join(ROOT, directory))
  .filter(name => !extension || name.endsWith(extension))
  .map(name => `${directory}/${name}`);

const budgets = [
  ['data/search-index.json', 520_000, 150_000],
  ['data/zones.geojson', 750_000, 100_000],
  ['archive/index.html', 140_000, 25_000],
  ['index.html', 45_000, 12_000]
];
for (const [file, rawBudget, gzipBudget] of budgets) {
  const raw = size(file);
  const gz = gzipSize(file);
  if (raw > rawBudget) errors.push(`${file}: ${raw} байт, бюджет ${rawBudget}`);
  if (gz > gzipBudget) errors.push(`${file} gzip: ${gz} байт, бюджет ${gzipBudget}`);
}

const jsFiles = filesIn('assets/js', '.js');
const cssFiles = filesIn('assets/css', '.css');
const jsTotal = jsFiles.reduce((sum, file) => sum + size(file), 0);
const cssTotal = cssFiles.reduce((sum, file) => sum + size(file), 0);
if (jsTotal > 55_000) errors.push(`assets/js: общий размер ${jsTotal}, бюджет 55000`);
if (cssTotal > 35_000) errors.push(`assets/css: общий размер ${cssTotal}, бюджет 35000`);

const runtimeJs = jsFiles.map(file => fs.readFileSync(path.join(ROOT, file), 'utf8')).join('\n');
if (/fetch\(['"]\/data\/pages\.json/.test(runtimeJs)) errors.push('Клиентский JavaScript не должен загружать data/pages.json.');
if (/cache\s*:\s*['"]no-store['"]/.test(runtimeJs)) errors.push('Клиентский JavaScript содержит cache: no-store.');
if (fs.existsSync(path.join(ROOT, 'assets/js/catalog.js'))) errors.push('Лишний assets/js/catalog.js должен быть удалён.');

const tinyImages = [];
const walkImages = directory => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walkImages(full);
    else if (entry.isFile() && fs.statSync(full).size < 100) tinyImages.push(path.relative(ROOT, full));
  }
};
walkImages(path.join(ROOT, 'assets/img'));
if (tinyImages.length) errors.push(`Подозрительно маленькие файлы изображений: ${tinyImages.join(', ')}`);

if (errors.length) {
  console.error('Бюджеты производительности не соблюдены:');
  console.error(errors.map(item => `• ${item}`).join('\n'));
  process.exit(1);
}
console.log(`Бюджеты соблюдены: search ${size('data/search-index.json')} байт (${gzipSize('data/search-index.json')} gzip), JS ${jsTotal}, CSS ${cssTotal}.`);
