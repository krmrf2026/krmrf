import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { prepareLayer, layerArea, measureLayers, EARTH_RADIUS } from '../../tools/lib/map-area.mjs';
import { prepareSectors, measureSectors } from '../../tools/lib/map-sectors.mjs';
import { validateConfig, publishedAt, core } from '../../tools/lib/map-statistics.mjs';
const rect = (w, s, e, n) => [[w, s], [e, s], [e, n], [w, n], [w, s]];
const zones = rings => ({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'russian' }, geometry: { type: 'Polygon', coordinates: rings } }] });
const layer = bounds => prepareLayer(zones([rect(...bounds)]));
const square = (w, s, e, n) => EARTH_RADIUS ** 2 * (e - w) * Math.PI / 180 * (Math.sin(n * Math.PI / 180) - Math.sin(s * Math.PI / 180)) / 1e6;
const near = (a, b, epsilon = 1e-6) => assert.ok(Math.abs(a - b) <= epsilon, `${a} != ${b}`);
const config = JSON.parse(fs.readFileSync('data/map-statistics-config.json', 'utf8'));

test('маска внутри большого полигона учитывает контроль без границы внутри окна', () => {
  const before = layer([20, 40, 40, 60]), mask = layer([30, 45, 32, 47]);
  const m = measureLayers(before, before, mask);
  near(m.beforeKm2, square(30, 45, 32, 47)); near(m.afterKm2, m.beforeKm2); near(m.addedKm2, 0); near(m.removedKm2, 0);
});
test('локальный перенос сохраняет добавления и снятия при нулевом балансе', () => {
  const m = measureLayers(layer([30, 45, 32, 47]), layer([31, 45, 33, 47]), layer([30.5, 45, 32.5, 47]));
  near(m.addedKm2, square(32, 45, 32.5, 47)); near(m.removedKm2, square(30.5, 45, 31, 47)); near(m.netKm2, 0);
});
test('отверстие в российском слое внутри маски даёт снятие', () => {
  const a = layer([20, 40, 40, 60]), b = prepareLayer(zones([rect(20, 40, 40, 60), rect(30, 45, 32, 47)]));
  const m = measureLayers(a, b, layer([29, 44, 33, 48]));
  near(m.removedKm2, square(30, 45, 32, 47)); near(m.addedKm2, 0); near(m.netKm2, -m.removedKm2);
});
test('MultiPolygon, все российские features и их дубликаты внутри маски считаются однократно', () => {
  const z = zones([rect(30, 45, 32, 47)]);
  z.features[0].geometry = { type: 'MultiPolygon', coordinates: [[rect(30, 45, 32, 47)], [rect(34, 45, 35, 46)]] };
  z.features.push(zones([rect(31, 45, 33, 47)]).features[0], z.features[0]);
  const mask = layer([30, 44, 35, 48]), m = measureLayers(prepareLayer(z), prepareLayer(z), mask);
  near(m.beforeKm2, square(30, 45, 33, 47) + square(34, 45, 35, 46)); near(m.netKm2, 0);
});
test('пустое пересечение с окном является нулём в районе, а не пропущенным срезом', () => {
  const m = measureLayers(layer([30, 45, 32, 47]), layer([31, 45, 33, 47]), layer([34, 45, 35, 46]));
  for (const v of Object.values(m)) near(v, 0);
});
test('пересекающиеся районы и повторные ID блокируют конфигурацию', () => {
  const sectors = [{ id: 'one', label: 'Первый', bounds: [30, 45, 32, 47] }, { id: 'two', label: 'Второй', bounds: [31, 45, 33, 47] }];
  assert.throws(() => validateConfig({ ...config, sectors }), /пересекаются/);
  assert.throws(() => validateConfig({ ...config, sectors: [sectors[0], sectors[0]] }), /Некорректный район/);
  assert.throws(() => validateConfig({ ...config, sectors: [{ ...sectors[0], bounds: [32, 45, 30, 47] }] }), /границы/);
});
test('снятие в одном районе и добавление в другом сохраняются в полной сводке', () => {
  const sectors = prepareSectors({ sectors: [{ id: 'left', label: 'Левый', bounds: [30, 45, 31, 47] }, { id: 'right', label: 'Правый', bounds: [32, 45, 33, 47] }] });
  const a = layer([30, 45, 32, 47]), b = layer([31, 45, 33, 47]), total = measureLayers(a, b);
  const rows = measureSectors(a, b, total, sectors);
  assert.ok(rows[0].netKm2 < 0 && rows[1].netKm2 > 0);
  for (const k of ['addedKm2', 'removedKm2', 'netKm2']) near(rows.reduce((s, r) => s + r[k], 0), total[k]);
});
test('100 случайных пересечений трёх прямоугольников совпадают с аналитической формулой', () => {
  let seed = 6143; const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  const intersection = (...rects) => { const w = Math.max(...rects.map(r => r[0])), s = Math.max(...rects.map(r => r[1])), e = Math.min(...rects.map(r => r[2])), n = Math.min(...rects.map(r => r[3])); return e > w && n > s ? square(w, s, e, n) : 0; };
  for (let k = 0; k < 100; k++) {
    const latitude = -50 + random() * 100;
    const next = () => { const w = 20 + random() * 5, s = latitude + random() * 3; return [w, s, w + 1 + random() * 4, s + 1 + random() * 4]; };
    const a = next(), b = next(), mask = next(), m = measureLayers(layer(a), layer(b), layer(mask)), shared = intersection(a, b, mask);
    near(m.beforeKm2, intersection(a, mask), 1e-5); near(m.afterKm2, intersection(b, mask), 1e-5);
    near(m.addedKm2, intersection(b, mask) - shared, 1e-5); near(m.removedKm2, intersection(a, mask) - shared, 1e-5);
  }
});
test('месяц сохраняет все семь снятий, даже когда добавления в другом районе дают общий плюс', () => {
  const sectors = prepareSectors({ sectors: [{ id: 'lyman', label: 'Лиман', bounds: [30, 45, 31, 46] }, { id: 'other-front', label: 'Другой район', bounds: [35, 45, 36, 46] }] });
  const dates = ['2026-08-31', '2026-09-08', '2026-09-10', '2026-09-12', '2026-09-16', '2026-09-19', '2026-09-24', '2026-09-26'];
  const layers = dates.map((_, n) => prepareLayer({ type: 'FeatureCollection', features: [zones([rect(30, 45, 31 - n * .05, 46)]).features[0], zones([rect(35, 45, 35.1 + n * .1, 46)]).features[0]] }));
  const snapshots = layers.map((l, n) => ({ id: 's' + n, publishedAt: publishedAt(dates[n] + ' 12:00'), areaKm2: layerArea(l) }));
  const intervals = layers.slice(1).map((b, n) => {
    const measured = measureLayers(layers[n], b), rows = measureSectors(layers[n], b, measured, sectors);
    assert.ok(rows[0].removedKm2 > 0 && rows[0].netKm2 < 0 && rows[1].netKm2 > 0);
    return { fromId: snapshots[n].id, toId: snapshots[n + 1].id, fromAt: snapshots[n].publishedAt, toAt: snapshots[n + 1].publishedAt, status: 'ok', ...measured, sectors: rows };
  });
  const m = core.period({ snapshots, intervals }, '2026-08-31T21:00:00.000Z', '2026-09-30T20:59:59.999Z');
  assert.equal(m.updateCount, 7); assert.ok(m.netKm2 > 0 && m.sectors[0].netKm2 < 0);
  near(m.sectors[0].removedKm2, square(30.65, 45, 31, 46));
  near(m.sectors[0].netKm2, -m.sectors[0].removedKm2);
  assert.match(core.post(m, 'сентябрь'), /Лиман: −/);
});
test('наклонные границы сохраняют баланс при точном пересечении с маской', () => {
  const a = prepareLayer(zones([[[30, 45], [33, 45], [30, 48], [30, 45]]])), b = prepareLayer(zones([[[30, 46], [33, 46], [33, 48], [30, 46]]]));
  const mask = layer([30.5, 45.5, 32.5, 47.5]), m = measureLayers(a, b, mask);
  near(m.netKm2, m.afterKm2 - m.beforeKm2); assert.ok(m.addedKm2 > 0 && m.removedKm2 > 0);
});
test('полный ряд и календарные сводки воспроизводятся из каждого интервала', () => {
  const data = JSON.parse(fs.readFileSync('data/map-statistics.json', 'utf8'));
  assert.equal(core.validData(data), true);
  const broken = structuredClone(data); broken.intervals.pop(); assert.equal(core.validData(broken), false);
  assert.equal(core.summarize(broken, broken.snapshots[0].id, broken.snapshots.at(-1).id).status, 'unavailable');
});
