const DAY_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_REVIEW_CADENCE_DAYS = 30;
export const REVIEW_WARNING_DAYS = 7;
export const MAX_REVIEW_CADENCE_DAYS = 90;
export const INACTIVE_GUIDE_STATUSES = new Set(['superseded', 'archived']);

export const todayIso = () => new Date().toISOString().slice(0, 10);

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
  return item.reviewAfter < referenceDate ? 'review-due' : 'current';
};

export const guideFreshnessState = (
  item,
  referenceDate = todayIso(),
  warningDays = REVIEW_WARNING_DAYS
) => {
  if (item.reviewStatus === 'superseded') return { state: 'superseded', daysUntilReview: null };
  if (item.reviewStatus === 'archived') return { state: 'archived', daysUntilReview: null };
  const daysUntilReview = daysBetween(referenceDate, item.reviewAfter);
  if (daysUntilReview === null) return { state: 'invalid', daysUntilReview };
  if (daysUntilReview < 0) return { state: 'overdue', daysUntilReview };
  if (daysUntilReview <= warningDays) return { state: 'due-soon', daysUntilReview };
  return { state: 'current', daysUntilReview };
};
