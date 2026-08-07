import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(process.cwd());
const ZONES_REL = 'data/zones.geojson';
const CHANGES_REL = 'data/map-changes.json';
const OUT_REL = 'data/map-history';
const OUT_DIR = path.join(ROOT, OUT_REL);
const LIMIT = Math.max(2, Math.min(48, Number.parseInt(process.env.KRM_MAP_HISTORY_LIMIT || '24', 10) || 24));

const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const parse = (text, label) => {
  try { return JSON.parse(text); }
  catch (error) { throw new Error(`${label}: некорректный JSON (${error.message})`); }
};
const git = args => {
  try {
    return execFileSync('git', args, {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch { return ''; }
};
const normalizeUpdated = value => String(value || '').trim();
const timeValue = value => {
  const date = new Date(String(value || '').trim().replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};
const slug = value => String(value || 'unknown')
  .trim().replace(' ', 'T').replace(/:/g, '-').replace(/[^\dA-Za-zT+_-]/g, '-').replace(/-+/g, '-');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const coordKey = coord => (Array.isArray(coord) ? coord.slice(0, 2).map(value => Number(value).toFixed(7)).join(',') : '');

// KML/GeoJSON converters can start a polygon ring at a different vertex or flip its
// winding without changing the actual shape. Canonicalising those harmless changes
// prevents fake "new snapshots" in the history list.
const canonicalRing = ring => {
  if (!Array.isArray(ring) || !ring.length) return [];
  let pts = ring.map(point => Array.isArray(point) ? point.slice(0, 2).map(Number) : point);
  if (pts.length > 1 && coordKey(pts[0]) === coordKey(pts[pts.length - 1])) pts = pts.slice(0, -1);
  if (!pts.length) return [];
  const rotateAtMin = sequence => {
    let min = 0;
    for (let i = 1; i < sequence.length; i += 1) {
      if (coordKey(sequence[i]) < coordKey(sequence[min])) min = i;
    }
    return sequence.slice(min).concat(sequence.slice(0, min));
  };
  const forward = rotateAtMin(pts);
  const reverse = rotateAtMin([...pts].reverse());
  const a = forward.map(coordKey).join(';');
  const b = reverse.map(coordKey).join(';');
  return a <= b ? forward : reverse;
};
const canonicalGeometry = geometry => {
  if (!geometry || typeof geometry !== 'object') return null;
  const type = geometry.type;
  if (type === 'Polygon') {
    const rings = (geometry.coordinates || []).map(canonicalRing);
    return { type, coordinates: rings.length ? [rings[0], ...rings.slice(1).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))] : [] };
  }
  if (type === 'MultiPolygon') {
    const polygons = (geometry.coordinates || []).map(poly => canonicalGeometry({ type: 'Polygon', coordinates: poly }).coordinates);
    polygons.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    return { type, coordinates: polygons };
  }
  if (type === 'LineString') return { type, coordinates: (geometry.coordinates || []).map(point => point.slice(0, 2).map(Number)) };
  if (type === 'MultiLineString') return { type, coordinates: (geometry.coordinates || []).map(line => line.map(point => point.slice(0, 2).map(Number))) };
  return geometry;
};
const geometrySha256 = zones => {
  const normalized = (zones.features || []).map(feature => canonicalGeometry(feature?.geometry));
  normalized.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return sha256(JSON.stringify(normalized));
};
const validateZones = (zones, label) => {
  if (zones?.type !== 'FeatureCollection' || !Array.isArray(zones.features)) {
    throw new Error(`${label}: ожидается GeoJSON FeatureCollection.`);
  }
  if (!zones.features.length) throw new Error(`${label}: features пуст. Публикация пустой карты запрещена.`);
};
const pickChange = (payload, updated) => {
  const changes = Array.isArray(payload?.changes) ? payload.changes : [];
  return changes.find(item => normalizeUpdated(item?.zonesUpdated) === updated)
    || (normalizeUpdated(payload?.updated) === updated ? changes[0] : null)
    || null;
};

const currentZonesText = read(ZONES_REL);
const currentZones = parse(currentZonesText, ZONES_REL);
validateZones(currentZones, ZONES_REL);
const currentUpdated = normalizeUpdated(currentZones.updated);
if (!currentUpdated) throw new Error(`${ZONES_REL}: укажите верхнее поле updated, например "2026-08-08 18:30".`);

const currentChangesText = read(CHANGES_REL);
const currentChanges = parse(currentChangesText, CHANGES_REL);
const currentChange = pickChange(currentChanges, currentUpdated);
if (!currentChange) {
  throw new Error(`${CHANGES_REL}: нет записи с zonesUpdated="${currentUpdated}". Нужна одна запись для текущего редакционного среза.`);
}

// Critical one-person-workflow guard: if geometry changed against HEAD, the date must change too.
const headZonesText = git(['show', `HEAD:${ZONES_REL}`]);
if (headZonesText) {
  try {
    const headZones = parse(headZonesText, `HEAD:${ZONES_REL}`);
    validateZones(headZones, `HEAD:${ZONES_REL}`);
    if (geometrySha256(headZones) !== geometrySha256(currentZones)
        && normalizeUpdated(headZones.updated) === currentUpdated) {
      throw new Error(
        `Геометрия ${ZONES_REL} изменилась, но updated осталось "${currentUpdated}". `
        + 'Поставьте дату/время нового редакционного среза — иначе история не сможет отличить версии.'
      );
    }
  } catch (error) {
    if (/Геометрия/.test(error.message)) throw error;
    // An old malformed historical revision must not block a valid current map.
  }
}

const records = [];
const seenKey = new Set();
const addRecord = ({ zonesText, changesText = '', commit = '', source = '', metadata = null }) => {
  let zones;
  try {
    zones = parse(zonesText, `${source || 'history'}:${ZONES_REL}`);
    validateZones(zones, `${source || 'history'}:${ZONES_REL}`);
  } catch {
    if (source === 'working') throw new Error(`${ZONES_REL}: текущий срез не прошёл проверку.`);
    return;
  }
  const updated = normalizeUpdated(zones.updated);
  if (!updated) return;
  const geomSha = geometrySha256(zones);
  // First record is working tree/current, then Git runs newest -> oldest; identical shape is one slice.
  if (seenKey.has(geomSha)) return;
  seenKey.add(geomSha);
  let change = null;
  if (changesText) {
    try { change = pickChange(JSON.parse(changesText), updated); } catch {}
  }
  const serialized = `${JSON.stringify(zones)}\n`;
  records.push({
    updated,
    snapshot: '',
    sha256: sha256(serialized),
    geometrySha256: geomSha,
    featureCount: zones.features.length,
    title: metadata?.title || change?.title || '',
    summary: metadata?.summary || change?.summary || '',
    details: Array.isArray(metadata?.details) ? metadata.details.slice(0, 8) : (Array.isArray(change?.details) ? change.details.slice(0, 8) : []),
    relatedUrl: metadata?.relatedUrl || change?.relatedUrl || '',
    relatedTitle: metadata?.relatedTitle || change?.relatedTitle || '',
    commit: commit ? commit.slice(0, 12) : '',
    serialized
  });
};

addRecord({ zonesText: currentZonesText, changesText: currentChangesText, source: 'working' });
const commits = git(['log', '--format=%H', '--', ZONES_REL]).split(/\r?\n/).map(value => value.trim()).filter(Boolean);
let reusedCachedHistory = false;
if (commits.length) {
  for (const commit of commits.slice(0, LIMIT * 12)) {
    if (records.length >= LIMIT) break;
    const zonesText = git(['show', `${commit}:${ZONES_REL}`]);
    if (!zonesText) continue;
    const changesText = git(['show', `${commit}:${CHANGES_REL}`]);
    addRecord({ zonesText, changesText, commit, source: commit });
  }
} else {
  // A source release contains the generated map-history cache but no .git directory.
  // Reuse it only when it belongs to exactly the same current editorial slice.
  const cachedManifestFile = path.join(OUT_DIR, 'manifest.json');
  if (fs.existsSync(cachedManifestFile)) {
    try {
      const cached = parse(fs.readFileSync(cachedManifestFile, 'utf8'), `${OUT_REL}/manifest.json`);
      if (cached?.schema === 'krmrf-map-history-v3' && normalizeUpdated(cached.current) === currentUpdated && Array.isArray(cached.versions)) {
        for (const item of cached.versions) {
          if (records.length >= LIMIT) break;
          const rel = String(item?.snapshot || '').replace(/^\//, '');
          if (!rel.startsWith(`${OUT_REL}/`)) continue;
          const snapshotFile = path.join(ROOT, rel);
          if (!fs.existsSync(snapshotFile)) continue;
          addRecord({ zonesText: fs.readFileSync(snapshotFile, 'utf8'), source: 'cached', metadata: item });
        }
        reusedCachedHistory = records.length > 1;
      }
    } catch {
      // Invalid/stale generated cache is ignored; the valid current map still builds.
    }
  }
}

records.sort((a, b) => timeValue(b.updated) - timeValue(a.updated) || b.updated.localeCompare(a.updated));
const selected = records.slice(0, LIMIT);
fs.mkdirSync(OUT_DIR, { recursive: true });
const keep = new Set(['manifest.json']);
for (const record of selected) {
  const filename = `${slug(record.updated)}.geojson`;
  keep.add(filename);
  fs.writeFileSync(path.join(OUT_DIR, filename), record.serialized, 'utf8');
  record.snapshot = `/${OUT_REL}/${filename}`;
  delete record.serialized;
  // Commit is useful for debugging locally but has no value to readers and exposes internals.
  delete record.commit;
}
for (const entry of fs.readdirSync(OUT_DIR, { withFileTypes: true })) {
  if (entry.isFile() && !keep.has(entry.name)) fs.unlinkSync(path.join(OUT_DIR, entry.name));
}
const manifest = {
  schema: 'krmrf-map-history-v3',
  generatedFrom: commits.length ? 'git' : (reusedCachedHistory ? 'cached' : 'current-only'),
  current: currentUpdated,
  limit: LIMIT,
  versions: selected
};
fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(`История карты: ${selected.length} геометрически разных редакционных срезов; текущий — ${currentUpdated}.`);
if (!commits.length && reusedCachedHistory) console.log('Git-история недоступна: сохранены проверенные редакционные срезы из исходного архива.');
else if (!commits.length) console.log('Git-история недоступна: создан только текущий срез. В рабочей ветке история восстановится автоматически.');
console.log(`Ручные файлы остаются прежними: ${ZONES_REL} + ${CHANGES_REL}.`);
