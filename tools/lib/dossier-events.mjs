import { escapeHtml } from './html-fragments.mjs';
import { validIsoDate } from './guide-freshness.mjs';

export const dossierEventIssues = (data, pages, today) => {
  const errors = [];
  if (data?.schemaVersion !== 1 || !Array.isArray(data.events)) return ['Неверный формат реестра событий досье.'];
  const ids = new Set();
  for (const event of data.events) {
    const prefix = event.id || '(без id)';
    const dossier = pages.find(item => item.id === event.dossierId && item.type === 'dossier');
    if (!event.id || ids.has(event.id)) errors.push(`${prefix}: нужен уникальный id.`);
    ids.add(event.id);
    if (!dossier) errors.push(`${prefix}: неизвестное досье.`);
    for (const field of ['reportedAt', 'verifiedAt']) {
      if (!validIsoDate(event[field]) || event[field] > today) errors.push(`${prefix}: неверная ${field}.`);
    }
    if (event.occurredOn !== null && (!validIsoDate(event.occurredOn) || event.occurredOn > event.reportedAt)) errors.push(`${prefix}: неверная дата события.`);
    if (event.verifiedAt < event.reportedAt) errors.push(`${prefix}: проверка раньше источника.`);
    if (dossier && (event.verifiedAt > dossier.dateModified || event.reportedAt > dossier.dateModified)) errors.push(`${prefix}: обновите dateModified досье после проверки нового источника.`);
    for (const field of ['place', 'summary', 'attribution']) if (typeof event[field] !== 'string' || !event[field].trim()) errors.push(`${prefix}: нужен ${field}.`);
    if (!Array.isArray(event.sources) || !event.sources.length) errors.push(`${prefix}: нужен прямой источник.`);
    for (const source of event.sources || []) {
      try {
        const url = new URL(source.url);
        if (url.protocol !== 'https:' || url.hostname === 'krmrf.ru' || url.hostname.endsWith('.krmrf.ru') || !source.label) throw new Error();
      } catch { errors.push(`${prefix}: нужен внешний HTTPS-источник с подписью.`); }
    }
    // A message can describe several incidents or overlapping reporting windows.
    // This register deliberately has no cumulative casualty counter.
  }
  return errors;
};

export const renderDossierEvents = events => {
  const rows = [...events].sort((a, b) => a.reportedAt.localeCompare(b.reportedAt) || a.id.localeCompare(b.id));
  const checked = rows.map(event => event.verifiedAt).sort().at(-1);
  return '<section aria-label="Датированные сообщения досье">'
    + '<h2 id="novye-soobshcheniya">Дополнение: новые датированные сообщения</h2>'
    + '<p>Ниже — датированные сообщения о новых эпизодах. Дата в первом столбце относится к публикации источника; точная дата удара выделена отдельно, если она установлена. Сводка «за сутки» может описывать предыдущий день. Сведения и атрибуция приведены по указанным источникам; это не результаты независимой экспертизы редакции.</p>'
    + `<table><caption>Дополнение к Кременскому досье: сверено ${escapeHtml(checked.split('-').reverse().join('.'))}</caption>`
    + '<thead><tr><th scope="col">Дата сообщения</th><th scope="col">Место и сведения о людях</th><th scope="col">Источник и основание</th></tr></thead><tbody>'
    + rows.map(event => `<tr><td><time datetime="${escapeHtml(event.reportedAt)}">${escapeHtml(event.reportedAt.split('-').reverse().join('.'))}</time>`
      + (event.occurredOn ? `<br/>Событие: ${escapeHtml(event.occurredOn.split('-').reverse().join('.'))}` : '')
      + `</td><td><strong>${escapeHtml(event.place)}.</strong> ${escapeHtml(event.summary)}</td><td>`
      + event.sources.map(source => `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.label)}</a>`).join('; ')
      + `<br/>${escapeHtml(event.attribution)}</td></tr>`).join('')
    + '</tbody></table><p>Эти сообщения не складываются с исходными 21 погибшим и 85 ранеными/пострадавшими: исходная поимённая база на 57 карточек в проекте отсутствует, а соседние суточные сводки могут пересекаться. Неуказанные потери не приравниваются к нулю. Общий итог за весь период пока не установлен.</p></section>';
};

export const syncDossierEvents = (html, item, data) => {
  const events = data.events.filter(event => event.dossierId === item.id);
  if (!events.length) return html;
  const marker = /<!-- KRM DOSSIER EVENTS START -->[\s\S]*?<!-- KRM DOSSIER EVENTS END -->/;
  if (!marker.test(html)) throw new Error(`${item.id}: отсутствует место для реестра событий.`);
  return html.replace(marker, `<!-- KRM DOSSIER EVENTS START -->${renderDossierEvents(events)}<!-- KRM DOSSIER EVENTS END -->`);
};
