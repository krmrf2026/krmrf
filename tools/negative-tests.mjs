import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'krmrf-negative-'));
const project = path.join(temp, 'site');
const filter = source => !source.includes(`${path.sep}.git${path.sep}`)
  && !source.includes(`${path.sep}node_modules${path.sep}`)
  && !source.includes(`${path.sep}releases${path.sep}`);

fs.cpSync(ROOT, project, { recursive: true, filter });
const pagesFile = path.join(project, 'data/pages.json');
const originalPages = fs.readFileSync(pagesFile, 'utf8');
const firstPage = JSON.parse(originalPages)[0];
const htmlFile = path.join(project, firstPage.url.replace(/^\//, ''), 'index.html');
const originalHtml = fs.readFileSync(htmlFile, 'utf8');

const run = () => spawnSync(process.execPath, ['tools/validate.mjs'], { cwd: project, encoding: 'utf8' });
const results = [];
const test = (name, mutate, expectedText) => {
  fs.writeFileSync(pagesFile, originalPages);
  fs.writeFileSync(htmlFile, originalHtml);
  mutate();
  const result = run();
  const output = `${result.stdout}\n${result.stderr}`;
  const passed = result.status !== 0 && output.includes(expectedText);
  results.push({ name, passed, exitCode: result.status, expectedText });
};

test('unknown type', () => {
  const pages = JSON.parse(originalPages); pages[0].type = 'unknown';
  fs.writeFileSync(pagesFile, `${JSON.stringify(pages, null, 2)}\n`);
}, 'неизвестный type=unknown');

test('impossible date', () => {
  const pages = JSON.parse(originalPages); pages[0].datePublished = '2026-99-99';
  fs.writeFileSync(pagesFile, `${JSON.stringify(pages, null, 2)}\n`);
}, 'невозможная datePublished=2026-99-99');

test('modified before published', () => {
  const pages = JSON.parse(originalPages); pages[0].dateModified = '2020-01-01';
  fs.writeFileSync(pagesFile, `${JSON.stringify(pages, null, 2)}\n`);
}, 'dateModified раньше datePublished');

test('title and H1 mismatch', () => {
  fs.writeFileSync(htmlFile, originalHtml.replace(/<h1([^>]*)>[\s\S]*?<\/h1>/i, '<h1$1>Заведомо неверный H1</h1>'));
}, 'H1 не совпадает');

fs.rmSync(temp, { recursive: true, force: true });
if (results.some(item => !item.passed)) {
  console.error('Негативные тесты не пройдены.');
  results.forEach(item => console.error(`• ${item.passed ? 'OK' : 'FAIL'} — ${item.name}`));
  process.exit(1);
}
console.log(`Негативные тесты пройдены: ${results.length} ошибочных сценария корректно остановлены.`);
