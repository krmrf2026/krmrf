import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';

const SOURCE = path.resolve(import.meta.dirname, '../..');
const run = (root, command, args, env = {}) => spawnSync(command, args, {
  cwd: root, encoding: 'utf8', timeout: 20000, env: { ...process.env, ...env }
});
const okay = result => assert.equal(result.status, 0, result.stdout + result.stderr);
const git = (root, args) => {
  const result = run(root, 'git', args); okay(result); return result.stdout.trim();
};
const commit = (root, message) => {
  git(root, ['add', 'data/zones.geojson', 'data/map-changes.json']);
  git(root, ['-c', 'user.name=Regression Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', message]);
  return git(root, ['rev-parse', 'HEAD']);
};
const fixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'krm-history-regression-'));
  fs.mkdirSync(path.join(root, 'data')); fs.mkdirSync(path.join(root, 'map'));
  fs.copyFileSync(path.join(SOURCE, 'data/map-statistics-config.json'), path.join(root, 'data/map-statistics-config.json'));
  fs.copyFileSync(path.join(SOURCE,'data/utm-campaigns.json'),path.join(root,'data/utm-campaigns.json'));fs.writeFileSync(path.join(root,'data/pages.json'),'[]');
  fs.writeFileSync(path.join(root, 'map/index.html'), '<!-- KRM MAP STATISTICS START --><!-- KRM MAP STATISTICS END -->');
  git(root, ['init', '-q']); return root;
};
const put = (root, date, shift = 0) => {
  const ring = [[30 + shift, 45], [32 + shift, 45], [32 + shift, 47], [30 + shift, 47], [30 + shift, 45]];
  fs.writeFileSync(path.join(root, 'data/zones.geojson'), JSON.stringify({
    type: 'FeatureCollection', updated: date,
    features: [{ type: 'Feature', properties: { name: 'russian' }, geometry: { type: 'Polygon', coordinates: [ring] } }]
  }));
  fs.writeFileSync(path.join(root, 'data/map-changes.json'), JSON.stringify({ changes: [{ zonesUpdated: date, title: 'Срез', kind: 'unknown' }] }));
};
const history = (root, env) => run(root, process.execPath, [path.join(SOURCE, 'tools/map-history.mjs')], env);
const json = (root, relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const statistics = root => run(root, process.execPath, [path.join(SOURCE, 'tools/map-statistics.mjs')]);
const archiveFile = (root, item) => path.join(root, item.snapshot.slice(1));
const savedBytes = (root, item) => fs.readFileSync(archiveFile(root, item), 'utf8');
const checkVariant = (root, item) => {
  const raw = savedBytes(root, item);
  assert.equal(crypto.createHash('sha256').update(raw).digest('hex'), item.sha256);
  assert.equal(JSON.parse(raw).updated, item.updated);
};

test('удаление и восстановление: сохраняются A → B → A, пропуск дня и вся история сверх лимита', () => {
  const root = fixture();
  try {
    put(root, '2026-09-30 12:00'); commit(root, 'A');
    put(root, '2026-10-02 12:00', 1); commit(root, 'B');
    git(root, ['rm', '-q', 'data/zones.geojson']);
    git(root, ['-c', 'user.name=Regression Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Delete map']);
    const deleted = git(root, ['rev-parse', 'HEAD']);
    assert.equal(git(root, ['ls-tree', '--full-tree', deleted, '--', 'data/zones.geojson']), '');
    put(root, '2026-10-04 12:00'); commit(root, 'A restored');
    okay(history(root, { KRM_MAP_HISTORY_LIMIT: '2' }));
    const journal = json(root, 'data/map-archive/journal.json');
    assert.equal(journal.versions.length, 3);
    assert.deepEqual(journal.versions.map(item => item.updated), ['2026-09-30 12:00', '2026-10-02 12:00', '2026-10-04 12:00']);
    assert.ok(journal.warnings.some(warning => warning.includes(deleted.slice(0, 12))));
    assert.equal(json(root, 'data/map-history/manifest.json').versions.length, 2);
    okay(run(root, process.execPath, [path.join(SOURCE, 'tools/map-statistics.mjs')]));
    const stats = json(root, 'data/map-statistics.json');
    assert.equal(stats.intervals.length, 2);
    assert.ok(stats.periods.all.addedKm2 > 0 && stats.periods.all.removedKm2 > 0);
    assert.ok(Math.abs(stats.periods.all.netKm2) < 1e-6);
    assert.equal(stats.daily.find(day => day.date === '2026-10-03').status, 'no_snapshot');
    assert.equal(stats.daily.find(day => day.date === '2026-10-03').netKm2, null);
    const before = fs.readFileSync(path.join(root, 'data/map-archive/journal.json'), 'utf8');
    okay(history(root, { KRM_MAP_HISTORY_LIMIT: '2' }));
    assert.equal(fs.readFileSync(path.join(root, 'data/map-archive/journal.json'), 'utf8'), before);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('потерянный Git-объект существующего файла останавливает импорт вместо потери среза', () => {
  const root = fixture();
  try {
    put(root, '2026-10-01 12:00'); const first = commit(root, 'First');
    const blob = git(root, ['rev-parse', `${first}:data/zones.geojson`]);
    put(root, '2026-10-02 12:00', 1); commit(root, 'Second');
    assert.match(blob, /^[a-f0-9]{40}$/);
    fs.unlinkSync(path.join(root, '.git/objects', blob.slice(0, 2), blob.slice(2)));
    const result = history(root);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Недоступен файл карты в Git/);
    assert.equal(fs.existsSync(path.join(root, 'data/map-archive/journal.json')), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('существующий пустой файл не принимается за коммит удаления', () => {
  const root = fixture();
  try {
    put(root, '2026-10-01 12:00');
    fs.writeFileSync(path.join(root, 'data/zones.geojson'), ''); const empty = commit(root, 'Empty map');
    put(root, '2026-10-02 12:00'); commit(root, 'Valid current map');
    assert.notEqual(git(root, ['ls-tree', '--full-tree', empty, '--', 'data/zones.geojson']), '');
    const result = history(root);
    assert.notEqual(result.status, 0); assert.match(result.stderr, /Недоступен файл карты в Git/);
    assert.equal(fs.existsSync(path.join(root, 'data/map-archive/journal.json')), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('старый срез без распознанного слоя РФ пропускается с причиной и не становится нулевой площадью', () => {
  const root = fixture();
  try {
    put(root, '2026-10-01 12:00'); commit(root, 'Baseline');
    put(root, '2026-10-02 12:00', 1);
    const file = path.join(root, 'data/zones.geojson');
    const legacy = JSON.parse(fs.readFileSync(file, 'utf8'));
    legacy.features[0].properties.name = 'unclassified-layer';
    fs.writeFileSync(file, JSON.stringify(legacy)); const rejected = commit(root, 'Legacy unclassified map');
    put(root, '2026-10-03 12:00', 1); commit(root, 'Current');
    okay(history(root));
    const journal = json(root, 'data/map-archive/journal.json');
    assert.equal(journal.versions.length, 2);
    assert.ok(journal.warnings.some(w => w.includes(rejected.slice(0, 12)) && w.includes('unclassified-layer') && w.includes('российский слой')));
    okay(run(root, process.execPath, [path.join(SOURCE, 'tools/map-statistics.mjs')]));
    const data = json(root, 'data/map-statistics.json');
    assert.equal(data.snapshots.length, 2); assert.equal(data.intervals.length, 1);
    assert.equal(data.intervals[0].omittedSnapshotCount, 1);
    assert.equal(data.periods.latest.omittedSnapshotCount, 1);
    assert.equal(journal.skippedRevisions.find(s => s.commit === rejected).kind, 'unusable');
    assert.ok(journal.skippedRevisions.find(s => s.commit === rejected).rawSha256);
    assert.match(fs.readFileSync(path.join(root, 'map/index.html'), 'utf8'), /Есть пропуски данных/);
    const post = run(root, process.execPath, [path.join(SOURCE, 'tools/map-post.mjs')]);
    okay(post); assert.match(post.stdout, /промежуточные изменения восстановлены не полностью/);
    assert.equal(data.daily.find(d => d.date === '2026-10-02').status, 'unavailable');
    assert.equal(data.daily.find(d => d.date === '2026-10-02').netKm2, null);
    assert.equal(data.monthly[0].unavailableDays, 1);
    const csv = fs.readFileSync(path.join(root, 'data/map-statistics.csv'), 'utf8');
    assert.match(csv.split('\n')[0], /omitted_snapshot_count/);
    assert.match(csv.split('\n')[1], /,"1"$/);
    assert.ok(data.snapshots.every(s => s.areaKm2 > 0));
    assert.ok(data.warnings.some(w => w.includes(rejected.slice(0, 12))));
    const before = fs.readFileSync(path.join(root, 'data/map-archive/journal.json'), 'utf8');
    okay(history(root));
    assert.equal(fs.readFileSync(path.join(root, 'data/map-archive/journal.json'), 'utf8'), before);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('текущая карта без слоя РФ останавливает сборку и сохраняет предыдущий архив', () => {
  const root = fixture();
  try {
    put(root, '2026-10-01 12:00'); commit(root, 'Valid baseline'); okay(history(root));
    const before = fs.readFileSync(path.join(root, 'data/map-archive/journal.json'), 'utf8');
    put(root, '2026-10-02 12:00');
    const file = path.join(root, 'data/zones.geojson'); const z = JSON.parse(fs.readFileSync(file, 'utf8'));
    z.features[0].properties.name = 'ukrainian'; fs.writeFileSync(file, JSON.stringify(z));
    const result = history(root);
    assert.notEqual(result.status, 0); assert.match(result.stderr, /Не найден непустой российский слой/);
    assert.equal(fs.readFileSync(path.join(root, 'data/map-archive/journal.json'), 'utf8'), before);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('текущая публикация устанавливает свой контур, альтернативная Git-версия сохраняется отдельно', () => {
  const root = fixture();
  try {
    put(root, '2026-10-01 12:00'); commit(root, 'A');
    put(root, '2026-10-01 12:00', 1); commit(root, 'B same date');
    okay(history(root)); const journal = json(root, 'data/map-archive/journal.json');
    assert.equal(journal.versions.length, 1); assert.equal(journal.ambiguousVersions.length, 1);
    assert.ok(journal.versions[0].sourceRefs.includes('published-map'));
    assert.equal(JSON.parse(savedBytes(root, journal.versions[0])).features[0].geometry.coordinates[0][0][0], 31);
    checkVariant(root, journal.ambiguousVersions[0]);
    assert.equal(journal.skippedRevisions[0].kind, 'ambiguous'); assert.equal(journal.skippedRevisions[0].resolution, 'anchored');
    okay(statistics(root)); assert.equal(json(root, 'data/map-statistics.json').periods.latest.status, 'insufficient');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('конфликт 13 марта 05:50 UTC сохраняет оба старых варианта и неизвестные день/месяц до первого пригодного среза', () => {
  const root = fixture();
  try {
    put(root, '2026-03-13 08:50'); const a = commit(root, 'March A');
    const rawA = fs.readFileSync(path.join(root, 'data/zones.geojson'), 'utf8');
    put(root, '2026-03-13 08:50', 1); const b = commit(root, 'March B with unchanged updated');
    put(root, '2026-09-21 07:42', 2); commit(root, 'Current September');
    okay(history(root)); const journal = json(root, 'data/map-archive/journal.json');
    assert.equal(journal.versions.length, 1); assert.equal(journal.ambiguousVersions.length, 2);
    assert.ok(journal.ambiguousVersions.every(item => item.publishedAt === '2026-03-13T05:50:00.000Z'));
    journal.ambiguousVersions.forEach(item => checkVariant(root, item));
    const skips = journal.skippedRevisions.filter(item => [a, b].includes(item.commit));
    assert.equal(skips.length, 2); assert.ok(skips.every(item => item.kind === 'ambiguous' && item.resolution === 'unresolved' && item.variantCount === 2));
    assert.equal(skips.find(item => item.commit === a).rawSha256, crypto.createHash('sha256').update(rawA).digest('hex'));
    okay(statistics(root)); const data = json(root, 'data/map-statistics.json');
    const day = data.daily.find(item => item.date === '2026-03-13');
    assert.equal(day.status, 'unavailable'); assert.equal(day.ambiguousSnapshotCount, 1); assert.equal(day.netKm2, null);
    assert.equal(data.intervals.length, 0); assert.equal(data.monthly.find(item => item.month === '2026-03').unavailableDays, 1);
    assert.match(fs.readFileSync(path.join(root, 'map/index.html'), 'utf8'), /data-month="2026-03"[\s\S]*Нет данных для сравнения/);
    const post = run(root, process.execPath, [path.join(SOURCE, 'tools/map-post.mjs'), '--month=2026-03']);
    okay(post); assert.match(post.stdout, /Недостаточно сопоставимых срезов[\s\S]*Есть пропуски данных/);
    const before = fs.readFileSync(path.join(root, 'data/map-archive/journal.json'), 'utf8');
    okay(history(root)); assert.equal(fs.readFileSync(path.join(root, 'data/map-archive/journal.json'), 'utf8'), before);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('два пригодных контура через спорную дату сравниваются с явным предупреждением в CSV и посте', () => {
  const root = fixture();
  try {
    for (const [date, shift] of [['2026-03-12 08:50', 0], ['2026-03-13 08:50', 1], ['2026-03-13 08:50', 2], ['2026-03-14 08:50', 3]]) {
      put(root, date, shift); commit(root, `${date}: ${shift}`);
    }
    okay(history(root)); okay(statistics(root)); const data = json(root, 'data/map-statistics.json');
    assert.equal(data.snapshots.length, 2); assert.equal(data.intervals.length, 1);
    assert.equal(data.intervals[0].omittedSnapshotCount, 1); assert.equal(data.periods.latest.omittedSnapshotCount, 1);
    assert.ok(data.intervals[0].addedKm2 > 0 && data.intervals[0].removedKm2 > 0); assert.ok(Math.abs(data.periods.latest.netKm2) < 1e-6);
    assert.equal(data.daily.find(item => item.date === '2026-03-13').netKm2, null);
    assert.equal(data.monthly[0].unavailableDays, 1);
    assert.match(fs.readFileSync(path.join(root, 'map/index.html'), 'utf8'), /Есть пропуски данных/);
    assert.match(fs.readFileSync(path.join(root, 'data/map-statistics.csv'), 'utf8').split('\n')[1], /,"1"$/);
    const post = run(root, process.execPath, [path.join(SOURCE, 'tools/map-post.mjs')]); okay(post);
    assert.match(post.stdout, /Есть пропуски данных[\s\S]*промежуточные изменения восстановлены не полностью/);
    okay(run(root, process.execPath, [path.join(SOURCE, 'tools/map-statistics.mjs'), '--check']));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('новая найденная Git-версия переводит ранее импортированный спорный день в отдельный архив без утраты файла', () => {
  const root = fixture();
  try {
    put(root, '2026-03-13 08:50'); commit(root, 'Only known historical variant');
    put(root, '2026-03-14 08:50', 1); commit(root, 'Current'); okay(history(root));
    const previous = json(root, 'data/map-archive/journal.json').versions[0], before = savedBytes(root, previous);
    assert.ok(previous.sourceRefs.every(ref => ref.startsWith('git:')));
    put(root, '2026-03-13 08:50', 2); commit(root, 'Newly found conflicting old revision');
    put(root, '2026-03-14 08:50', 1); commit(root, 'Restore current'); okay(history(root));
    const journal = json(root, 'data/map-archive/journal.json');
    assert.equal(journal.versions.length, 1); assert.equal(journal.ambiguousVersions.length, 2);
    assert.equal(savedBytes(root, previous), before);
    assert.ok(journal.ambiguousVersions.some(item => item.snapshot === previous.snapshot && previous.sourceRefs.every(ref => item.sourceRefs.includes(ref))));
    okay(statistics(root)); assert.equal(json(root, 'data/map-statistics.json').daily.find(item => item.date === '2026-03-13').status, 'unavailable');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('ранее сохранённая текущая публикация остаётся установленным срезом при альтернативе из старого Git', () => {
  const root = fixture();
  try {
    put(root, '2026-03-13 08:50'); commit(root, 'Published A'); okay(history(root));
    const previous = json(root, 'data/map-archive/journal.json').versions[0], before = savedBytes(root, previous);
    put(root, '2026-03-13 08:50', 1); const alternate = commit(root, 'Alternative old revision');
    put(root, '2026-03-14 08:50', 2); commit(root, 'Next publication'); okay(history(root));
    const journal = json(root, 'data/map-archive/journal.json');
    assert.equal(journal.versions.length, 2); assert.equal(journal.ambiguousVersions.length, 1);
    assert.equal(journal.versions[0].snapshot, previous.snapshot); assert.equal(savedBytes(root, previous), before);
    assert.equal(journal.skippedRevisions.find(item => item.commit === alternate).resolution, 'anchored');
    okay(statistics(root)); assert.equal(json(root, 'data/map-statistics.json').intervals[0].omittedSnapshotCount, 0);
    assert.ok(json(root, 'data/map-statistics.json').history.ambiguousVersions.length);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('изменение уже сохранённой текущей карты без новой даты остаётся ошибкой после появления спорных вариантов', () => {
  const root = fixture();
  try {
    put(root, '2026-03-13 08:50'); commit(root, 'Old A');
    put(root, '2026-03-13 08:50', 1); commit(root, 'Current B'); okay(history(root));
    const file = path.join(root, 'data/map-archive/journal.json'), before = fs.readFileSync(file, 'utf8');
    put(root, '2026-03-13 08:50', 2);
    const result = history(root); assert.notEqual(result.status, 0); assert.match(result.stderr, /Конфликт срезов/);
    assert.equal(fs.readFileSync(file, 'utf8'), before);
    assert.equal(fs.readdirSync(path.join(root, 'data/map-archive')).filter(name => name.endsWith('.geojson')).length, 2);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('явно выбранный импорт разрешает спорную дату, сохраняя альтернативу и исходные контрольные суммы', () => {
  const root = fixture();
  try {
    put(root, '2026-03-13 08:50'); commit(root, 'A');
    put(root, '2026-03-13 08:50', 1); commit(root, 'B');
    put(root, '2026-03-14 08:50', 2); commit(root, 'Current'); okay(history(root));
    const old = json(root, 'data/map-archive/journal.json'), selected = old.ambiguousVersions.find(item => JSON.parse(savedBytes(root, item)).features[0].geometry.coordinates[0][0][0] === 31);
    const file = path.join(root, 'chosen-published.geojson'); fs.copyFileSync(archiveFile(root, selected), file);
    const before = old.ambiguousVersions.map(item => [item, savedBytes(root, item)]);
    okay(run(root, process.execPath, [path.join(SOURCE, 'tools/map-history.mjs'), `--import=${file}`]));
    const journal = json(root, 'data/map-archive/journal.json');
    assert.equal(journal.versions.length, 2); assert.equal(journal.ambiguousVersions.length, 1);
    assert.equal(journal.versions[0].snapshot, selected.snapshot); assert.ok(journal.versions[0].sourceRefs.includes('import:chosen-published.geojson'));
    before.forEach(([item, bytes]) => assert.equal(savedBytes(root, item), bytes));
    okay(statistics(root)); assert.equal(json(root, 'data/map-statistics.json').intervals[0].omittedSnapshotCount, 0);
    const manifest = fs.readFileSync(path.join(root, 'data/map-archive/journal.json'), 'utf8'); okay(history(root));
    assert.equal(fs.readFileSync(path.join(root, 'data/map-archive/journal.json'), 'utf8'), manifest);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('контрольные суммы спорных файлов проверяются историей и статистикой без перезаписи журнала', () => {
  const root = fixture();
  try {
    put(root, '2026-03-13 08:50'); commit(root, 'A');
    put(root, '2026-03-13 08:50', 1); commit(root, 'B');
    put(root, '2026-03-14 08:50', 2); commit(root, 'Current'); okay(history(root));
    const file = path.join(root, 'data/map-archive/journal.json'), before = fs.readFileSync(file, 'utf8');
    const variant = json(root, 'data/map-archive/journal.json').ambiguousVersions[0]; fs.appendFileSync(archiveFile(root, variant), ' ');
    const imported = history(root), measured = statistics(root);
    assert.notEqual(imported.status, 0); assert.match(imported.stderr, /контрольная сумма/);
    assert.notEqual(measured.status, 0); assert.match(measured.stderr, /Повреждён спорный срез/);
    assert.equal(fs.readFileSync(file, 'utf8'), before);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('одинаковый контур с разными охватами одной даты тоже остаётся неизвестным состоянием', () => {
  const root = fixture();
  try {
    put(root, '2026-03-13 08:50'); commit(root, 'Scope v1');
    const file = path.join(root, 'data/zones.geojson'), z = json(root, 'data/zones.geojson');
    z.statistics = { scopeVersion: 'other-scope-v2' }; fs.writeFileSync(file, JSON.stringify(z)); commit(root, 'Scope v2 same timestamp');
    put(root, '2026-03-14 08:50'); commit(root, 'Current'); okay(history(root));
    const journal = json(root, 'data/map-archive/journal.json'); assert.equal(journal.ambiguousVersions.length, 2);
    assert.equal(new Set(journal.ambiguousVersions.map(item => item.geometrySha256)).size, 1);
    assert.equal(new Set(journal.ambiguousVersions.map(item => item.scopeVersion)).size, 2);
    okay(statistics(root)); const data = json(root, 'data/map-statistics.json');
    assert.equal(data.daily[0].status, 'unavailable'); assert.equal(data.daily[0].netKm2, null); assert.equal(data.intervals.length, 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('порядок противоречивых Git-коммитов не выбирает первую или последнюю геометрию', () => {
  const roots = [fixture(), fixture()];
  try {
    for (const [i, root] of roots.entries()) {
      for (const shift of i ? [1, 0] : [0, 1]) { put(root, '2026-03-13 08:50', shift); commit(root, `Old ${shift}`); }
      put(root, '2026-03-14 08:50', 2); commit(root, 'Current'); okay(history(root));
    }
    const journals = roots.map(root => json(root, 'data/map-archive/journal.json'));
    assert.deepEqual(journals[0].versions.map(item => item.sha256), journals[1].versions.map(item => item.sha256));
    assert.deepEqual(journals[0].ambiguousVersions.map(item => item.sha256), journals[1].ambiguousVersions.map(item => item.sha256));
    assert.ok(journals.every(journal => journal.versions.length === 1 && journal.ambiguousVersions.length === 2));
  } finally { roots.forEach(root => fs.rmSync(root, { recursive: true, force: true })); }
});

test('копия кэша селектора не делает первую спорную Git-версию установленной публикацией', () => {
  const root = fixture();
  try {
    put(root, '2026-03-13 08:50'); commit(root, 'Old A');
    put(root, '2026-03-14 08:50', 1); commit(root, 'Current'); okay(history(root));
    fs.rmSync(path.join(root, 'data/map-archive'), { recursive: true });
    put(root, '2026-03-13 08:50', 2); commit(root, 'Old B found later');
    put(root, '2026-03-14 08:50', 1); commit(root, 'Current restored'); okay(history(root));
    const journal = json(root, 'data/map-archive/journal.json');
    assert.equal(journal.versions.length, 1); assert.equal(journal.ambiguousVersions.length, 2);
    assert.ok(journal.ambiguousVersions.some(item => item.sourceRefs.includes('selector-cache')));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('повтор одной геометрии и одного охвата с той же датой не создаёт ложный конфликт', () => {
  const root = fixture();
  try {
    put(root, '2026-03-13 08:50'); commit(root, 'A');
    const file = path.join(root, 'data/zones.geojson'); fs.writeFileSync(file, JSON.stringify(json(root, 'data/zones.geojson'), null, 2) + '\n'); commit(root, 'Same state different formatting');
    put(root, '2026-03-14 08:50', 1); commit(root, 'Current'); okay(history(root));
    const journal = json(root, 'data/map-archive/journal.json');
    assert.equal(journal.versions.length, 2); assert.equal(journal.ambiguousVersions.length, 0); assert.equal(journal.skippedRevisions.length, 0);
    assert.equal(journal.versions[0].sourceRefs.filter(ref => ref.startsWith('git:')).length, 2);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('shallow clone и ZIP без Git сохраняют обе спорные версии и неизвестную дату', () => {
  const root = fixture(), clone = fs.mkdtempSync(path.join(os.tmpdir(), 'krm-history-ambiguous-shallow-'));
  try {
    put(root, '2026-03-13 08:50'); commit(root, 'A');
    put(root, '2026-03-13 08:50', 1); commit(root, 'B');
    put(root, '2026-03-14 08:50', 2); commit(root, 'Current'); okay(history(root));
    const initial = json(root, 'data/map-archive/journal.json');
    git(root, ['add', 'data/map-archive', 'data/map-statistics-config.json', 'data/utm-campaigns.json', 'data/pages.json']);
    git(root, ['-c', 'user.name=Regression Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Save variants']);
    okay(run(root, 'git', ['clone', '-q', '--depth=1', `file://${root}`, clone]));
    fs.mkdirSync(path.join(clone, 'map')); fs.copyFileSync(path.join(root, 'map/index.html'), path.join(clone, 'map/index.html'));
    for (const mode of ['shallow', 'unavailable']) {
      if (mode === 'unavailable') fs.rmSync(path.join(clone, '.git'), { recursive: true });
      okay(history(clone)); const journal = json(clone, 'data/map-archive/journal.json');
      assert.equal(journal.gitMode, mode); assert.equal(journal.versions.length, 1);
      assert.deepEqual(journal.ambiguousVersions, initial.ambiguousVersions); assert.deepEqual(journal.skippedRevisions, initial.skippedRevisions);
      journal.ambiguousVersions.forEach(item => checkVariant(clone, item));
      okay(statistics(clone)); assert.equal(json(clone, 'data/map-statistics.json').daily[0].status, 'unavailable');
      const before = fs.readFileSync(path.join(clone, 'data/map-archive/journal.json'), 'utf8'); okay(history(clone));
      assert.equal(fs.readFileSync(path.join(clone, 'data/map-archive/journal.json'), 'utf8'), before);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(clone, { recursive: true, force: true }); }
});

test('непригодные исторические форматы перечисляются по коммитам, корректные срезы сохраняются', () => {
  const root = fixture();
  try {
    put(root, '2026-10-01 12:00'); commit(root, 'Baseline');
    const rejected = [];
    const make = (day, mutate) => {
      put(root, `2026-10-${String(day).padStart(2, '0')} 12:00`);
      const file = path.join(root, 'data/zones.geojson'); const z = JSON.parse(fs.readFileSync(file, 'utf8'));
      const result = mutate(z); fs.writeFileSync(file, typeof result === 'string' ? result : JSON.stringify(z));
      rejected.push(commit(root, `Invalid historical ${day}`));
    };
    make(2, z => { z.type = 'LegacyCollection'; });
    make(3, z => { z.features = []; });
    make(4, z => { z.features[0].geometry.type = 'LineString'; });
    make(5, z => { z.features[0].geometry.coordinates[0].pop(); });
    make(6, () => '{invalid-json');
    make(7, z => { z.updated = 'undated'; });
    put(root, '2026-10-08 12:00', 1); commit(root, 'Valid current');
    okay(history(root)); const journal = json(root, 'data/map-archive/journal.json');
    assert.equal(journal.versions.length, 2);
    for (const id of rejected) assert.ok(journal.warnings.some(w => w.includes(id.slice(0, 12))));
    okay(run(root, process.execPath, [path.join(SOURCE, 'tools/map-statistics.mjs')]));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('пустой инициализированный Git сохраняет текущий срез без выдуманной истории', () => {
  const root = fixture();
  try {
    put(root, '2026-10-01 12:00'); okay(history(root));
    assert.equal(json(root, 'data/map-archive/journal.json').versions.length, 1);
    okay(run(root, process.execPath, [path.join(SOURCE, 'tools/map-statistics.mjs')]));
    assert.equal(json(root, 'data/map-statistics.json').periods.latest.status, 'insufficient');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('повреждённый объект коммита не превращается в отсутствие истории Git', () => {
  const root = fixture();
  try {
    put(root, '2026-10-01 12:00'); const first = commit(root, 'First');
    put(root, '2026-10-02 12:00', 1); commit(root, 'Second');
    fs.unlinkSync(path.join(root, '.git/objects', first.slice(0, 2), first.slice(2)));
    const result = history(root);
    assert.notEqual(result.status, 0); assert.match(result.stderr, /истории Git|HEAD истории Git/);
    assert.equal(fs.existsSync(path.join(root, 'data/map-archive/journal.json')), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('старое нестандартное описание не теряет корректную геометрию и не приписывает причину', () => {
  const root = fixture();
  try {
    put(root, '2026-10-01 12:00'); commit(root, 'Baseline');
    put(root, '2026-10-02 12:00', 1);
    fs.writeFileSync(path.join(root, 'data/map-changes.json'), JSON.stringify({ changes: [null,
      { zonesUpdated: '2026-10-02 12:00', kind: 'old-nonstandard-kind', title: { bad: true }, details: 'old string' }
    ] }));
    const legacy = commit(root, 'Legacy metadata');
    put(root, '2026-10-03 12:00', 2); commit(root, 'Current');
    okay(history(root)); const journal = json(root, 'data/map-archive/journal.json');
    assert.equal(journal.versions.length, 3);
    assert.equal(journal.versions[1].kind, 'unknown'); assert.equal(journal.versions[1].title, '');
    assert.deepEqual(journal.versions[1].details, []);
    assert.ok(journal.warnings.some(w => w.includes(legacy.slice(0, 12)) && w.includes('old-nonstandard-kind')));
    okay(run(root, process.execPath, [path.join(SOURCE, 'tools/map-statistics.mjs')]));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('повреждённое старое JSON-описание не мешает сохранить пригодный срез', () => {
  const root = fixture();
  try {
    put(root, '2026-10-01 12:00'); fs.writeFileSync(path.join(root, 'data/map-changes.json'), '{broken');
    const bad = commit(root, 'Old broken change log');
    put(root, '2026-10-02 12:00', 1); commit(root, 'Current');
    okay(history(root)); const journal = json(root, 'data/map-archive/journal.json');
    assert.equal(journal.versions.length, 2); assert.equal(journal.versions[0].kind, 'unknown');
    assert.ok(journal.warnings.some(w => w.includes(bad.slice(0, 12)) && w.includes('повреждено')));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('неподдерживаемый тип текущего изменения остаётся ошибкой, архив не меняется', () => {
  const root = fixture();
  try {
    put(root, '2026-10-01 12:00'); commit(root, 'Baseline'); okay(history(root));
    const before = fs.readFileSync(path.join(root, 'data/map-archive/journal.json'), 'utf8');
    put(root, '2026-10-02 12:00', 1);
    const file = path.join(root, 'data/map-changes.json'), change = json(root, 'data/map-changes.json');
    change.changes[0].kind = 'unsupported-current-kind'; fs.writeFileSync(file, JSON.stringify(change));
    const result = history(root); assert.notEqual(result.status, 0); assert.match(result.stderr, /неподдерживаемый kind/);
    assert.equal(fs.readFileSync(path.join(root, 'data/map-archive/journal.json'), 'utf8'), before);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('явный импорт непригодной карты останавливается без перезаписи архива', () => {
  const root = fixture();
  try {
    put(root, '2026-10-01 12:00'); commit(root, 'Baseline'); okay(history(root));
    const before = fs.readFileSync(path.join(root, 'data/map-archive/journal.json'), 'utf8');
    const bad = path.join(root, 'import.geojson'); fs.writeFileSync(bad, JSON.stringify({ type: 'FeatureCollection', updated: '2026-10-02 12:00', features: [] }));
    const result = run(root, process.execPath, [path.join(SOURCE, 'tools/map-history.mjs'), `--import=${bad}`]);
    assert.notEqual(result.status, 0); assert.match(result.stderr, /пустой|повреждённый/);
    assert.equal(fs.readFileSync(path.join(root, 'data/map-archive/journal.json'), 'utf8'), before);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('сохранённый архив строго проверяется до импорта и записи новых срезов', () => {
  const root = fixture();
  try {
    put(root, '2026-10-01 12:00'); commit(root, 'Baseline'); okay(history(root));
    const file = path.join(root, 'data/map-archive/journal.json'), journal = json(root, 'data/map-archive/journal.json');
    journal.versions[0].kind = 'damaged-kind'; fs.writeFileSync(file, JSON.stringify(journal));
    const before = fs.readFileSync(file, 'utf8'); put(root, '2026-10-02 12:00', 1);
    const result = history(root); assert.notEqual(result.status, 0); assert.match(result.stderr, /целостность метаданных/);
    assert.equal(fs.readFileSync(file, 'utf8'), before);
    assert.equal(fs.readdirSync(path.join(root, 'data/map-archive')).filter(f => f.endsWith('.geojson')).length, 1);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('неполный clone сохраняет гидратированный полный архив и помечает ограничение Git', () => {
  const root = fixture(); const clone = fs.mkdtempSync(path.join(os.tmpdir(), 'krm-history-shallow-'));
  try {
    for (const [day, shift] of [[1, 0], [2, 1], [3, 2]]) { put(root, `2026-10-0${day} 12:00`, shift); commit(root, `Day ${day}`); }
    okay(history(root)); git(root, ['add', 'data/map-archive', 'data/map-statistics-config.json', 'data/utm-campaigns.json', 'data/pages.json']);
    git(root, ['-c', 'user.name=Regression Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Saved complete archive']);
    okay(run(root, 'git', ['clone', '-q', '--depth=1', `file://${root}`, clone]));
    okay(history(clone)); const journal = json(clone, 'data/map-archive/journal.json');
    assert.equal(journal.gitMode, 'shallow'); assert.equal(journal.versions.length, 3);
    assert.ok(journal.warnings.some(w => w.includes('неполной историей')));
  } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(clone, { recursive: true, force: true }); }
});

test('незалитая ветка с экспериментальной картой не загрязняет опубликованную историю', () => {
  const root = fixture();
  try {
    put(root, '2026-10-01 12:00'); commit(root, 'Baseline');
    const main = git(root, ['branch', '--show-current']); git(root, ['switch', '-q', '-c', 'experiment']);
    put(root, '2026-10-20 12:00', 5); commit(root, 'Unpublished experiment');
    git(root, ['switch', '-q', main]); put(root, '2026-10-02 12:00', 1); commit(root, 'Published current');
    okay(history(root)); const journal = json(root, 'data/map-archive/journal.json');
    assert.equal(journal.versions.length, 2); assert.equal(journal.versions.at(-1).updated, '2026-10-02 12:00');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('слияние ветки не скрывает её доступные исторические срезы', () => {
  const root = fixture();
  try {
    put(root, '2026-10-01 12:00'); commit(root, 'Baseline');
    const main = git(root, ['branch', '--show-current']); git(root, ['switch', '-q', '-c', 'published-maps']);
    put(root, '2026-10-02 12:00', 1); commit(root, 'Merged published state');
    git(root, ['switch', '-q', main]);
    git(root, ['-c', 'user.name=Regression Test', '-c', 'user.email=test@example.invalid', 'merge', '--no-ff', '-qm', 'Merge published map', 'published-maps']);
    put(root, '2026-10-03 12:00', 2); commit(root, 'Current');
    okay(history(root)); assert.equal(json(root, 'data/map-archive/journal.json').versions.length, 3);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('старые майские часы без нуля восстанавливаются из Git после прежнего исключения без изменения исходников', () => {
  const root = fixture();
  try {
    const dates = ['2026-05-18 8:08', '2026-05-21 8:37', '2026-05-23 7:14'], revisions = [];
    for (const [i, date] of dates.entries()) {
      put(root, date, i / 4);
      const raw = fs.readFileSync(path.join(root, 'data/zones.geojson'), 'utf8');
      revisions.push({ commit: commit(root, date), kind: 'unusable', updated: date, publishedAt: null,
        rawSha256: crypto.createHash('sha256').update(raw).digest('hex'), reason: `Недопустимое время среза: ${date}`, layerNames: ['russian'] });
    }
    put(root, '2026-05-24 08:00', 1); commit(root, 'Current'); okay(history(root));
    const file = path.join(root, 'data/map-archive/journal.json'), journal = json(root, 'data/map-archive/journal.json');
    const current = journal.versions.at(-1), currentBytes = savedBytes(root, current);
    assert.deepEqual(journal.versions.map(item => item.updated), [...dates, '2026-05-24 08:00']);
    journal.versions = [current]; journal.skippedRevisions = revisions;
    journal.warnings = revisions.map(item => `Не импортирован исторический срез Git ${item.commit.slice(0, 12)} (${item.updated}): ${item.reason} Названия слоёв (первые 20): ["russian"].`);
    fs.writeFileSync(file, JSON.stringify(journal));
    const cacheFile = path.join(root, 'data/map-history/manifest.json'), cache = json(root, 'data/map-history/manifest.json');
    cache.versions = cache.versions.filter(item => item.updated === current.updated); fs.writeFileSync(cacheFile, JSON.stringify(cache));
    okay(history(root)); const restored = json(root, 'data/map-archive/journal.json');
    assert.deepEqual(restored.versions.map(item => item.updated), [...dates, current.updated]);
    assert.equal(restored.skippedRevisions.length, 0);
    assert.equal(restored.warnings.some(w => revisions.some(item => w.includes(item.commit.slice(0, 12)))), false);
    assert.equal(savedBytes(root, current), currentBytes);
    for (const item of restored.versions) checkVariant(root, item);
    okay(statistics(root)); assert.equal(json(root, 'data/map-statistics.json').intervals.length, 3);
    const before = fs.readFileSync(file, 'utf8'); okay(history(root)); assert.equal(fs.readFileSync(file, 'utf8'), before);
    okay(statistics(root)); okay(run(root, process.execPath, [path.join(SOURCE, 'tools/map-statistics.mjs'), '--check']));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
