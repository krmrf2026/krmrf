(function (root) {
  'use strict';
  const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', calendar: 'gregory', numberingSystem: 'latn', year: 'numeric', month: '2-digit', day: '2-digit' });
  const day = value => {
    const parts = dayFormat.formatToParts(new Date(value));
    return ['year', 'month', 'day'].map(type => parts.find(p => p.type === type).value).join('-');
  };
  const date = value => new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  const shortDate = value => new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
  const monthName = value => new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', month: 'long', year: 'numeric' }).format(new Date(value + '-01T12:00:00Z'));
  const range = summary => {
    if (!summary.from || !summary.to) return 'Недостаточно данных для сравнения.';
    const { publishedAt: from } = summary.from, { publishedAt: to } = summary.to;
    const time = value => new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
    return (day(from) === day(to) ? `${shortDate(from)} · ${time(from)}–${time(to)}` : `${shortDate(from)} → ${shortDate(to)}`) + ' · МСК';
  };
  const area = (value, signed) => {
    if (!Number.isFinite(value)) return 'нет данных';
    const abs = Math.abs(value), prefix = signed && value > 0 ? '+' : value < 0 ? '−' : '';
    return prefix + (abs > 1e-7 && abs < 0.05 ? '<0,1' : abs.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })) + ' км²';
  };
  const keys = ['addedKm2', 'removedKm2', 'netKm2'];
  const sum = values => {
    let total = 0, correction = 0;
    for (const value of values) { const next = value - correction, updated = total + next; correction = (updated - total) - next; total = updated; }
    return total;
  };
  const close = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Math.max(1e-6, Math.max(Math.abs(a), Math.abs(b)) * 1e-10);
  const validNumbers = row => row && keys.every(k => Number.isFinite(row[k])) && row.addedKm2 >= 0 && row.removedKm2 >= 0 && close(row.addedKm2 - row.removedKm2, row.netKm2);
  function aggregateSectors(intervals) {
    const first = intervals[0]?.sectors || [];
    if (intervals.some(i => (i.sectors || []).length !== first.length)) throw new Error('Неполная разбивка по районам.');
    return first.map((row, index) => {
      const parts = intervals.map(i => i.sectors[index]);
      if (parts.some(p => p.id !== row.id || p.label !== row.label || !validNumbers(p))) throw new Error('Несогласованная разбивка по районам.');
      return { id: row.id, label: row.label, ...Object.fromEntries(keys.map(k => [k, sum(parts.map(p => p[k]))])) };
    });
  }
  function sectorRows(summary) {
    const rows = summary?.status === 'ok' && Array.isArray(summary.sectors) ? summary.sectors : [];
    if (!rows.some(r => r.id !== 'other' && (r.addedKm2 > 1e-7 || r.removedKm2 > 1e-7))) return [];
    return rows.filter(r => r.addedKm2 > 1e-7 || r.removedKm2 > 1e-7);
  }
  function summarize(data, fromId, toId) {
    const start = data.snapshots.findIndex(s => s.id === fromId), end = data.snapshots.findIndex(s => s.id === toId);
    if (start < 0 || end <= start) return { status: 'insufficient', reason: 'Нужны два разных среза в хронологическом порядке.' };
    const from = data.snapshots[start], to = data.snapshots[end], intervals = data.intervals.slice(start, end);
    if (intervals.some(i => i.status !== 'ok')) return { status: 'unavailable', reason: 'В интервале есть несопоставимые или недоступные данные.', from, to };
    if (intervals.length !== end - start || intervals.some((i, n) => (i.fromId != null && i.fromId !== data.snapshots[start + n].id)
        || (i.toId != null && i.toId !== data.snapshots[start + n + 1].id)
        || !Number.isFinite(i.addedKm2) || i.addedKm2 < 0 || !Number.isFinite(i.removedKm2) || i.removedKm2 < 0)) return { status: 'unavailable', reason: 'Неполный или повреждённый ряд обновлений.', from, to };
    let sectors;
    try { sectors = aggregateSectors(intervals); } catch { return { status: 'unavailable', reason: 'Несогласованные районы карты.', from, to }; }
    return { status: 'ok', from, to, addedKm2: sum(intervals.map(i => i.addedKm2)), removedKm2: sum(intervals.map(i => i.removedKm2)), sectors,
      netKm2: to.areaKm2 - from.areaKm2, updateCount: intervals.length,
      crossesDays: intervals.some(i => day(i.fromAt) !== day(i.toAt)), corrections: intervals.filter(i => i.kind === 'cartographic').length,
      omittedSnapshotCount: intervals.reduce((sum, i) => sum + (i.omittedSnapshotCount || 0), 0) };
  }
  function period(data, startAt, endAt) {
    const before = data.snapshots.filter(s => s.publishedAt < startAt).at(-1);
    const after = data.snapshots.filter(s => s.publishedAt <= endAt).at(-1);
    const firstAvailable = data.snapshots.find(s => s.publishedAt >= startAt && s.publishedAt <= endAt);
    const result = summarize(data, (before || firstAvailable)?.id, after?.id);
    return { ...result, requestedStartAt: startAt, requestedEndAt: endAt, partial: !before, baselinePrecedesPeriod: Boolean(before && before.publishedAt < startAt) };
  }
  function post(summary, label) {
    if (summary.status !== 'ok') return `Недостаточно сопоставимых срезов для числовой сводки. Это не нулевое изменение.${summary.unavailableDays ? ' Есть пропуски данных.' : ''}`;
    const lines = [`Карта KRM РФ: ${label || 'последнее обновление'}.`, range(summary), '',
      `Добавлено: ${area(summary.addedKm2)}.`, `Исключено: ${area(summary.removedKm2)}.`,
      `Изменение площади зоны РФ: ${area(summary.netKm2, true)}.`, ''];
    const sectors = sectorRows(summary);
    if (sectors.length) lines.push('По выделенным районам карты (границы условные):', ...sectors.map(r => `${r.label}: ${area(r.netKm2, true)}.`), '');
    if (notes(summary)) lines.push(notes(summary));
    if (summary.updateCount > 1) lines.push('Добавления и исключения суммируются по обновлениям; один участок может учитываться повторно.');
    lines.push('По опубликованным контурам карты. Изменение контроля ВСУ по ним не определяется.', '', 'https://krmrf.ru/map/');
    return lines.join('\n');
  }
  function daily(data, value) {
    const entry = data.daily.find(d => d.date === value);
    const edits = data.intervals.filter(i => day(i.toAt) === value);
    if (!edits.length) return { status: 'insufficient' };
    const summary = summarize(data, edits[0].fromId, edits.at(-1).toId);
    return { ...summary, omittedSnapshotCount: Math.max(summary.omittedSnapshotCount || 0, entry?.omittedSnapshotCount || 0) };
  }
  function notes(summary) {
    const lines = [];
    if (summary.partial) lines.push('Доступна только часть периода.');
    if (summary.crossesMonthBoundary) lines.push('Первое сравнение начинается в предыдущем месяце; разделить его по месяцам нельзя.');
    else if (summary.baselinePrecedesPeriod) lines.push('Начальный срез опубликован до начала выбранного периода.');
    if (summary.omittedSnapshotCount || summary.unavailableDays) lines.push('Есть пропуски данных; промежуточные изменения восстановлены не полностью.');
    if (summary.corrections) lines.push('Включены правки контура.');
    return lines.join(' ');
  }
  function validData(data) {
    try {
      if (data?.schema !== 'krmrf-map-statistics-v1' || !Array.isArray(data.snapshots) || !data.snapshots.length
          || !Array.isArray(data.intervals) || data.intervals.length !== data.snapshots.length - 1
          || !Array.isArray(data.daily) || !data.daily.length || !Array.isArray(data.monthly) || !data.monthly.length
          || !Array.isArray(data.sectorDefinitions) || !data.periods) return false;
      const ids = new Set(), dates = new Set();
      const editsByDay = new Map();
      const iso = s => typeof s === 'string' && new Date(s).toISOString() === s;
      for (let n = 0; n < data.snapshots.length; n++) {
        const s = data.snapshots[n];
        if (typeof s.id !== 'string' || !s.id || ids.has(s.id) || !iso(s.publishedAt) || !Number.isFinite(s.areaKm2) || s.areaKm2 <= 0
            || (n && data.snapshots[n - 1].publishedAt >= s.publishedAt)) return false;
        ids.add(s.id);
      }
      const first = data.snapshots[0], last = data.snapshots.at(-1);
      if (data.asOf !== last.publishedAt || data.current !== last.updated) return false;
      const definitions = data.sectorDefinitions.concat(data.sectorDefinitions.length ? [{ id: 'other', label: 'Остальные участки' }] : []);
      if (new Set(definitions.map(r => r.id)).size !== definitions.length) return false;
      const sectorsMatch = (a, b) => Array.isArray(a) && a.length === b.length && a.every((r, n) => r.id === b[n].id && r.label === b[n].label && keys.every(k => close(r[k], b[n][k])));
      for (let n = 0; n < data.intervals.length; n++) {
        const i = data.intervals[n], a = data.snapshots[n], b = data.snapshots[n + 1];
        if (i.fromId !== a.id || i.toId !== b.id || i.fromAt !== a.publishedAt || i.toAt !== b.publishedAt
            || !Number.isInteger(i.omittedSnapshotCount) || i.omittedSnapshotCount < 0) return false;
        const date = day(i.toAt);
        if (!editsByDay.has(date)) editsByDay.set(date, []);
        editsByDay.get(date).push(i);
        if (i.status === 'scope_changed') {
          if (a.scopeVersion === b.scopeVersion || keys.some(k => i[k] !== null)) return false;
          continue;
        }
        if (i.status !== 'ok' || a.scopeVersion !== b.scopeVersion || !validNumbers(i) || !close(i.netKm2, b.areaKm2 - a.areaKm2)
            || !Array.isArray(i.sectors) || i.sectors.length !== definitions.length
            || i.sectors.some((r, k) => r.id !== definitions[k].id || r.label !== definitions[k].label || !validNumbers(r))) return false;
        if (definitions.length && keys.some(k => !close(sum(i.sectors.map(r => r[k])), i[k]))) return false;
      }
      const matches = (actual, expected) => {
        if (!actual || actual.status !== expected.status) return false;
        if (expected.status !== 'ok') return keys.every(k => !Number.isFinite(actual[k]));
        return actual.from?.id === expected.from.id && actual.to?.id === expected.to.id && actual.updateCount === expected.updateCount
          && keys.every(k => close(actual[k], expected[k])) && sectorsMatch(actual.sectors, expected.sectors);
      };
      if (!matches(data.periods.latest, summarize(data, data.snapshots.at(-2)?.id, last.id)) || !matches(data.periods.all, summarize(data, first.id, last.id))) return false;
      for (const count of [7, 30]) if (!matches(data.periods[`${count}d`], period(data, new Date(new Date(last.publishedAt).getTime() - count * 86400000).toISOString(), last.publishedAt))) return false;
      let previousDay;
      for (const d of data.daily) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date) || dates.has(d.date) || d.date > day(last.publishedAt)
            || !['updated', 'unavailable', 'baseline', 'no_snapshot'].includes(d.status)
            || (previousDay && new Date(new Date(previousDay + 'T12:00:00Z').getTime() + 86400000).toISOString().slice(0, 10) !== d.date)) return false;
        dates.add(d.date); previousDay = d.date;
        const edits = editsByDay.get(d.date) || [];
        if (d.updateCount !== edits.length) return false;
        if (d.status === 'updated') {
          const expected = summarize(data, edits[0]?.fromId, edits.at(-1)?.toId);
          if (expected.status !== 'ok' || keys.some(k => !close(d[k], expected[k])) || !sectorsMatch(d.sectors, expected.sectors)) return false;
        } else if (keys.some(k => d[k] !== null)) return false;
        if (edits.length && edits.every(i => i.status === 'ok') && d.status !== 'updated') return false;
      }
      if (previousDay !== day(last.publishedAt) || data.intervals.some(i => !dates.has(day(i.toAt)))) return false;
      let expectedMonth = data.daily[0].date.slice(0, 7);
      for (const m of data.monthly) {
        if (m.month !== expectedMonth) return false;
        const [y, n] = m.month.split('-').map(Number), next = `${n === 12 ? y + 1 : y}-${String(n === 12 ? 1 : n + 1).padStart(2, '0')}`;
        const start = new Date(`${m.month}-01T00:00:00+03:00`).toISOString();
        const end = new Date(new Date(`${next}-01T00:00:00+03:00`).getTime() - 1).toISOString();
        if (!matches(m, period(data, start, end < last.publishedAt ? end : last.publishedAt))) return false;
        expectedMonth = next;
      }
      if (data.monthly.at(-1).month !== day(last.publishedAt).slice(0, 7) || !matches(data.periods.month, data.monthly.at(-1))) return false;
      return true;
    } catch { return false; }
  }
  root.KRMMapStatistics = Object.freeze({ day, date, shortDate, monthName, range, area, summarize, period, daily, notes, post, sectorRows, validData });
})(globalThis);
