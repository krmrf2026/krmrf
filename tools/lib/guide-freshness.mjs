const DAY_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_REVIEW_CADENCE_DAYS = 90;
export const REVIEW_WARNING_DAYS = 7;
export const MAX_REVIEW_CADENCE_DAYS = 180;
export const INACTIVE_GUIDE_STATUSES = new Set(['superseded', 'archived']);

export const todayIso = (date = new Date()) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en', {
    timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

export const REVIEW_FIELDS = ['reviewedAt', 'reviewAfter', 'reviewCadenceDays', 'reviewStatus'];
export const requiresReview = item => item.type === 'guide'
  || REVIEW_FIELDS.some(field => Object.hasOwn(item, field));

export const validIsoDate = value => {
  const match = String(value || '').match(/^\d{4}-\d{2}-\d{2}$/);
  if (!match) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export const addUtcDays = (value, days) => {
  if (!validIsoDate(value) || !Number.isInteger(days)) return '';
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

export const daysBetween = (from, to) => {
  if (!validIsoDate(from) || !validIsoDate(to)) return null;
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
};

export const expectedReviewStatus = (item, referenceDate = todayIso()) => {
  if (INACTIVE_GUIDE_STATUSES.has(item.reviewStatus)) return item.reviewStatus;
  if (!validIsoDate(item.reviewAfter) || !validIsoDate(referenceDate)) return 'invalid';
  if (item.reviewStatus === 'review-due' || item.reviewBlocker
      || (validIsoDate(item.dateModified) && item.reviewedAt < item.dateModified)) return 'review-due';
  return item.reviewAfter < referenceDate ? 'review-due' : 'current';
};

export const guideFreshnessState = (
  item,
  referenceDate = todayIso(),
  warningDays = REVIEW_WARNING_DAYS
) => {
  if (item.reviewStatus === 'superseded') return { state: 'superseded', daysUntilReview: null };
  if (item.reviewStatus === 'archived') return { state: 'archived', daysUntilReview: null };
  if (item.reviewBlocker) return { state: 'blocked', daysUntilReview: null };
  const daysUntilReview = daysBetween(referenceDate, item.reviewAfter);
  if (daysUntilReview === null) return { state: 'invalid', daysUntilReview };
  if (daysUntilReview < 0) return { state: 'overdue', daysUntilReview };
  if (item.reviewStatus === 'review-due' || item.reviewedAt < item.dateModified) return { state: 'unreviewed', daysUntilReview };
  if (daysUntilReview <= warningDays) return { state: 'due-soon', daysUntilReview };
  return { state: 'current', daysUntilReview };
};

// These checks establish metadata consistency, not factual accuracy.
export const reviewIssues = (item, date = todayIso(), { allowExpiredCurrent = false } = {}) => {
  const errors = [];
  if (!validIsoDate(item.datePublished)) errors.push('некорректная datePublished.');
  if (!validIsoDate(item.dateModified)) errors.push('некорректная dateModified.');
  if (validIsoDate(item.datePublished) && item.datePublished > date) errors.push('datePublished находится в будущем.');
  if (validIsoDate(item.dateModified) && item.dateModified > date) errors.push('dateModified находится в будущем.');
  if (validIsoDate(item.datePublished) && validIsoDate(item.dateModified) && item.dateModified < item.datePublished) errors.push('dateModified раньше datePublished.');
  if (!validIsoDate(item.reviewedAt)) errors.push('нужен корректный reviewedAt.');
  if (!validIsoDate(item.reviewAfter)) errors.push('нужен корректный reviewAfter.');
  if (!['current', 'review-due', 'superseded', 'archived'].includes(item.reviewStatus)) errors.push(`неизвестный reviewStatus=${item.reviewStatus}.`);
  if (!Number.isInteger(item.reviewCadenceDays) || item.reviewCadenceDays < 1 || item.reviewCadenceDays > MAX_REVIEW_CADENCE_DAYS) errors.push(`reviewCadenceDays должен быть от 1 до ${MAX_REVIEW_CADENCE_DAYS}.`);
  if (validIsoDate(item.reviewedAt) && item.reviewedAt > date) errors.push('reviewedAt находится в будущем.');
  if (validIsoDate(item.reviewedAt) && validIsoDate(item.datePublished) && item.reviewedAt < item.datePublished) errors.push('reviewedAt раньше datePublished.');
  if (validIsoDate(item.reviewAfter) && validIsoDate(item.datePublished) && item.reviewAfter < item.datePublished) errors.push('reviewAfter раньше публикации.');
  if (validIsoDate(item.reviewedAt) && Number.isInteger(item.reviewCadenceDays)
      && item.reviewAfter !== addUtcDays(item.reviewedAt, item.reviewCadenceDays)) errors.push(`reviewAfter должен быть ${addUtcDays(item.reviewedAt, item.reviewCadenceDays)} по заданной периодичности.`);
  if (item.reviewedAt < item.dateModified && item.reviewStatus === 'current') errors.push('reviewedAt раньше dateModified; новая редакция ещё не проверена.');
  if (item.reviewBlocker !== undefined && (typeof item.reviewBlocker !== 'string' || !item.reviewBlocker.trim())) errors.push('reviewBlocker должен содержать конкретную причину.');
  if (item.reviewBlocker) errors.push(`Критическое редакционное препятствие: ${item.reviewBlocker}`);
  const expected = expectedReviewStatus(item, date);
  if (!INACTIVE_GUIDE_STATUSES.has(item.reviewStatus) && item.reviewStatus !== expected
      && !(allowExpiredCurrent && item.reviewStatus === 'current' && item.reviewAfter < date
        && item.reviewedAt >= item.dateModified && !item.reviewBlocker)) errors.push(`reviewStatus должен быть ${expected}.`);
  if (item.reviewStatus === 'superseded' && !item.supersededBy) errors.push('для superseded нужен supersededBy.');
  return errors;
};
