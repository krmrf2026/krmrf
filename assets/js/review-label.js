(() => {
  'use strict';
  const compact = value => String(value || '').split('-').reverse().join('.');
  const label = ({ status, checked }) => {
    if (status === 'archived') return 'Архивная версия';
    if (status === 'superseded') return 'Материал заменён';
    if (status === 'review-due') return 'Сведения требуют уточнения';
    return checked ? 'Источники сверялись ' + compact(checked) : 'Сведения на дату публикации';
  };
  const scope = typeof window === 'undefined' ? globalThis : window;
  scope.KRMReview = { label };
  if (typeof document === 'undefined') return;
  const refresh = () => {
    for (const node of document.querySelectorAll('[data-review-due]')) {
      if (node.matches('aside')) continue;
      const { reviewStatus: status, reviewChecked: checked } = node.dataset;
      node.textContent = label({ status, checked });
    }
  };
  refresh();
  window.addEventListener('pageshow', refresh);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
})();
