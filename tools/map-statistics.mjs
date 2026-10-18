import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { prepareLayer, layerArea, measureLayers, AREA_METHOD, EARTH_RADIUS } from './lib/map-area.mjs';
import { core, publishedAt, safeSnapshot, geometryHash, writeJson, validateConfig } from './lib/map-statistics.mjs';
import { prepareSectors, measureSectors } from './lib/map-sectors.mjs';
import {loadProtocol,publicationRecords,buildUtm} from './lib/utm.mjs';
const ROOT = process.cwd(), read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const protocol=loadProtocol(ROOT), records=publicationRecords(ROOT);
const channelLinks=Object.entries(protocol.channels).map(([channel,v])=>({label:v.label||channel,url:buildUtm(protocol,{rawUrl:'/map/',source:channel},records)}));
const config = validateConfig(JSON.parse(read('data/map-statistics-config.json')));
const sectorLayers = prepareSectors(config);
const journal = JSON.parse(read('data/map-archive/journal.json')), current = JSON.parse(read('data/zones.geojson'));
if (journal.schema !== 'krmrf-map-archive-v1' || journal.current !== current.updated || !Array.isArray(journal.versions) || !journal.versions.length) throw new Error('Архив не согласован с текущей картой. Выполните map:history.');
const layers = [], snapshots = [], kinds = new Set(['unknown', 'control', 'cartographic', 'mixed', 'review']);
for (const item of journal.versions) {
  const raw = read(safeSnapshot(item.snapshot)), zones = JSON.parse(raw);
  if (crypto.createHash('sha256').update(raw).digest('hex') !== item.sha256 || geometryHash(zones) !== item.geometrySha256) throw new Error(`Повреждён срез ${item.updated}.`);
  if (publishedAt(zones.updated, config.legacyOffset) !== item.publishedAt || !kinds.has(item.kind)) throw new Error(`Некорректная дата/тип среза ${item.updated}.`);
  const layer = prepareLayer(zones), areaKm2 = layerArea(layer);
  if (!Number.isFinite(areaKm2) || areaKm2 <= 0) throw new Error(`Срез ${item.updated}: нет корректной площади российского слоя.`);
  if (snapshots.length && snapshots.at(-1).publishedAt >= item.publishedAt) throw new Error('Даты архива не строго возрастают.');
  layers.push(layer); const { sourceRefs, featureCount, ...record } = item;
  snapshots.push({ ...record, areaKm2, methodVersion: AREA_METHOD });
}
if (new Set(snapshots.map(s => s.id)).size !== snapshots.length) throw new Error('Повторный ID среза.');
if (snapshots.at(-1).geometrySha256 !== geometryHash(current) || snapshots.at(-1).publishedAt !== publishedAt(current.updated, config.legacyOffset) || snapshots.at(-1).scopeVersion !== (current.statistics?.scopeVersion || config.scopeVersion)) throw new Error('Текущая геометрия не совпадает с последним архивным срезом. Выполните npm run build и исправьте время изменения.');
const skippedRevisions = journal.skippedRevisions || [];
if (!Array.isArray(skippedRevisions)) throw new Error('Повреждён журнал исключений истории.');
const ambiguousVersions = journal.ambiguousVersions ?? [];
if (!Array.isArray(ambiguousVersions)) throw new Error('Повреждён архив спорных версий.');
const variantKeys = new Set();
for (const item of ambiguousVersions) {
  const raw = read(safeSnapshot(item.snapshot)), zones = JSON.parse(raw);
  const key = JSON.stringify([item.publishedAt, item.geometrySha256, item.scopeVersion]);
  if (variantKeys.has(key) || crypto.createHash('sha256').update(raw).digest('hex') !== item.sha256 || geometryHash(zones) !== item.geometrySha256
      || publishedAt(zones.updated, config.legacyOffset) !== item.publishedAt || publishedAt(item.updated, config.legacyOffset) !== item.publishedAt
      || typeof item.scopeVersion !== 'string' || !item.scopeVersion.trim() || !kinds.has(item.kind)
      || item.id !== `map-${crypto.createHash('sha256').update(item.publishedAt).digest('hex').slice(0, 20)}` || item.featureCount !== zones.features?.length
      || (zones.statistics?.scopeVersion != null && zones.statistics.scopeVersion !== item.scopeVersion)) throw new Error(`Повреждён спорный срез ${item.updated}.`);
  const area = layerArea(prepareLayer(zones));
  if (!Number.isFinite(area) || area <= 0) throw new Error(`Спорный срез ${item.updated}: нет корректной площади российского слоя.`);
  variantKeys.add(key);
}
const knownDates = new Set(snapshots.map(s => s.publishedAt));
const ambiguousDates = [...new Set(ambiguousVersions.filter(s => !knownDates.has(s.publishedAt)).map(s => s.publishedAt))].sort();
const omittedDates = [...new Set([...ambiguousDates, ...skippedRevisions.filter(s => ['unusable', 'ambiguous'].includes(s.kind) && s.publishedAt && !knownDates.has(s.publishedAt)).map(s => s.publishedAt)])].sort();
const tolerance = (a, b) => Math.max(1e-6, Math.max(a, b) * 1e-10);
const intervals = snapshots.slice(1).map((to, i) => {
  const from = snapshots[i], base = { fromId: from.id, toId: to.id, fromAt: from.publishedAt, toAt: to.publishedAt, kind: to.kind,
    omittedSnapshotCount: omittedDates.filter(at => at > from.publishedAt && at < to.publishedAt).length };
  if (from.scopeVersion !== to.scopeVersion) return { ...base, status: 'scope_changed', addedKm2: null, removedKm2: null, netKm2: null };
  const measured = measureLayers(layers[i], layers[i + 1]);
  if (Math.abs(measured.beforeKm2 - from.areaKm2) > tolerance(measured.beforeKm2, from.areaKm2) || Math.abs(measured.afterKm2 - to.areaKm2) > tolerance(measured.afterKm2, to.areaKm2)) throw new Error(`Не сошлась площадь срезов ${from.updated} — ${to.updated}.`);
  const netKm2 = to.areaKm2 - from.areaKm2;
  if (Math.abs(measured.addedKm2 - measured.removedKm2 - netKm2) > tolerance(to.areaKm2, from.areaKm2)) throw new Error('Не сошёлся баланс добавлений и исключений.');
  return { ...base, status: 'ok', addedKm2: measured.addedKm2, removedKm2: measured.removedKm2, netKm2,
    sectors: measureSectors(layers[i], layers[i + 1], measured, sectorLayers) };
});
const result = { schema: 'krmrf-map-statistics-v1', current: current.updated, asOf: snapshots.at(-1).publishedAt,
  method: { id: AREA_METHOD, earthRadiusM: EARTH_RADIUS, coordinateResolutionDegrees: 1e-10, timezone: config.timezone, legacyOffset: config.legacyOffset,
    scopeVersion: config.scopeVersion, scopeLabel: config.scopeLabel, displayDecimals: 1, timeBasis: 'publication', historyCompleteness: 'available-snapshots-only' },
  warnings: journal.warnings || [], history: { gitMode: journal.gitMode || 'not-established', skippedRevisions, ambiguousVersions },
  sectorDefinitions: config.sectors ?? [], snapshots, intervals, periods: {}, daily: [], monthly: [] };
const last = snapshots.at(-1), first = snapshots[0], dayISO = d => `${d}T00:00:00+03:00`, asISO = s => new Date(s).toISOString();
result.periods.latest = core.summarize(result, snapshots.at(-2)?.id, last.id);
result.periods.all = core.summarize(result, first.id, last.id);
for (const count of [7, 30]) result.periods[`${count}d`] = core.period(result, new Date(new Date(last.publishedAt).getTime() - count * 86400000).toISOString(), last.publishedAt);
const calendarStart = [...omittedDates.filter(at => at <= last.publishedAt), first.publishedAt].sort()[0];
let day = core.day(calendarStart), endDay = core.day(last.publishedAt);
for (let guard = 0; day <= endDay; guard++) {
  if (guard > 20000) throw new Error('Слишком длинный календарный ряд.');
  const edits = intervals.filter(i => core.day(i.toAt) === day), states = snapshots.filter(s => core.day(s.publishedAt) === day);
  const comparable = edits.length && edits.every(i => i.status === 'ok');
  const omittedSnapshotCount = omittedDates.filter(at => core.day(at) === day).length;
  const ambiguousSnapshotCount = ambiguousDates.filter(at => core.day(at) === day).length;
  result.daily.push({ date: day, status: edits.length ? (comparable ? 'updated' : 'unavailable') : omittedSnapshotCount ? 'unavailable' : states.length ? 'baseline' : 'no_snapshot', omittedSnapshotCount, ambiguousSnapshotCount,
    updateCount: edits.length, fromAt: edits[0]?.fromAt || null, toAt: edits.at(-1)?.toAt || null,
    addedKm2: comparable ? edits.reduce((s, i) => s + i.addedKm2, 0) : null,
    removedKm2: comparable ? edits.reduce((s, i) => s + i.removedKm2, 0) : null,
    netKm2: comparable ? edits.reduce((s, i) => s + i.netKm2, 0) : null,
    sectors: comparable ? core.summarize(result, edits[0].fromId, edits.at(-1).toId).sectors : [] });
  day = new Date(new Date(`${day}T12:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);
}
let month = core.day(calendarStart).slice(0, 7), lastMonth = endDay.slice(0, 7);
while (month <= lastMonth) {
  const [y, m] = month.split('-').map(Number), next = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}`;
  const start = asISO(dayISO(`${month}-01`)), end = new Date(new Date(dayISO(`${next}-01`)).getTime() - 1).toISOString();
  const summary = core.period(result, start, end < last.publishedAt ? end : last.publishedAt), edits = intervals.filter(i => core.day(i.toAt).startsWith(month));
  result.monthly.push({ month, ...summary, crossesMonthBoundary: edits.some(i => !core.day(i.fromAt).startsWith(month)),
    unpublishedDays: result.daily.filter(d => d.date.startsWith(month) && d.status === 'no_snapshot').length,
    unavailableDays: result.daily.filter(d => d.date.startsWith(month) && (d.status === 'unavailable' || d.omittedSnapshotCount)).length, openMonth: month === lastMonth }); month = next;
}
result.periods.month = result.monthly.at(-1);
if (!core.validData(result)) throw new Error('Статистика не прошла проверку полного ряда, сводок и районов.');
const esc = s => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const statisticsKey = crypto.createHash('sha256').update(JSON.stringify(result)).digest('hex').slice(0, 16);
result.fingerprint = statisticsKey;
const summary = result.periods.latest;
const titles = ['Добавлено', 'Исключено', 'Изменение'];
const metrics = [summary.addedKm2, summary.removedKm2, summary.netKm2];
const days = result.daily.slice(-30).filter(d => d.status !== 'no_snapshot').reverse();
const allDays = result.daily.filter(d => d.status !== 'no_snapshot').reverse();
const months = result.monthly.filter(m => m.status === 'ok' || m.unavailableDays || m.month === lastMonth).reverse();
const options = [['latest', 'Последнее обновление'], ['day', 'За день'], ['month', 'За месяц']].map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
const numbers = item => ['addedKm2', 'removedKm2', 'netKm2'].map((key, i) => `<td data-label="${titles[i]}">${Number.isFinite(item[key]) ? esc(core.area(item[key], i === 2).replace(' км²', '')) : '—'}</td>`).join('');
const sectorRows = core.sectorRows(summary);
const sectorsHtml = sectorRows.map(r => `<tr data-sector="${esc(r.id)}"><th scope="row">${esc(r.label)}</th>${numbers(r)}</tr>`).join('');
const row = d => `<tr data-date="${d.date}"><th scope="row">${esc(core.shortDate(d.date + 'T12:00:00Z'))}<small>${d.status === 'updated' ? esc(core.range({ from: { publishedAt: d.fromAt }, to: { publishedAt: d.toAt } })) : 'Нет данных для сравнения'}</small></th>${numbers(d)}</tr>`;
const monthlyRow = m => `<tr data-month="${m.month}"><th scope="row">${esc(core.monthName(m.month))}<small>${m.status !== 'ok' ? 'Нет данных для сравнения' : m.partial ? 'Неполный период' : m.crossesMonthBoundary ? 'Начало сравнения — в предыдущем месяце' : ''}${m.unavailableDays ? '; есть пропуски данных' : ''}</small></th>${numbers(m.status === 'ok' ? m : {})}</tr>`;
const header = `<tr><th scope="col">Публикация карты</th>${titles.map(t => `<th scope="col">${t}</th>`).join('')}</tr>`;
const coverage = core.notes(summary);
const html = `<section class="map-statistics" id="mapStatistics" data-current="${esc(result.current)}" data-statistics-key="${statisticsKey}" aria-labelledby="mapStatisticsHeading">
<h2 id="mapStatisticsHeading">Статистика карты</h2><p class="map-statistics__note">Изменения площади зоны РФ на опубликованной карте.</p>
<div class="map-statistics__controls"><label for="mapStatsPeriod">Период<select id="mapStatsPeriod" disabled>${options}</select></label><label for="mapStatsDay" id="mapStatsDayControl" hidden>День<select id="mapStatsDay" disabled>${allDays.map((d, i) => `<option value="${d.date}"${i === 0 ? ' selected' : ''}>${esc(core.shortDate(d.date + 'T12:00:00Z'))}</option>`).join('')}</select></label><label for="mapStatsMonth" id="mapStatsMonthControl" hidden>Месяц<select id="mapStatsMonth" disabled>${months.map(m => `<option value="${m.month}"${m.month === lastMonth ? ' selected' : ''}>${esc(core.monthName(m.month))}</option>`).join('')}</select></label></div>
<p id="mapStatsRange">${esc(core.range(summary))}</p>
<dl class="map-statistics__metrics">${metrics.map((n, i) => `<div><dt>${titles[i]}</dt><dd id="mapStatsValue${i}">${esc(core.area(n, i === 2))}</dd></div>`).join('')}</dl>
<p id="mapStatsCoverage"${coverage ? '' : ' hidden'}>${esc(coverage)}</p>
<div class="map-statistics__controls"><label for="mapStatsChannel">Канал публикации<select id="mapStatsChannel" disabled>${channelLinks.map((c,i)=>`<option value="${esc(c.url)}"${i===0?' selected':''}>${esc(c.label)}</option>`).join('')}</select></label></div>
<button type="button" class="button button--primary" id="mapStatsCopy">Скопировать для канала</button><p role="status" id="mapStatsStatus" hidden></p>
<details id="mapStatsSectors"${sectorRows.length ? '' : ' hidden'}><summary>По районам</summary><div class="map-statistics__table" tabindex="0" role="region" aria-label="Изменения по районам"><table role="table"><caption>Выделенные районы карты · границы условные · км²</caption><thead><tr><th scope="col">Район</th>${titles.map(t => `<th scope="col">${t}</th>`).join('')}</tr></thead><tbody id="mapStatsSectorsBody">${sectorsHtml}</tbody></table></div></details>
<details id="mapStatsPostPreview"><summary>Текст для канала</summary><textarea id="mapStatsPost" aria-label="Текст для канала" rows="8" readonly>${esc(core.post(summary, 'последнее обновление', channelLinks[0].url))}</textarea></details>
<details id="mapStatsDays"><summary>По дням</summary><div class="map-statistics__table" tabindex="0" role="region" aria-label="Статистика по дням"><table role="table"><caption>Дни обновлений за последние 30 дней карты · км²</caption><thead>${header}</thead><tbody id="mapStatsDaily">${days.map(row).join('')}</tbody></table></div></details>
<details id="mapStatsMonths"><summary>По месяцам</summary><div class="map-statistics__table" tabindex="0" role="region" aria-label="Статистика по месяцам"><table role="table"><caption>По датам публикации обновлений · км²</caption><thead>${header}</thead><tbody>${months.map(monthlyRow).join('')}</tbody></table></div></details>
</section>`;
const csv = '\uFEFF' + ['from_msk,to_msk,status,kind,added_km2,removed_km2,net_km2,from_snapshot,to_snapshot,omitted_snapshot_count', ...intervals.map(i => [core.date(i.fromAt), core.date(i.toAt), i.status, i.kind, i.addedKm2 ?? '', i.removedKm2 ?? '', i.netKm2 ?? '', snapshots.find(s => s.id === i.fromId).snapshot, snapshots.find(s => s.id === i.toId).snapshot, i.omittedSnapshotCount].map(v => `"${String(v).replaceAll('"', '""')}"`).join(','))].join('\n') + '\n';
if (process.argv.includes('--check')) {
  if (read('data/map-statistics.json') !== `${JSON.stringify(result, null, 2)}\n` || read('data/map-statistics.csv') !== csv) throw new Error('Статистика устарела/изменена; выполните npm run build.');
  if (!read('map/index.html').includes(html)) throw new Error('Статичный блок статистики не согласован с исходными данными.');
  console.log('Статистика воспроизведена: контуры, баланс площадей, календарь и текст страницы согласованы.');
} else {
  const page = read('map/index.html'), marker = /<!-- KRM MAP STATISTICS START -->[\s\S]*?<!-- KRM MAP STATISTICS END -->/;
  if (!marker.test(page)) throw new Error('Не найдена точка вставки статистики на странице карты.');
  writeJson(ROOT, 'data/map-statistics.json', result); fs.writeFileSync(path.join(ROOT, 'data/map-statistics.csv'), csv);
  fs.writeFileSync(path.join(ROOT, 'map/index.html'), page.replace(marker, () => `<!-- KRM MAP STATISTICS START -->\n${html}\n<!-- KRM MAP STATISTICS END -->`));
  console.log(`Статистика: ${snapshots.length} срезов, ${intervals.length} сравнений, ${result.monthly.length} месяцев.`);
}
