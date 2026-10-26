import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_REVIEW_CADENCE_DAYS, MAX_REVIEW_CADENCE_DAYS, REVIEW_WARNING_DAYS,
  INACTIVE_GUIDE_STATUSES, addUtcDays, validIsoDate, todayIso, requiresReview,
  guideFreshnessState, reviewIssues
} from './lib/guide-freshness.mjs';

const args = process.argv.slice(2);
const value = name => args.find(arg => arg.startsWith(name + '='))?.slice(name.length + 1);
const check = args.includes('--check'), sync = args.includes('--sync-status');
const strict = args.includes('--strict-warning');
const ids = [...new Set(args.filter(arg => arg.startsWith('--id=')).map(arg => arg.slice(5)))];
const date = value('--date') || todayIso();
const cadenceArg = value('--cadence-days');
const warning = Number(value('--warning-days') ?? REVIEW_WARNING_DAYS);
const report = value('--report');
if (args.includes('--help')) {
  console.log(`Проверка: npm run test:freshness\nОчередь: npm run guides:report\nПосле фактической проверки: npm run guides:review -- --id=ID --date=YYYY-MM-DD [--cadence-days=N]\n--id можно повторить. Без --id запись запрещена. Дата по умолчанию — МСК.\nСуществующий интервал сохраняется; новый — 90 дней, максимум 180.\n--sync-status меняет только истёкший current на review-due, без продления дат.\n--strict-warning предназначен для ежедневного мониторинга, а не независимого релиза.`);
  process.exit(0);
}
const errors = [];
for (const arg of args) if (!['--check', '--sync-status', '--strict-warning'].includes(arg)
    && !/^--(?:id|date|cadence-days|warning-days|report)=/.test(arg)) errors.push(`Неизвестная опция: ${arg}.`);
if (!validIsoDate(date)) errors.push('Некорректная дата проверки.');
if (sync && check) errors.push('--sync-status несовместим с --check.');
if (!check && !sync && !ids.length) errors.push('Для записи обязателен явный --id=ID; массовое обновление запрещено.');
if (!check && date > todayIso()) errors.push('Нельзя зафиксировать будущую проверку.');
if (!Number.isInteger(warning) || warning < 0 || warning > MAX_REVIEW_CADENCE_DAYS) errors.push('Некорректный warning-days.');
if (cadenceArg !== undefined && (!Number.isInteger(Number(cadenceArg)) || Number(cadenceArg) < 1 || Number(cadenceArg) > MAX_REVIEW_CADENCE_DAYS)) errors.push(`Период должен быть от 1 до ${MAX_REVIEW_CADENCE_DAYS}.`);
if (sync && (ids.length || cadenceArg !== undefined || value('--date'))) errors.push('--sync-status использует сегодняшнюю дату без выбора ID и периода.');
if (report && (path.isAbsolute(report) || report.split(/[\\/]/).includes('..'))) errors.push('Путь отчёта должен быть относительным внутри проекта.');
const file = path.resolve('data/pages.json');
const pages = JSON.parse(fs.readFileSync(file, 'utf8'));
const reviewable = pages.filter(requiresReview);
const active = reviewable.filter(item => !INACTIVE_GUIDE_STATUSES.has(item.reviewStatus));
for (const id of ids) if (!id || !active.some(item => item.id === id)) errors.push(`Не найдена действующая публикация: ${id || '(пустой id)'}.`);
const selected = ids.length ? active.filter(item => ids.includes(item.id)) : reviewable;
const warnings = [];
const planned = new Map();
if (!errors.length) for (const item of selected) {
  let candidate = { ...item };
  if (!check && !sync) {
    if (item.reviewBlocker) errors.push(`${item.id}: сначала устраните reviewBlocker.`);
    const cadence = cadenceArg === undefined ? (item.reviewCadenceDays ?? DEFAULT_REVIEW_CADENCE_DAYS) : Number(cadenceArg);
    candidate = { ...candidate, reviewedAt: date, reviewAfter: addUtcDays(date, cadence), reviewCadenceDays: cadence, reviewStatus: 'current' };
  }
  if (sync) {
    const before = reviewIssues(candidate, date, { allowExpiredCurrent: true });
    errors.push(...before.map(error => `${item.id}: ${error}`));
    if (!before.length && candidate.reviewStatus === 'current' && candidate.reviewAfter < date) candidate.reviewStatus = 'review-due';
  } else errors.push(...reviewIssues(candidate, date).map(error => `${item.id}: ${error}`));
  planned.set(item.id, candidate);
  const state = guideFreshnessState(candidate, date, warning);
  if (['overdue', 'unreviewed', 'due-soon'].includes(state.state)) warnings.push({ id: item.id, url: item.url, ...state, reviewedAt: item.reviewedAt, reviewAfter: item.reviewAfter });
}
if (check && report) {
  const target = path.resolve(report);fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target + '.json', JSON.stringify({ date, timezone: 'Europe/Moscow', reviewable: reviewable.length, queue: warnings, errors }, null, 2) + '\n');
  fs.writeFileSync(target + '.md', `# Очередь редакционной проверки\n\nДата: ${date} (МСК). Проверка метаданных не является фактчекингом.\n\n` + warnings.map(item => `- ${item.id}: ${item.state}; проверено ${item.reviewedAt}, срок ${item.reviewAfter}`).join('\n') + '\n\n' + errors.map(error => `- ОШИБКА: ${error}`).join('\n') + '\n');
}
if (warnings.length) console.warn(`Редакционная очередь: ${warnings.length}.\n` + warnings.map(item => `• ${item.id}: ${item.state}; срок ${item.reviewAfter}`).join('\n'));
if (strict && warnings.length) errors.push('Ежедневный мониторинг: очередь требует внимания.');
if (errors.length) { console.error(errors.map(error => `• ${error}`).join('\n'));process.exit(1); }
if (!check) {
  const result = pages.map(item => planned.get(item.id) || item);
  if (JSON.stringify(result) !== JSON.stringify(pages)) {
    const temp = file + `.tmp-${process.pid}`;
    fs.writeFileSync(temp, JSON.stringify(result, null, 2) + '\n');fs.renameSync(temp, file);
  }
  console.log(sync ? 'Статусы синхронизированы без продления дат.' : `Проверка зафиксирована только для: ${ids.join(', ')}.`);
} else console.log(`Метаданные проверены: ${selected.length} публикаций. Фактическая достоверность определяется редактором по источникам.`);
