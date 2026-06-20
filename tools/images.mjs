import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const pages = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/pages.json'), 'utf8'));
const command = process.platform === 'win32' ? 'magick.exe' : 'magick';
const probe = spawnSync(command, ['-version'], { encoding: 'utf8' });
const missing = [];

const derivedPath = (image, width) => {
  const relative = image.replace(/^\/assets\/img\//, '');
  const parsed = path.posix.parse(relative);
  return path.posix.join('assets/img/derived', parsed.dir, `${parsed.name}-${width}.webp`);
};

for (const page of pages) {
  if (!page.image?.startsWith('/assets/img/') || page.image.includes('/derived/')) continue;
  const source = page.image.replace(/^\//, '');
  for (const width of [480, 960]) {
    const output = derivedPath(page.image, width);
    if (!fs.existsSync(path.join(ROOT, output))) missing.push({ source, output, width, page: page.id });
  }
}

if (!missing.length) {
  console.log('Производные изображения уже существуют: пропуск генерации.');
  process.exit(0);
}
if (probe.status !== 0) {
  console.error(`Не хватает ${missing.length} производных изображений, но ImageMagick не найден.`);
  console.error('Установите ImageMagick, выполните npm run images локально и добавьте созданные WebP в commit.');
  missing.forEach(item => console.error(`• ${item.page}: ${item.output}`));
  process.exit(1);
}

for (const item of missing) {
  const source = path.join(ROOT, item.source);
  const output = path.join(ROOT, item.output);
  if (!fs.existsSync(source)) {
    console.error(`Исходное изображение не найдено: ${item.source}`);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const result = spawnSync(command, [source, '-auto-orient', '-resize', `${item.width}x>`, '-strip', '-quality', '84', output], { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(`Не удалось создать ${item.output}: ${result.stderr || result.stdout}`);
    process.exit(1);
  }
  console.log(`Создано: ${item.output}`);
}
console.log(`Генерация завершена: ${missing.length} файлов.`);
