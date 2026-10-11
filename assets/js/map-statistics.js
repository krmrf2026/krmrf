(function () {
  'use strict';
  const root = document.getElementById('mapStatistics'), core = globalThis.KRMMapStatistics;
  if (!root || !core) return;
  const el = id => document.getElementById(id), period = el('mapStatsPeriod'), month = el('mapStatsMonth'), day = el('mapStatsDay');
  const post = el('mapStatsPost'), status = el('mapStatsStatus'), controls = [period, month, day];
  controls.forEach(c => { c.disabled = true; });
  let data;
  const message = text => { status.textContent = text; status.hidden = !text; };
  const render = () => {
    const selected = period.value === 'month' ? data.monthly.find(m => m.month === month.value)
      : period.value === 'day' ? core.daily(data, day.value) : data.periods.latest;
    el('mapStatsMonthControl').hidden = period.value !== 'month';
    el('mapStatsDayControl').hidden = period.value !== 'day';
    month.disabled = period.value !== 'month'; day.disabled = period.value !== 'day';
    el('mapStatsRange').textContent = core.range(selected);
    ['addedKm2', 'removedKm2', 'netKm2'].forEach((key, i) => { el(`mapStatsValue${i}`).textContent = core.area(selected.status === 'ok' ? selected[key] : null, i === 2); });
    const coverage = el('mapStatsCoverage'); coverage.textContent = core.notes(selected); coverage.hidden = !coverage.textContent;
    const rows = core.sectorRows(selected);
    el('mapStatsSectors').hidden = !rows.length;
    el('mapStatsSectorsBody').replaceChildren(...rows.map(row => {
      const tr = document.createElement('tr'), th = document.createElement('th');
      tr.dataset.sector = row.id; th.scope = 'row'; th.textContent = row.label; tr.append(th);
      ['addedKm2', 'removedKm2', 'netKm2'].forEach((key, i) => {
        const td = document.createElement('td'); td.dataset.label = ['Добавлено', 'Исключено', 'Изменение'][i];
        td.textContent = core.area(row[key], i === 2).replace(' км²', ''); tr.append(td);
      });
      return tr;
    }));
    const label = period.value === 'month' ? `обновления за ${core.monthName(month.value)}`
      : period.value === 'day' ? `обновления за ${core.shortDate(day.value + 'T12:00:00Z')}` : 'последнее обновление';
    post.value = core.post(selected, label); message('');
  };
  controls.forEach(c => c.addEventListener('change', render));
  el('mapStatsCopy').addEventListener('click', async () => {
    const text = post.value;
    try {
      if (!navigator.clipboard?.writeText) throw new Error();
      await navigator.clipboard.writeText(text); message('Текст скопирован.');
    } catch {
      el('mapStatsPostPreview').open = true; post.focus(); post.select(); post.setSelectionRange(0, post.value.length);
      message('Текст выделен — скопируйте его вручную.');
    }
  });
  fetch('/data/map-statistics.json?v=' + root.dataset.statisticsKey, { signal: AbortSignal.timeout(12000) }).then(response => {
    if (!response.ok) throw new Error(); return response.json();
  }).then(payload => {
    if (payload.current !== root.dataset.current || payload.fingerprint !== root.dataset.statisticsKey || !core.validData(payload)) throw new Error();
    data = payload; period.disabled = false; render();
  }).catch(() => { controls.forEach(c => { c.disabled = true; }); message('Выбор периода недоступен. Сохранённая сводка доступна для копирования.'); });
})();
