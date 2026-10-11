(function (root) {
  'use strict';
  const day = value => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
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
  function summarize(data, fromId, toId) {
    const start = data.snapshots.findIndex(s => s.id === fromId), end = data.snapshots.findIndex(s => s.id === toId);
    if (start < 0 || end <= start) return { status: 'insufficient', reason: 'Нужны два разных среза в хронологическом порядке.' };
    const from = data.snapshots[start], to = data.snapshots[end], intervals = data.intervals.slice(start, end);
    if (intervals.some(i => i.status !== 'ok')) return { status: 'unavailable', reason: 'В интервале есть несопоставимые или недоступные данные.', from, to };
    return { status: 'ok', from, to, addedKm2: intervals.reduce((sum, i) => sum + i.addedKm2, 0), removedKm2: intervals.reduce((sum, i) => sum + i.removedKm2, 0),
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
  root.KRMMapStatistics = Object.freeze({ day, date, shortDate, monthName, range, area, summarize, period, daily, notes, post });
})(globalThis);
