import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { MAP_META_CSP, META_CSP } from './lib/hosting.mjs';

const ROOT = path.resolve(process.cwd());
const errors = [];
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const json = rel => JSON.parse(read(rel));
const exists = rel => fs.existsSync(path.join(ROOT, rel));

try {
  const zones = json('data/zones.geojson');
  const changes = json('data/map-changes.json');
  const places = json('data/map-places.json');
  const history = json('data/map-history/manifest.json');
  const html = read('map/index.html');
  const js = read('assets/js/map.js');

  if (zones?.type !== 'FeatureCollection' || !zones.updated || !zones.features?.length) errors.push('zones.geojson: текущая геометрия или updated отсутствуют.');
  if (changes?.changes?.[0]?.zonesUpdated !== zones.updated) errors.push('map-changes.json не совпадает с текущим zones.updated.');
  if (places?.schema !== 'krmrf-map-places-v2' || !Array.isArray(places.places) || places.places.length < 20) errors.push('map-places.json: русскоязычный справочник отсутствует или повреждён.');
  if (history?.schema !== 'krmrf-map-history-v3' || history.current !== zones.updated || !history.versions?.length) errors.push('map-history/manifest.json: история не согласована с текущей картой.');
  if (new Set(history.versions.map(item => item.geometrySha256)).size !== history.versions.length) errors.push('map-history: одинаковая геометрия попала в интерфейс как разные срезы.');
  for (const item of history.versions) if (!item.snapshot || !exists(item.snapshot.replace(/^\//, ''))) errors.push(`map-history: отсутствует ${item.snapshot || 'snapshot'}.`);

  if (!html.includes('maplibre-gl@5.24.0')) errors.push('map/index.html: MapLibre 5.24.0 не подключён.');
  if (!html.includes('/assets/vendor/leaflet/leaflet.js')) errors.push('map/index.html: локальный Leaflet fallback удалён.');
  if (/Нейтральная KRM|нейтральная схема|Подложка/i.test(html)) errors.push('map/index.html: вернулся отклонённый интерфейс нейтральной подложки.');
  if (!html.includes('mapPlaceSearch') || !html.includes('mapSnapshotSelect') || !html.includes('mapComparePanel')) errors.push('map/index.html: нет поиска, истории или явного сравнения.');
  if (!html.includes(MAP_META_CSP)) errors.push('map/index.html: нет map-specific CSP.');

  if (!js.includes("https://tiles.openfreemap.org/styles/bright")) errors.push('map.js: OpenFreeMap Bright не является основной подложкой.');
  if (!js.includes("'name:ru'")) errors.push('map.js: нет принудительного приоритета русских подписей.');
  if (!js.includes("''\n        ]")) errors.push('map.js: русская локализация должна скрывать неподходящее generic-name вместо возврата к нему.');
  if (!js.includes('createMapLibre') || !js.includes('createLeaflet')) errors.push('map.js: нет основной MapLibre-карты и резервного Leaflet.');
  if (!js.includes('Сравнить с текущей')) errors.push('map.js: режим сравнения не найден.');

  const indexHtml = read('index.html');
  if (!indexHtml.includes(META_CSP) || indexHtml.includes(MAP_META_CSP)) errors.push('Главная получила map-specific CSP; изменения вышли за пределы карты.');

  if (exists('dist')) {
    for (const rel of ['data/map-places.json', 'data/map-history/manifest.json', 'map/index.html', 'assets/js/map.js']) {
      if (!exists(`dist/${rel}`)) errors.push(`dist: отсутствует ${rel}.`);
    }
    if (exists('dist/map/index.html') && !read('dist/map/index.html').includes(MAP_META_CSP)) errors.push('dist/map/index.html: неверная CSP.');
    if (exists('dist/index.html') && !read('dist/index.html').includes(META_CSP)) errors.push('dist/index.html: глобальная CSP изменилась.');
  }
} catch (error) {
  errors.push(error.message);
}

if (errors.length) {
  console.error('Проверка карты не пройдена:');
  console.error(errors.map(item => `• ${item}`).join('\n'));
  process.exit(1);
}
console.log('Карта проверена: MapLibre/OpenFreeMap с русскими подписями, локальный поиск, редакционные срезы, явное сравнение и Leaflet-fallback согласованы.');
