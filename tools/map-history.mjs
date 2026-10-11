import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { prepareLayer, layerArea } from './lib/map-area.mjs';
import { publishedAt, geometryHash, safeSnapshot, writeJson, validateConfig } from './lib/map-statistics.mjs';

const ROOT = process.cwd(), ARCHIVE = 'data/map-archive', HISTORY = 'data/map-history';
const LIMIT = Math.max(2, Math.min(48, Number.parseInt(process.env.KRM_MAP_HISTORY_LIMIT || '24', 10) || 24));
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const config = validateConfig(JSON.parse(read('data/map-statistics-config.json')));
const gitOptions = { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, LC_ALL: 'C' } };
const git = (args, trim = true) => {
  try { const output = execFileSync('git', args, gitOptions); return trim ? output.trim() : output; }
  catch (error) { throw new Error(`Ошибка чтения истории Git (${args[0]}): ${String(error.stderr || error.message).trim()}`, { cause: error }); }
};
const records = new Map(), ambiguous = new Map(), bytes = new Map(), warnings = new Set(), validatedGeometry = new Set(), skipped = new Map(), candidates = [];
const identity = item => JSON.stringify([item.publishedAt, item.geometrySha256, item.scopeVersion]);
// A Git import/cache is evidence of a revision, not proof of which conflicting
// revision was published. Keep independently observed publication provenance.
const anchored = item => item?.sourceRefs.some(ref => ref === 'published-map' || ref.startsWith('import:') || /^archive:.*@sha256:[a-f0-9]{64}$/.test(ref));
const kinds = new Set(['unknown', 'control', 'cartographic', 'mixed', 'review']);
const zones = JSON.parse(read('data/zones.geojson')), changes = JSON.parse(read('data/map-changes.json'));
const currentAt = publishedAt(zones.updated, config.legacyOffset);
const pick = (payload, updated) => Array.isArray(payload?.changes) ? payload.changes.find(c => c && typeof c === 'object' && c.zonesUpdated === updated) || null : null;
const metadata = (change, provenance, historical = false) => {
  const result = {};
  for (const key of ['title', 'summary', 'relatedUrl', 'relatedTitle']) {
    if (change[key] != null && typeof change[key] !== 'string') {
      if (!historical) throw new Error(`${provenance}: ${key} должен быть строкой.`);
      warnings.add(`${provenance}: неподдерживаемое поле ${key} в старом описании не использовано.`);
    } else result[key] = change[key] || '';
  }
  if (change.details != null && (!Array.isArray(change.details) || change.details.some(d => typeof d !== 'string'))) {
    if (!historical) throw new Error(`${provenance}: details должен быть массивом строк.`);
    warnings.add(`${provenance}: неподдерживаемые details в старом описании не использованы.`);
  }
  result.details = Array.isArray(change.details) && change.details.every(d => typeof d === 'string') ? change.details : [];
  if (change.kind && !kinds.has(change.kind)) {
    if (!historical) throw new Error(`${provenance}: неподдерживаемый kind ${String(change.kind)}.`);
    warnings.add(`${provenance}: старый kind ${String(change.kind)} сохранён как unknown; причина изменения не установлена.`);
  }
  result.kind = kinds.has(change.kind) ? change.kind : 'unknown';
  return result;
};
if (!Array.isArray(changes?.changes) || !pick(changes, zones.updated)) throw new Error('map-changes.json: нет объяснения текущего zones.updated.');
metadata(pick(changes, zones.updated), 'published-map');
const validate = (z, provenance, saved = null) => {
  if (z?.type !== 'FeatureCollection' || !Array.isArray(z.features) || !z.features.length) throw new Error(`${provenance}: пустой/повреждённый срез.`);
  if (z.features.some(f => f?.type !== 'Feature')) throw new Error(`${provenance}: features содержит неподдерживаемый объект GeoJSON.`);
  const at = publishedAt(z.updated, config.legacyOffset), geom = geometryHash(z);
  if (!validatedGeometry.has(geom)) {
    const area = layerArea(prepareLayer(z));
    if (!Number.isFinite(area) || area <= 0) throw new Error('Срез без корректной положительной площади российского слоя.');
    validatedGeometry.add(geom);
  }
  const scope = z.statistics?.scopeVersion ?? saved?.scopeVersion ?? config.scopeVersion;
  if (typeof scope !== 'string' || !scope.trim()) throw new Error(`${provenance}: некорректный scopeVersion.`);
  return { at, geom, scope };
};
const add = (raw, payload, provenance, saved = null, historical = false, destination = records) => {
  const z = JSON.parse(raw), { at, geom, scope } = validate(z, provenance, saved);
  const key = destination === records ? at : identity({ publishedAt: at, geometrySha256: geom, scopeVersion: scope });
  const previous = destination.get(key), change = metadata(pick(payload, z.updated) || saved || {}, provenance, historical);
  // Current/explicitly imported states and internally inconsistent archives
  // still fail. Historical Git candidates are grouped before calling add().
  if (previous && (previous.geometrySha256 !== geom || previous.scopeVersion !== scope)) throw new Error(`Конфликт срезов ${at}: разные контуры/охваты имеют одно время. Исправьте updated; архив не перезаписывается.`);
  if (previous) {
    for (const key of ['title', 'summary', 'relatedUrl', 'relatedTitle']) if (change[key] && !previous[key]) previous[key] = change[key];
    if (!previous.details.length && change.details.length) previous.details = change.details;
    if (previous.kind === 'unknown' && change.kind !== 'unknown') previous.kind = change.kind;
    previous.sourceRefs = [...new Set([...previous.sourceRefs, provenance, ...(saved?.sourceRefs || [])])].sort(); return previous;
  }
  const serialized = `${JSON.stringify(z)}\n`, sha = hash(serialized);
  const filename = `${at.replace(/[:+]/g, '-').replace(/[^\w.-]/g, '-')}-${sha.slice(0, 12)}.geojson`;
  const record = { id: `map-${hash(at).slice(0, 20)}`, updated: String(z.updated).trim(), publishedAt: at,
    snapshot: `/${ARCHIVE}/${filename}`, sha256: sha, geometrySha256: geom, featureCount: z.features.length, scopeVersion: scope,
    kind: change.kind, title: change.title || '', summary: change.summary || '', details: change.details,
    relatedUrl: change.relatedUrl || '', relatedTitle: change.relatedTitle || '', sourceRefs: [...new Set([...(saved?.sourceRefs || []), provenance])].sort() };
  destination.set(key, record); bytes.set(record.snapshot, serialized); return record;
};
const hydrate = (manifest, label, destination = records) => {
  if (!Array.isArray(manifest.versions)) throw new Error(`${label}: versions должен быть массивом.`);
  for (const item of manifest.versions) {
    if (!item || typeof item !== 'object' || (item.sourceRefs != null && (!Array.isArray(item.sourceRefs) || item.sourceRefs.some(s => typeof s !== 'string')))) throw new Error(`${label}: повреждена запись среза.`);
    const rel = safeSnapshot(item.snapshot), raw = read(rel), z = JSON.parse(raw);
    const permanent = label === 'archive' || label === 'ambiguous-archive';
    if (permanent && (typeof item.scopeVersion !== 'string' || !item.scopeVersion.trim() || !kinds.has(item.kind)
        || item.id !== `map-${hash(item.publishedAt).slice(0, 20)}` || item.featureCount !== z.features?.length
        || (z.statistics?.scopeVersion != null && z.statistics.scopeVersion !== item.scopeVersion))) throw new Error('Нарушена целостность метаданных постоянного архива.');
    if (item.sha256 && hash(raw) !== item.sha256) throw new Error(`${label}: контрольная сумма ${rel} не совпала.`);
    if (publishedAt(z.updated, config.legacyOffset) !== publishedAt(item.updated, config.legacyOffset)) throw new Error(`${label}: дата ${rel} не совпала.`);
    if (permanent && (hash(raw) !== item.sha256 || geometryHash(z) !== item.geometrySha256 || publishedAt(item.updated, config.legacyOffset) !== item.publishedAt)) throw new Error('Нарушена целостность записи постоянного архива.');
    const known = records.get(publishedAt(item.updated, config.legacyOffset));
    const saved = { ...item, scopeVersion: item.scopeVersion || known?.scopeVersion };
    const provenance = item.sourceRefs?.[0] || known?.sourceRefs?.[0] || label;
    if (label === 'selector-cache') {
      const { at, geom, scope } = validate(z, provenance, saved);
      candidates.push({ raw, payload: null, provenance, saved, publishedAt: at, geometrySha256: geom, scopeVersion: scope });
    } else add(raw, null, provenance, saved, false, destination);
  }
};
if (fs.existsSync(path.join(ROOT, ARCHIVE, 'journal.json'))) {
  const journal = JSON.parse(read(`${ARCHIVE}/journal.json`));
  if (journal.schema !== 'krmrf-map-archive-v1') throw new Error('Неподдерживаемый формат постоянного архива карты.');
  if (journal.warnings != null && (!Array.isArray(journal.warnings) || journal.warnings.some(w => typeof w !== 'string'))) throw new Error('Повреждён список предупреждений архива.');
  if (journal.skippedRevisions != null && !Array.isArray(journal.skippedRevisions)) throw new Error('Повреждён журнал исключений истории.');
  for (const warning of journal.warnings || []) warnings.add(warning);
  for (const item of journal.skippedRevisions || []) {
    if (!item || !/^[a-f0-9]{40,64}$/.test(item.commit) || !['absent', 'unusable', 'ambiguous'].includes(item.kind) || typeof item.reason !== 'string' || !Array.isArray(item.layerNames)
        || item.layerNames.some(name => typeof name !== 'string')
        || (item.publishedAt != null && publishedAt(item.publishedAt, config.legacyOffset) !== item.publishedAt)
        || (item.kind === 'ambiguous' && (!item.publishedAt || !['unresolved', 'anchored'].includes(item.resolution) || !Number.isInteger(item.variantCount) || item.variantCount < 2))) throw new Error('Повреждена запись исключённой версии истории.');
    skipped.set(item.commit, item);
  }
  hydrate(journal, 'archive');
  hydrate({ versions: journal.ambiguousVersions ?? [] }, 'ambiguous-archive', ambiguous);
  for (const item of skipped.values()) if (item.kind === 'ambiguous') {
    const variant = ambiguous.get(identity(item));
    if (!variant || variant.snapshot !== item.snapshot || variant.sha256 !== item.sha256 || !/^[a-f0-9]{64}$/.test(item.rawSha256)) throw new Error('Нарушена целостность ссылки на спорный архивный срез.');
  }
}
if (fs.existsSync(path.join(ROOT, HISTORY, 'manifest.json'))) {
  const cached = JSON.parse(read(`${HISTORY}/manifest.json`));
  if (cached.schema !== 'krmrf-map-history-v3') throw new Error('Неподдерживаемый формат старого кэша карты.'); hydrate(cached, 'selector-cache');
}
const importArg = process.argv.find(a => a.startsWith('--import='));
if (importArg) { const file = path.resolve(importArg.slice(9)); add(fs.readFileSync(file, 'utf8'), null, `import:${path.basename(file)}`); }
// Validate current publication against the saved archive before examining Git.
add(read('data/zones.geojson'), changes, 'published-map');
let hasMarker = Boolean(process.env.GIT_DIR);
for (let dir = ROOT; ; dir = path.dirname(dir)) {
  if (fs.existsSync(path.join(dir, '.git'))) hasMarker = true;
  if (path.dirname(dir) === dir) break;
}
const probe = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], gitOptions);
const hasGit = probe.status === 0 && probe.stdout.trim() === 'true';
if (!hasGit && (hasMarker || (probe.error?.code !== 'ENOENT' && !/not a git repository/i.test(probe.stderr || '')))) throw new Error(`Не удалось проверить репозиторий Git: ${String(probe.stderr || probe.error?.message || 'нет рабочей копии').trim()}`);
let gitMode = 'unavailable';
if (hasGit) {
  const shallow = git(['rev-parse', '--is-shallow-repository']) === 'true';
  gitMode = shallow ? 'shallow' : 'available-head-ancestry';
  if (shallow) warnings.add('Git получен с неполной историей; доступные срезы импортированы, более ранние версии не восстановлены.');
  // Traverse all reachable path history, including merged branches. Do not import
  // unmerged drafts from other refs. The display limit never truncates the archive.
  const headProbe = spawnSync('git', ['rev-parse', '--verify', '--quiet', 'HEAD'], gitOptions);
  let commits = [];
  if (headProbe.status === 0) commits = git(['log', '--full-history', '--format=%H', headProbe.stdout.trim(), '--', 'data/zones.geojson']).split(/\r?\n/).filter(Boolean).reverse();
  else if (headProbe.status !== 1 || headProbe.error || !git(['symbolic-ref', '--quiet', 'HEAD']) || git(['for-each-ref', '--format=%(objectname)'])) throw new Error('Не удалось прочитать HEAD истории Git.');
  for (const commit of commits) {
    const entry = git(['ls-tree', '--full-tree', commit, '--', 'data/zones.geojson']);
    if (!entry) {
      const reason = 'data/zones.geojson отсутствует; это не срез карты.';
      skipped.set(commit, { commit, kind: 'absent', updated: null, publishedAt: null, rawSha256: null, reason, layerNames: [] });
      warnings.add(`Пропущен коммит Git ${commit.slice(0, 12)}: ${reason}`); continue;
    }
    if (!/^\d{6}\s+blob\s+[a-f0-9]{40,64}\tdata\/zones\.geojson$/.test(entry)) throw new Error(`Неподдерживаемая запись файла карты в Git ${commit.slice(0, 12)}.`);
    let raw;
    try { raw = git(['show', `${commit}:data/zones.geojson`], false); }
    catch (error) { throw new Error(`Недоступен файл карты в Git ${commit.slice(0, 12)}: файл есть в дереве, но чтение не удалось.`, { cause: error }); }
    if (!raw.trim()) throw new Error(`Недоступен файл карты в Git ${commit.slice(0, 12)}: существующий файл пуст.`);
    let historical;
    try { historical = JSON.parse(raw); validate(historical, `git:${commit.slice(0, 12)}`); }
    catch (error) {
      let at = null; try { at = publishedAt(historical?.updated, config.legacyOffset); } catch {}
      const layerNames = Array.isArray(historical?.features) ? [...new Set(historical.features.map(f => String(f?.properties?.name || '(без имени)')))].sort().slice(0, 20) : [];
      const updated = typeof historical?.updated === 'string' ? historical.updated : null;
      skipped.set(commit, { commit, kind: 'unusable', updated, publishedAt: at, rawSha256: hash(raw), reason: error.message, layerNames });
      warnings.add(`Не импортирован исторический срез Git ${commit.slice(0, 12)} (${updated || 'дата не установлена'}): ${error.message} Названия слоёв (первые 20): ${JSON.stringify(layerNames)}.`);
      continue;
    }
    let payload = null;
    if (git(['ls-tree', '--full-tree', commit, '--', 'data/map-changes.json'])) {
      const text = git(['show', `${commit}:data/map-changes.json`]);
      try { payload = JSON.parse(text); } catch { warnings.add(`git:${commit.slice(0, 12)}: старое описание map-changes.json повреждено; геометрия сохранена, причина изменения не установлена.`); }
    }
    if (!pick(payload, historical.updated)) warnings.add(`git:${commit.slice(0, 12)}: нет согласованного старого описания; тип изменения unknown, если он не задан в сохранённом архиве.`);
    const { at, geom, scope } = validate(historical, `git:${commit.slice(0, 12)}`);
    candidates.push({ raw, payload, provenance: `git:${commit}`, saved: null, historical: true, commit,
      updated: historical.updated, publishedAt: at, geometrySha256: geom, scopeVersion: scope,
      layerNames: [...new Set(historical.features.map(f => String(f.properties?.name || '(без имени)')))].sort().slice(0, 20) });
  }
}
// Resolve each editorial timestamp as a group. Git traversal order and commit
// timestamps never choose a contour or manufacture publication timestamps.
const groups = new Map();
const group = item => {
  if (!groups.has(item.publishedAt)) groups.set(item.publishedAt, { variants: new Set(), candidates: [] });
  const result = groups.get(item.publishedAt); result.variants.add(identity(item)); return result;
};
for (const item of [...records.values(), ...ambiguous.values()]) group(item);
for (const item of candidates) group(item).candidates.push(item);
for (const [at, entry] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
  const previous = records.get(at), resolved = entry.variants.size === 1 || anchored(previous);
  const chosen = resolved ? identity(previous || entry.candidates[0] || [...ambiguous.values()].find(item => item.publishedAt === at)) : null;
  if (!resolved && previous) { ambiguous.set(identity(previous), previous); records.delete(at); }
  // An explicit import may resolve a previously quarantined variant. Its
  // original files and provenance stay intact; only archive membership changes.
  for (const [key, item] of [...ambiguous]) if (item.publishedAt === at && key === chosen) {
    add(bytes.get(item.snapshot), null, item.sourceRefs[0], item); ambiguous.delete(key);
  }
  for (const candidate of entry.candidates) {
    const selected = identity(candidate) === chosen;
    const item = add(candidate.raw, candidate.payload, candidate.provenance, candidate.saved, candidate.historical, selected ? records : ambiguous);
    if (!candidate.commit) continue;
    if (selected) {
      skipped.delete(candidate.commit);
      const short = candidate.commit.slice(0, 12);
      for (const warning of warnings) {
        if (warning.startsWith(`Не импортирован исторический срез Git ${short} (`)
            || warning.startsWith(`Пропущен коммит Git ${short}: `)) warnings.delete(warning);
      }
    }
    else skipped.set(candidate.commit, { commit: candidate.commit, kind: 'ambiguous', resolution: resolved ? 'anchored' : 'unresolved',
      updated: candidate.updated, publishedAt: at, rawSha256: hash(candidate.raw), reason: 'Одна дата updated соответствует разным контурам/охватам; порядок публикации не установлен.',
      layerNames: candidate.layerNames, snapshot: item.snapshot, sha256: item.sha256, geometrySha256: item.geometrySha256,
      scopeVersion: item.scopeVersion, variantCount: entry.variants.size });
  }
  // Keep the same decision when an older commit is no longer in a shallow
  // checkout: preserved contradictory variants still provide the evidence.
  for (const [commit, item] of skipped) if (item.kind === 'ambiguous' && item.publishedAt === at) {
    if (identity(item) === chosen) skipped.delete(commit);
    else skipped.set(commit, { ...item, resolution: resolved ? 'anchored' : 'unresolved', variantCount: entry.variants.size });
  }
  if (entry.variants.size > 1) warnings.add(`Противоречивые старые версии за ${at}: варианты сохранены отдельно в ambiguousVersions. Без независимо сохранённой публикации дата исключается из числового ряда; порядок Git не задаёт порядок публикации.`);
}
const versions = [...records.values()].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
const ambiguousVersions = [...ambiguous.values()].sort((a, b) => identity(a).localeCompare(identity(b)));
if (versions.at(-1).publishedAt !== currentAt) throw new Error('Текущая карта старше сохранённой истории. Откат требует нового редакционного времени; архив не обрезается.');
// Check every immutable filename before creating any new archive files.
for (const [snapshot, raw] of bytes) {
  const file = path.join(ROOT, safeSnapshot(snapshot));
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') !== raw) throw new Error(`Попытка перезаписи неизменного среза: ${snapshot}`);
}
for (const [snapshot, raw] of bytes) {
  const file = path.join(ROOT, safeSnapshot(snapshot));
  fs.mkdirSync(path.dirname(file), { recursive: true }); if (!fs.existsSync(file)) fs.writeFileSync(file, raw);
}
const skippedRevisions = [...skipped.values()].sort((a, b) => (a.publishedAt || '').localeCompare(b.publishedAt || '') || a.commit.localeCompare(b.commit));
writeJson(ROOT, `${ARCHIVE}/journal.json`, { schema: 'krmrf-map-archive-v1', timezone: config.timezone, legacyOffset: config.legacyOffset, current: zones.updated, versions, ambiguousVersions, warnings: [...warnings].sort(), gitMode, skippedRevisions });
// A -> B -> A remains three states; equal consecutive shapes remain in the archive.
const display = versions.filter((v, i) => !i || v.geometrySha256 !== versions[i - 1].geometrySha256 || i === versions.length - 1);
const selected = display.slice(-LIMIT).reverse().map(item => {
  const filename = `${item.id}.geojson`, snapshot = `/${HISTORY}/${filename}`;
  fs.mkdirSync(path.join(ROOT, HISTORY), { recursive: true }); fs.copyFileSync(path.join(ROOT, safeSnapshot(item.snapshot)), path.join(ROOT, HISTORY, filename));
  const { sourceRefs, publishedAt: _at, kind, ...publicItem } = item; return { ...publicItem, snapshot };
});
const keep = new Set(['manifest.json', ...selected.map(v => path.basename(v.snapshot))]);
for (const e of fs.readdirSync(path.join(ROOT, HISTORY), { withFileTypes: true })) if (e.isFile() && !keep.has(e.name)) fs.unlinkSync(path.join(ROOT, HISTORY, e.name));
writeJson(ROOT, `${HISTORY}/manifest.json`, { schema: 'krmrf-map-history-v3', generatedFrom: 'archive', current: zones.updated, limit: LIMIT, versions: selected });
console.log(`История карты: ${versions.length} пригодных событий, ${ambiguousVersions.length} спорных вариантов в отдельном архиве, ${selected.length} срезов в селекторе; исключений Git — ${skippedRevisions.length}; текущий — ${zones.updated}.`);
for (const warning of warnings) console.warn(warning);
