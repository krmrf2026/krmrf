import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sha256, listFiles } from '../../tools/lib/project.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = name => fs.readFileSync(path.join(ROOT, name), 'utf8');

test('рабочая ветка запускает QA только на push без дублирующего PR и upload dist', () => {
  const quality = read('.github/workflows/quality.yml');
  assert.match(quality, /\bon:\s*\n\s+push:/);
  assert.doesNotMatch(quality, /^\s+pull_request:/m);
  assert.match(quality, /cancel-in-progress:\s*true/);
  assert.match(quality, /npm run qa/);
  assert.doesNotMatch(quality, /actions\/upload-artifact/);
  assert.match(quality, /fetch-depth:\s*0/);
  const pages = read('.github/workflows/pages.yml');
  assert.match(pages, /npm run qa/);
  assert.match(pages, /actions\/upload-pages-artifact@v4/);
  assert.match(pages, /actions\/deploy-pages@v4/);
});

test('релизные архивы создаются только вручную и имеют стабильные имена', () => {
  const releaseWorkflow = read('.github/workflows/release.yml');
  assert.match(releaseWorkflow, /workflow_dispatch:/);
  assert.doesNotMatch(releaseWorkflow, /^\s+push:/m);
  assert.match(releaseWorkflow, /retention-days:\s*1/);
  const releaseSource = read('tools/release.mjs');
  assert.match(releaseSource, /'krmrf-source\.zip'/);
  assert.match(releaseSource, /'krmrf-public\.zip'/);
  assert.match(releaseSource, /'krmrf-release\.json'/);
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

test('релиз исключает локальные секреты, вложенные архивы и зависимости', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'krm-op-src-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  for (const file of ['README.md', '.env', '.env.production', 'credentials.json', 'ssl.key', 'backup.zip', 'local.tgz', '.npmrc']) {
    fs.writeFileSync(path.join(temp, file), 'test');
  }
  fs.mkdirSync(path.join(temp, 'node_modules'));
  fs.writeFileSync(path.join(temp, 'node_modules', 'package.js'), 'test');
  assert.deepEqual(listFiles(temp), ['README.md']);
});

test('очистка старых версий не удаляет чужие файлы, повреждённые и неподтверждённые комплекты', t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'krm-prune-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const releaseDir = path.join(base, 'releases');
  fs.mkdirSync(releaseDir);
  const make = (name, content) => {
    const b = Buffer.from(content);
    fs.writeFileSync(path.join(releaseDir, name), b);
    fs.writeFileSync(path.join(releaseDir, `${name}.sha256`), `${sha256(b)}  ${name}\n`);
    return { name, sha256: sha256(b), bytes: b.length };
  };
  for (const name of ['krmrf-source.zip', 'krmrf-public.zip']) make(name, 'latest '+name);
  const version = '2026.10.11-r23';
  const oldFiles = [make(`krmrf-source-${version}.zip`, 'source-old'), make(`krmrf-public-${version}.zip`, 'public-old')];
  fs.writeFileSync(path.join(releaseDir, `krmrf-release-${version}.json`), JSON.stringify({ schema: 'krmrf-release-v1', version, files: oldFiles }));
  fs.writeFileSync(path.join(releaseDir, 'my-family-photo.zip'), 'not-owned');
  const otherVersion = '2026.10.11-r22';
  fs.writeFileSync(path.join(releaseDir, `krmrf-release-${otherVersion}.json`), '{broken JSON');
  const run = args => spawnSync(process.execPath, [path.join(ROOT, 'tools/prune-releases.mjs'), ...args], {
    encoding: 'utf8', cwd: base, env: { ...process.env, KRM_RELEASE_DIR: releaseDir }
  });
  let r = run(['--dry-run']);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(releaseDir, oldFiles[0].name)));
  r = run(['--apply']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.existsSync(path.join(releaseDir, oldFiles[0].name)), false);
  assert.ok(fs.existsSync(path.join(releaseDir, 'my-family-photo.zip')));
  assert.ok(fs.existsSync(path.join(releaseDir, `krmrf-release-${otherVersion}.json`)));
});
