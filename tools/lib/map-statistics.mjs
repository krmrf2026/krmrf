import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
export function validateConfig(config) {
  if (config?.schema !== 'krmrf-map-statistics-config-v1' || config.timezone !== 'Europe/Moscow'
      || config.legacyOffset !== '+03:00' || typeof config.scopeVersion !== 'string' || !config.scopeVersion.trim()
      || typeof config.scopeLabel !== 'string' || !config.scopeLabel.trim() || config.displayDecimals !== 1) throw new Error('Неподдерживаемая конфигурация статистики карты.');
  return config;
}
export function publishedAt(value, offset = '+03:00') {
  // Old editorial timestamps may write 8:08 instead of 08:08. Preserve the
  // original file; normalize only the unambiguous legacy hour for parsing.
  const s = String(value || '').trim().replace(/^(\d{4}-\d{2}-\d{2}) (\d):/, '$1 0$2:').replace(' ', 'T');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(s)) throw new Error(`Недопустимое время среза: ${value}`);
  const [hour, minute, second = '0'] = s.slice(11).split(/[:Z+\-]/);
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second) >= 60) throw new Error(`Недопустимое время среза: ${value}`);
  const explicit = /(?:Z|[+-]\d{2}:\d{2})$/.test(s) ? s : `${s}${offset}`;
  const d = new Date(explicit);
  if (!Number.isFinite(d.getTime())) throw new Error(`Недопустимая дата среза: ${value}`);
  const day = s.slice(0, 10), [y, m, n] = day.split('-').map(Number);
  if (new Date(Date.UTC(y, m - 1, n)).toISOString().slice(0, 10) !== day) throw new Error(`Несуществующая календарная дата: ${value}`);
  return d.toISOString();
}
const ringKey = ring => {
  const pts = ring.slice(0, -1).map(p => JSON.stringify(p.slice(0, 2)));
  const turn = list => { const min = list.indexOf([...list].sort()[0]); return list.slice(min).concat(list.slice(0, min)).join(';'); };
  return [turn(pts), turn([...pts].reverse())].sort()[0];
};
export const geometryHash = zones => {
  const keys = zones.features.map(f => {
    const g = f.geometry, poly = rings => [ringKey(rings[0]), ...rings.slice(1).map(ringKey).sort()].join('|');
    const shape = g?.type === 'Polygon' ? poly(g.coordinates) : g?.type === 'MultiPolygon' ? g.coordinates.map(poly).sort().join('||') : JSON.stringify(g);
    return `${String(f.properties?.name || '').toLowerCase()}:${g?.type}:${shape}`;
  }).sort();
  return crypto.createHash('sha256').update(JSON.stringify(keys)).digest('hex');
};
export function safeSnapshot(value) {
  if (!/^\/data\/map-(?:archive|history)\/[\w.+-]+\.geojson$/.test(String(value))) throw new Error(`Недопустимый путь среза: ${value}`);
  return value.slice(1);
}
export function writeJson(root, rel, value) {
  const file = path.join(root, rel); fs.mkdirSync(path.dirname(file), { recursive: true });
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === bytes) return;
  fs.writeFileSync(`${file}.tmp`, bytes); fs.renameSync(`${file}.tmp`, file);
}
const sandbox = { Intl, Date, Number, Math, String, Object, Array, Set, Map };
vm.runInNewContext(fs.readFileSync(new URL('../../assets/js/map-statistics-core.js', import.meta.url), 'utf8'), sandbox);
export const core = sandbox.KRMMapStatistics;
