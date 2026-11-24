(() => {
  'use strict';
  const compact = value => String(value || '').split('-').reverse().join('.');
  const dayInMoscow = () => new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
  const label = ({ status, checked, due }, day = dayInMoscow()) => {
    if (status === 'archived') return 'Архивная версия';
    if (status === 'superseded') return 'Материал заменён';
    if (status === 'review-due' || !due || due < day) {
      return due && due < day ? 'Требует проверки · срок истёк ' + compact(due) : 'Требует повторной проверки';
    }
    return 'Проверено ' + compact(checked) + ' · срок проверки ' + compact(due);
  };
  const scope = typeof window === 'undefined' ? globalThis : window;
  scope.KRMReview = { label };
  if (typeof document === 'undefined') return;
  const refresh = () => {
    const day = dayInMoscow();
    for (const node of document.querySelectorAll('[data-review-due]')) {
      const { reviewStatus: status, reviewChecked: checked, reviewDue: due } = node.dataset;
      if (node.matches('aside')) {
        if (status === 'current' && due < day && node.classList.contains('guide-status--current')) {
          node.classList.replace('guide-status--current', 'guide-status--review');
          node.querySelector('strong').textContent = 'Требует повторной проверки';
          node.lastElementChild.textContent = 'Срок проверки истёк ' + compact(due) + '. Сверьте сведения с указанным источником.';
        }
      } else node.textContent = label({ status, checked, due }, day);
    }
  };
  refresh();
  window.addEventListener('pageshow', refresh);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
})();
