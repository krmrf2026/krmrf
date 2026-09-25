import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  DEFAULT_REVIEW_CADENCE_DAYS,
  INACTIVE_GUIDE_STATUSES,
  MAX_REVIEW_CADENCE_DAYS,
  REVIEW_WARNING_DAYS,
  addUtcDays,
  expectedReviewStatus,
  guideFreshnessState,
  todayIso,
  validIsoDate
} from './lib/guide-freshness.mjs';

const ROOT = path.resolve(process.cwd());
const PAGES_FILE = path.join(ROOT, 'data/pages.json');
const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const valueOf = name => args.find(arg => arg.startsWith(`${name}=`))?.slice(name.length + 1);
const referenceDate = valueOf('--date') || todayIso();
const cadenceDays = Number(valueOf('--cadence-days') || DEFAULT_REVIEW_CADENCE_DAYS);
const warningDays = Number(valueOf('--warning-days') || REVIEW_WARNING_DAYS);

if (args.includes('--help')) {
  console.log(`Использование:
  npm run guides:review -- --date=YYYY-MM-DD
  npm run test:freshness

Опции:
  --check                 только проверить, не изменять data/pages.json
  --date=YYYY-MM-DD       дата проверки; по умолчанию текущая UTC-дата
  --cadence-days=N        период до следующей проверки; по умолчанию 30 дней
  --warning-days=N        защитное окно CI; по умолчанию 7 дней`);
  process.exit(0);
}

const errors = [];
if (!validIsoDate(referenceDate)) errors.push(`Некорректная дата проверки: ${referenceDate}.`);
if (!Number.isInteger(cadenceDays) || cadenceDays < 1 || cadenceDays > MAX_REVIEW_CADENCE_DAYS) {
  errors.push(`reviewCadenceDays должен быть целым числом от 1 до ${MAX_REVIEW_CADENCE_DAYS}.`);
}
if (!Number.isInteger(warningDays) || warningDays < 0 || warningDays >= cadenceDays) {
  errors.push('warning-days должен быть неотрицательным целым числом меньше cadence-days.');
}
if (!checkOnly && validIsoDate(referenceDate) && referenceDate > todayIso()) {
  errors.push(`Нельзя зафиксировать будущую проверку ${referenceDate}; сегодня ${todayIso()}.`);
}
if (errors.length) {
  console.error(errors.map(error => `• ${error}`).join('\n'));
  process.exit(1);
}

const pages = JSON.parse(fs.readFileSync(PAGES_FILE, 'utf8'));
const guides = pages.filter(item => item.type === 'guide');
const activeGuides = guides.filter(item => !INACTIVE_GUIDE_STATUSES.has(item.reviewStatus));

if (!checkOnly) {
  const tooNew = activeGuides.filter(item => validIsoDate(item.dateModified) && item.dateModified > referenceDate);
  if (tooNew.length) {
    console.error(tooNew.map(item => (
      `• ${item.id}: dateModified=${item.dateModified} позже даты проверки ${referenceDate}.`
    )).join('\n'));
    process.exit(1);
  }

  for (const item of activeGuides) {
    item.reviewedAt = referenceDate;
    item.reviewAfter = addUtcDays(referenceDate, cadenceDays);
    item.reviewCadenceDays = cadenceDays;
    item.reviewStatus = 'current';
  }

  const ordered = pages.map(item => {
    if (item.type !== 'guide') return item;
    const next = {};
    for (const [key, value] of Object.entries(item)) {
      if (key === 'reviewCadenceDays') continue;
      next[key] = value;
      if (key === 'reviewAfter') next.reviewCadenceDays = item.reviewCadenceDays;
    }
    return next;
  });
  fs.writeFileSync(PAGES_FILE, `${JSON.stringify(ordered, null, 2)}\n`);
  console.log(
    `Зафиксирована проверка ${activeGuides.length} действующих памяток на ${referenceDate}; `
    + `следующая обязательная проверка — ${addUtcDays(referenceDate, cadenceDays)}.`
  );
  process.exit(0);
}

const checkErrors = [];
for (const item of guides) {
  const prefix = item.id || item.url || 'guide';
  const cadence = item.reviewCadenceDays;
  if (!validIsoDate(item.reviewedAt)) checkErrors.push(`${prefix}: нужен корректный reviewedAt.`);
  if (!validIsoDate(item.reviewAfter)) checkErrors.push(`${prefix}: нужен корректный reviewAfter.`);
  if (!Number.isInteger(cadence) || cadence < 1 || cadence > MAX_REVIEW_CADENCE_DAYS) {
    checkErrors.push(`${prefix}: reviewCadenceDays должен быть от 1 до ${MAX_REVIEW_CADENCE_DAYS}.`);
  }
  if (validIsoDate(item.reviewedAt) && validIsoDate(item.dateModified) && item.reviewedAt < item.dateModified) {
    checkErrors.push(`${prefix}: reviewedAt=${item.reviewedAt} раньше dateModified=${item.dateModified}.`);
  }
  if (validIsoDate(item.reviewedAt) && item.reviewedAt > referenceDate) {
    checkErrors.push(`${prefix}: reviewedAt=${item.reviewedAt} находится в будущем относительно ${referenceDate}.`);
  }
  if (validIsoDate(item.reviewedAt) && Number.isInteger(cadence)) {
    const expectedAfter = addUtcDays(item.reviewedAt, cadence);
    if (item.reviewAfter !== expectedAfter) {
      checkErrors.push(`${prefix}: reviewAfter должен быть ${expectedAfter}, сейчас ${item.reviewAfter}.`);
    }
  }
  if (!INACTIVE_GUIDE_STATUSES.has(item.reviewStatus)) {
    const expectedStatus = expectedReviewStatus(item, referenceDate);
    if (item.reviewStatus !== expectedStatus) {
      checkErrors.push(`${prefix}: reviewStatus должен быть ${expectedStatus}, сейчас ${item.reviewStatus}.`);
    }
    const freshness = guideFreshnessState(item, referenceDate, warningDays);
    if (freshness.state === 'overdue') {
      checkErrors.push(`${prefix}: проверка просрочена на ${Math.abs(freshness.daysUntilReview)} дн. (${item.reviewAfter}).`);
    } else if (freshness.state === 'due-soon') {
      checkErrors.push(
        `${prefix}: до обязательной проверки ${item.reviewAfter} осталось ${freshness.daysUntilReview} дн.; `
        + `защитное окно — ${warningDays} дн.`
      );
    }
  }
}

if (checkErrors.length) {
  console.error(checkErrors.map(error => `• ${error}`).join('\n'));
  process.exit(1);
}

const nextReview = activeGuides.map(item => item.reviewAfter).sort()[0] || '—';
const nextDays = activeGuides.length
  ? guideFreshnessState(activeGuides.find(item => item.reviewAfter === nextReview), referenceDate, warningDays).daysUntilReview
  : null;
console.log(
  `Актуальность подтверждена: ${activeGuides.length} действующих памяток; `
  + `контрольная дата ${referenceDate}; ближайшая проверка ${nextReview}`
  + `${nextDays === null ? '' : ` (через ${nextDays} дн.)`}; защитное окно ${warningDays} дн.`
);
