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
  && !source.includes(`${path.sep}releases${path.sep}`)
  && !source.includes(`${path.sep}dist${path.sep}`)
  && !source.includes(`${path.sep}krmrf-releases${path.sep}`)
  && !source.includes(`${path.sep}release-output${path.sep}`)
  && !source.includes(`${path.sep}test-results${path.sep}`)
  && !source.includes(`${path.sep}playwright-report${path.sep}`)
  && !source.includes(`${path.sep}coverage${path.sep}`)
  && !source.includes(`${path.sep}.cache${path.sep}`)
  && path.basename(source) !== 'SHA256SUMS';

fs.cpSync(ROOT, project, { recursive: true, filter });

const pagesFile = path.join(project, 'data/pages.json');
const firstPage = JSON.parse(fs.readFileSync(pagesFile, 'utf8'))[0];
const htmlFile = path.join(project, firstPage.url.replace(/^\//, ''), 'index.html');
const redirectsFile = path.join(project, '_redirects');
const workflowFile = path.join(project, '.github/workflows/pages.yml');
const nvmrcFile = path.join(project, '.nvmrc');
const headersFile = path.join(project, '_headers');
const generatedAliasDir = path.join(project, 'map/archive');

const originals = new Map([
  [pagesFile, fs.readFileSync(pagesFile, 'utf8')],
  [htmlFile, fs.readFileSync(htmlFile, 'utf8')],
  [redirectsFile, fs.readFileSync(redirectsFile, 'utf8')],
  [workflowFile, fs.readFileSync(workflowFile, 'utf8')],
  [nvmrcFile, fs.readFileSync(nvmrcFile, 'utf8')]
]);
const originalPages = originals.get(pagesFile);
const originalHtml = originals.get(htmlFile);

const restore = () => {
  for (const [file, content] of originals) fs.writeFileSync(file, content);
  fs.rmSync(headersFile, { force: true });
  fs.rmSync(generatedAliasDir, { recursive: true, force: true });
};
const run = () => spawnSync(process.execPath, ['tools/validate.mjs'], {
  cwd: project,
  encoding: 'utf8'
});
const results = [];
const test = (name, mutate, expectedText) => {
  restore();
  mutate();
  const result = run();
  const output = `${result.stdout}\n${result.stderr}`;
  results.push({
    name,
    passed: result.status !== 0 && output.includes(expectedText),
    exitCode: result.status,
    expectedText,
    output
  });
};

test('unknown type', () => {
  const pages = JSON.parse(originalPages);
  pages[0].type = 'unknown';
  fs.writeFileSync(pagesFile, `${JSON.stringify(pages, null, 2)}\n`);
}, 'неизвестный type=unknown');

test('impossible date', () => {
  const pages = JSON.parse(originalPages);
  pages[0].datePublished = '2026-99-99';
  fs.writeFileSync(pagesFile, `${JSON.stringify(pages, null, 2)}\n`);
}, 'невозможная datePublished=2026-99-99');

test('modified before published', () => {
  const pages = JSON.parse(originalPages);
  pages[0].dateModified = '2020-01-01';
  fs.writeFileSync(pagesFile, `${JSON.stringify(pages, null, 2)}\n`);
}, 'dateModified раньше datePublished');

test('title and H1 mismatch', () => {
  fs.writeFileSync(
    htmlFile,
    originalHtml.replace(/<h1([^>]*)>[\s\S]*?<\/h1>/i, '<h1$1>Заведомо неверный H1</h1>')
  );
}, 'H1 не совпадает');

test('duplicate url', () => {
  const pages = JSON.parse(originalPages);
  pages[1].url = pages[0].url;
  fs.writeFileSync(pagesFile, `${JSON.stringify(pages, null, 2)}\n`);
}, 'Повторяющийся URL');

test('missing seo description', () => {
  const pages = JSON.parse(originalPages);
  delete pages[0].seoDescription;
  fs.writeFileSync(pagesFile, `${JSON.stringify(pages, null, 2)}\n`);
}, 'отсутствует seoDescription');

test('long seo title', () => {
  const pages = JSON.parse(originalPages);
  pages[0].seoTitle = 'Слишком длинный SEO-заголовок, который намеренно превышает допустимую техническую длину';
  fs.writeFileSync(pagesFile, `${JSON.stringify(pages, null, 2)}\n`);
}, 'seoTitle длиннее 56');

test('broken image', () => {
  const pages = JSON.parse(originalPages);
  pages[0].image = '/assets/img/missing-image.webp';
  fs.writeFileSync(pagesFile, `${JSON.stringify(pages, null, 2)}\n`);
}, 'отсутствует изображение');

test('missing meta CSP', () => {
  fs.writeFileSync(
    htmlFile,
    originalHtml.replace(/<meta\b[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>\s*/i, '')
  );
}, 'meta CSP отсутствует');

test('redirect to missing target', () => {
  fs.appendFileSync(redirectsFile, '/legacy-broken/ /missing-target/ 301\n');
}, 'цель /missing-target/ не существует');

test('conflicting redirect aliases', () => {
  fs.appendFileSync(
    redirectsFile,
    '/legacy-conflict /map/ 301\n/legacy-conflict/ /archive/ 301\n'
  );
}, 'Конфликт целей');

test('missing Pages deployment action', () => {
  const workflow = originals.get(workflowFile).replace('actions/deploy-pages@v4', 'actions/deploy-pages@v3');
  fs.writeFileSync(workflowFile, workflow);
}, 'actions/deploy-pages@v4');

test('obsolete headers file restored', () => {
  fs.writeFileSync(headersFile, '/\n  Content-Security-Policy: default-src self\n');
}, 'Остался удалённый технический файл: _headers');

test('unsupported Node line restored', () => {
  fs.writeFileSync(nvmrcFile, '22\n');
}, '.nvmrc должен фиксировать Node.js 24 LTS');

test('generated alias committed to source', () => {
  fs.mkdirSync(generatedAliasDir, { recursive: true });
  fs.writeFileSync(
    path.join(generatedAliasDir, 'index.html'),
    '<!doctype html><html lang="ru"><head></head><body><!-- KRM GITHUB PAGES REDIRECT --></body></html>\n'
  );
}, 'остался дублирующий исходный HTML');

test('executable inline script restored', () => {
  fs.writeFileSync(htmlFile, originalHtml.replace('</body>', '<script>alert(1)</script></body>'));
}, 'исполняемый inline-script запрещён meta CSP');

restore();
fs.rmSync(temp, { recursive: true, force: true });

const failed = results.filter(item => !item.passed);
if (failed.length) {
  console.error('Негативные тесты не пройдены.');
  for (const item of results) console.error(`• ${item.passed ? 'OK' : 'FAIL'} — ${item.name}`);
  for (const item of failed) {
    console.error(`\n${item.name}: ожидалось «${item.expectedText}», код ${item.exitCode}\n${item.output}`);
  }
  process.exit(1);
}
console.log(`Негативные тесты пройдены: ${results.length} ошибочных сценариев корректно остановлены.`);
