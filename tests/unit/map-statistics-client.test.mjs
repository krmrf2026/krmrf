import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const payload = JSON.parse(fs.readFileSync('data/map-statistics.json', 'utf8'));
const coreScript = fs.readFileSync('assets/js/map-statistics-core.js', 'utf8');
const clientScript = fs.readFileSync('assets/js/map-statistics.js', 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
class Element {
  constructor(value = '') { this.value = value; this.textContent = ''; this.children = []; this.events = new Map(); this.disabled = false; this.hidden = false; this.open = false; this.dataset = {}; }
  addEventListener(name, listener) { this.events.set(name, listener); }
  async fire(name) { await this.events.get(name)?.(); }
  focus() { this.focused = true; }
  select() { this.selected = true; }
  setSelectionRange(start, end) { this.selection = [start, end]; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
}
async function harness({ ok = true, mismatch = false, malformed = false, clipboard = null, pending = false, corrupt = null } = {}) {
  const ids = ['mapStatistics','mapStatsPeriod','mapStatsMonth','mapStatsDay','mapStatsDayControl','mapStatsMonthControl','mapStatsPost','mapStatsPostPreview','mapStatsStatus','mapStatsRange','mapStatsValue0','mapStatsValue1','mapStatsValue2','mapStatsCoverage','mapStatsCopy','mapStatsDaily','mapStatsSectors','mapStatsSectorsBody'];
  const els = Object.fromEntries(ids.map(id => [id, new Element()]));
  els.mapStatistics.dataset = { current: payload.current, statisticsKey: payload.fingerprint };
  els.mapStatsPeriod.value = 'latest'; els.mapStatsMonth.value = payload.monthly.at(-1).month;
  els.mapStatsDay.value = payload.daily.filter(d => d.status !== 'no_snapshot').at(-1).date;
  els.mapStatsPost.value = 'Проверенный статичный текст'; els.mapStatsStatus.hidden = true;
  for (let i = 0; i < 3; i++) els['mapStatsValue' + i].textContent = 'Проверенная статичная сводка';
  els.mapStatsDaily.children = payload.daily.slice(-30).filter(d => d.status !== 'no_snapshot').reverse();
  let resolveFetch;
  const response = { ok, json: async () => { const data = { ...structuredClone(payload), ...(mismatch ? { fingerprint: 'different-version' } : {}), ...(malformed ? { daily: null } : {}) }; corrupt?.(data); return data; } };
  const sandbox = { Intl, Date, Number, Math, String, Object, Array, Set, Map, AbortSignal, navigator: { ...(clipboard ? { clipboard } : {}) },
    document: { getElementById: id => els[id], createElement: () => new Element() },
    fetch: async url => { sandbox.requestUrl = url; return pending ? await new Promise(resolve => { resolveFetch = resolve; }) : response; } };
  vm.runInNewContext(coreScript, sandbox); vm.runInNewContext(clientScript, sandbox); await tick(); await tick();
  return { els, core: sandbox.KRMMapStatistics, requestUrl: sandbox.requestUrl, settle: async () => { resolveFetch(response); await tick(); await tick(); } };
}
test('клиент: выбор месяца меняет числа и тот же текст для канала', async () => {
  const { els, core, requestUrl } = await harness();
  assert.equal(els.mapStatsPeriod.disabled, false); assert.match(requestUrl, new RegExp(payload.fingerprint));
  assert.equal(els.mapStatsMonthControl.hidden, true); assert.equal(els.mapStatsDayControl.hidden, true);
  assert.equal(els.mapStatsValue2.textContent, core.area(payload.periods.latest.netKm2, true));
  els.mapStatsPeriod.value = 'month'; await els.mapStatsPeriod.fire('change');
  assert.equal(els.mapStatsMonth.disabled, false); assert.equal(els.mapStatsDay.disabled, true); assert.equal(els.mapStatsMonthControl.hidden, false);
  assert.equal(els.mapStatsValue2.textContent, core.area(payload.periods.month.netKm2, true));
  assert.equal(els.mapStatsPost.value, core.post(payload.periods.month, 'обновления за ' + core.monthName(els.mapStatsMonth.value)));
  if (payload.periods.month.crossesMonthBoundary) assert.match(els.mapStatsPost.value, /разделить его по месяцам нельзя/);
});
test('клиент: день публикации согласован с календарными числами, исходный день не получает ноль', async () => {
  const { els, core } = await harness();
  els.mapStatsPeriod.value = 'day'; await els.mapStatsPeriod.fire('change');
  const d = payload.daily.find(d => d.date === els.mapStatsDay.value);
  assert.equal(els.mapStatsDayControl.hidden, false); assert.equal(els.mapStatsMonthControl.hidden, true); assert.equal(els.mapStatsDay.disabled, false);
  assert.equal(els.mapStatsValue2.textContent, core.area(d.netKm2, true));
  const baseline = payload.daily.find(d => d.status === 'baseline');
  if (baseline) {
    els.mapStatsDay.value = baseline.date; await els.mapStatsDay.fire('change');
    assert.equal(els.mapStatsValue2.textContent, 'нет данных'); assert.match(els.mapStatsPost.value, /Недостаточно/); assert.doesNotMatch(els.mapStatsPost.value, /0,0 км²/);
  }
});
test('клиент: копирование работает без открытия текста и не меняет его', async () => {
  let copied;
  const { els } = await harness({ clipboard: { writeText: async text => { copied = text; } } });
  await els.mapStatsCopy.fire('click'); assert.equal(copied, els.mapStatsPost.value); assert.equal(els.mapStatsPostPreview.open, false);
  assert.equal(els.mapStatsStatus.hidden, false); assert.equal(els.mapStatsStatus.textContent, 'Текст скопирован.');
});
test('клиент: отказ буфера открывает блок и выделяет весь текст для ручного копирования', async () => {
  const { els } = await harness({ clipboard: { writeText: async () => { throw new Error('denied'); } } });
  await els.mapStatsCopy.fire('click'); assert.equal(els.mapStatsPostPreview.open, true); assert.equal(els.mapStatsPost.focused, true);
  assert.equal(els.mapStatsPost.selected, true); assert.deepEqual(els.mapStatsPost.selection, [0, els.mapStatsPost.value.length]); assert.match(els.mapStatsStatus.textContent, /вручную/);
});
test('клиент: HTTP-ошибка сохраняет статичные числа и доступность копирования', async () => {
  const { els } = await harness({ ok: false });
  assert.equal(els.mapStatsPeriod.disabled, true); assert.equal(els.mapStatsValue2.textContent, 'Проверенная статичная сводка'); assert.match(els.mapStatsStatus.textContent, /Сохранённая сводка/);
  await els.mapStatsCopy.fire('click'); assert.equal(els.mapStatsPostPreview.open, true); assert.equal(els.mapStatsPost.selected, true); assert.equal(els.mapStatsPost.value, 'Проверенный статичный текст');
});
for (const [title, options] of [['другой версии', { mismatch: true }], ['неполной структуры', { malformed: true }]]) {
  test('клиент: данные ' + title + ' не заменяют сводку страницы', async () => {
    const { els } = await harness(options);
    assert.equal(els.mapStatsPeriod.disabled, true); assert.equal(els.mapStatsValue2.textContent, 'Проверенная статичная сводка'); assert.equal(els.mapStatsPost.value, 'Проверенный статичный текст'); assert.match(els.mapStatsStatus.textContent, /недоступен/);
  });
}
test('клиент: копирование до загрузки JSON использует сохранённый текст; будущие дни не добавляются', async () => {
  let copied; const { els, settle } = await harness({ pending: true, clipboard: { writeText: async text => { copied = text; } } });
  const rows = JSON.stringify(els.mapStatsDaily.children);
  assert.equal(els.mapStatsPeriod.disabled, true); await els.mapStatsCopy.fire('click'); assert.equal(copied, 'Проверенный статичный текст');
  await settle(); assert.equal(els.mapStatsPeriod.disabled, false); assert.equal(JSON.stringify(els.mapStatsDaily.children), rows);
});

test('клиент: сентябрь показывает снятия у Лимана и добавления на других участках', async () => {
  const september = payload.monthly.find(m => m.month === '2026-09');
  if (!september?.sectors?.length) return;
  const { els, core } = await harness();
  els.mapStatsPeriod.value = 'month'; els.mapStatsMonth.value = '2026-09'; await els.mapStatsPeriod.fire('change');
  assert.equal(els.mapStatsSectors.hidden, false);
  const expected = core.sectorRows(september);
  assert.equal(els.mapStatsSectorsBody.children.length, expected.length);
  for (const [n, r] of expected.entries()) {
    const row = els.mapStatsSectorsBody.children[n];
    assert.equal(row.dataset.sector, r.id);
    assert.equal(row.children[3].textContent, core.area(r.netKm2, true).replace(' км²', ''));
    assert.match(els.mapStatsPost.value, new RegExp(r.label));
  }
  assert.equal(els.mapStatsValue2.textContent, core.area(september.netKm2, true));
});

for (const [label, corrupt] of [
  ['потерянное обновление', d => d.intervals.splice(1, 1)],
  ['нарушенный порядок', d => [d.intervals[0], d.intervals[1]] = [d.intervals[1], d.intervals[0]]],
  ['обнулённые снятия месяца', d => d.monthly.find(m => m.status === 'ok').removedKm2 += 1],
  ['подмена регионального знака', d => { const i = d.intervals.find(i => i.status === 'ok'); i.sectors[0].netKm2 += 1; }],
  ['потерянный день обновления', d => d.daily.find(d => d.status === 'updated').status = 'no_snapshot'],
]) {
  test('клиент: ' + label + ' при прежнем ключе не заменяет проверенную сводку', async () => {
    const { els } = await harness({ corrupt });
    assert.equal(els.mapStatsPeriod.disabled, true);
    assert.equal(els.mapStatsValue2.textContent, 'Проверенная статичная сводка');
    assert.equal(els.mapStatsPost.value, 'Проверенный статичный текст');
    assert.match(els.mapStatsStatus.textContent, /Сохранённая сводка/);
  });
}
test('день и месяц не зависят от строкового формата дат мобильного браузера', () => {
  const AlternateFormat = class extends Intl.DateTimeFormat { get format() { return () => '10/01/2026'; } };
  const sandbox = { Intl: { DateTimeFormat: AlternateFormat }, Date, Number, Math, String, Object, Array, Set, Map };
  vm.runInNewContext(coreScript, sandbox);
  assert.equal(sandbox.KRMMapStatistics.day('2026-09-30T21:00:00.000Z'), '2026-10-01');
  assert.equal(sandbox.KRMMapStatistics.day('2026-09-30T20:59:59.999Z'), '2026-09-30');
});
