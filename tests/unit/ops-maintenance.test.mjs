import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256, listFiles, listPublicFiles } from '../../tools/lib/project.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = name => fs.readFileSync(path.join(ROOT, name), 'utf8');

test('рабочая ветка запускает QA на push и вручную, сохраняет журнал без публикации dist', () => {
  const quality = read('.github/workflows/quality.yml');
  assert.match(quality, /\bon:\s*\n\s+push:/);
  assert.doesNotMatch(quality, /^\s+pull_request:/m);
  assert.match(quality, /cancel-in-progress:\s*true/);
  assert.match(quality, /npm run check/);
  assert.match(quality, /workflow_dispatch:/);
  assert.match(quality, /\.cache\/qa-last\.log/);
  assert.match(quality, /\.cache\/public-sha256\.txt/);
  assert.doesNotMatch(quality, /actions\/upload-pages-artifact|^\s*path:\s*['"]?(?:\.\/)?dist\/?['"]?\s*$/m);
  assert.match(quality, /fetch-depth:\s*0/);
  const pages = read('.github/workflows/pages.yml');
  assert.match(pages, /npm run check/);
  assert.match(pages, /actions\/upload-pages-artifact@v4/);
  assert.match(pages, /actions\/deploy-pages@v4/);
});

test('никаких отдельных релизных ZIP; полный check включает QA и негативные сценарии', () => {
  const scripts = JSON.parse(read('package.json')).scripts;
  assert.equal(scripts.check, 'npm run qa:visible && npm run test:negative');
  for (const name of ['release', 'release:cleanup:dry-run', 'fixity', 'verify:release']) assert.ok(!Object.hasOwn(scripts, name));
  assert.ok(!fs.existsSync(path.join(ROOT, '.github/workflows/release.yml')));
  for (const name of ['release', 'prune-releases', 'fixity', 'verify-release']) assert.ok(!fs.existsSync(path.join(ROOT, `tools/${name}.mjs`)));
});

test('реестр адаптивных изображений покрывает все производные файлы и проверяет SHA-256', () => {
  const manifest = JSON.parse(read('data/image-derivatives.json'));
  assert.equal(manifest.schema, 'krmrf-image-derivatives-v1');
  assert.ok(Object.keys(manifest.entries).length >= 580);
  for (const [derived, item] of Object.entries(manifest.entries)) {
    assert.equal(sha256(fs.readFileSync(path.join(ROOT, derived))), item.derivedSha256, derived);
    assert.equal(sha256(fs.readFileSync(path.join(ROOT, item.source))), item.sourceSha256, item.source);
  }
  assert.match(read('tools/images.mjs'), /earlier\?\.sourceSha256 === sourceHash/);
  assert.match(read('tools/images.mjs'), /earlier\?\.derivedSha256 === hashOf\(item\.output\)/);
});

test('инвентаризация исходников исключает локальные секреты, вложенные архивы и зависимости', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'krm-op-src-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  for (const file of ['README.md', '.env', '.env.production', 'credentials.json', 'ssl.key', 'backup.zip', 'local.tgz', '.npmrc']) {
    fs.writeFileSync(path.join(temp, file), 'test');
  }
  fs.mkdirSync(path.join(temp, 'node_modules'));
  fs.writeFileSync(path.join(temp, 'node_modules', 'package.js'), 'test');
  assert.deepEqual(listFiles(temp), ['README.md']);
});

test('Pages публикует только результат успешной сборки и ожидает точный артефакт', () => {
  const pages = read('.github/workflows/pages.yml');
  assert.match(pages, /^  build:\s*$/m);
  assert.match(pages, /if: github.ref == 'refs\/heads\/main'/);
  assert.match(pages, /^  deploy:\s*\n    needs: build/m);
  assert.match(pages, /github-pages-\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}/);
  assert.match(pages, /artifact_id: \$\{\{ steps\.pages-artifact\.outputs\.artifact_id \}\}/);
  assert.match(pages, /path: dist/);
  assert.match(pages, /artifact_name: \$\{\{ needs\.build\.outputs\.artifact_name \}\}/);
  assert.match(pages, /actions: read/);
  assert.match(pages, /for attempt in \{1\.\.12\}/);
  assert.match(pages, /\.expired == false/);
  assert.match(pages, /exit 1[\s\S]*uses: actions\/deploy-pages@v4/);
  assert.doesNotMatch(pages.split('  deploy:')[0], /pages: write|id-token: write/);
});

// Ensure .gitignore is not relied on as a public-export security boundary.
test('публичный экспорт исключает черновики и локальные файлы; проверка видит лишние секреты', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'krm-public-exclusions-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  fs.mkdirSync(path.join(temp, 'news'));
  for (const f of ['index.html', '.env', 'draft.fragment', 'debug.log', 'private.key', 'local.patch', 'backup.tar.gz']) fs.writeFileSync(path.join(temp, 'news', f), 'test');
  assert.deepEqual(listPublicFiles(temp), ['news/index.html']);
  const actual = listFiles(temp, { excludedDirs: new Set(), excludedFiles: new Set(), includeSensitive: true });
  assert.ok(actual.includes('news/.env'));
  assert.ok(actual.includes('news/private.key'));
});
