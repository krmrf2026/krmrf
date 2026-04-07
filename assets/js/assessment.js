fetch('/data/assessment.json', { cache: 'no-store' })
  .then(res => res.json())
  .then(items => {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('assessment.json пустой или неверный формат');
    }

    const latest = items[0];

    const titleEl = document.getElementById('assessmentFooterTitle');
    const dateEl = document.getElementById('assessmentFooterDate');
    const imgEl = document.getElementById('assessmentFooterImage');
    const summaryEl = document.getElementById('assessmentFooterSummary');
    const linkEl = document.getElementById('assessmentFooterLink');

    if (!titleEl || !dateEl || !imgEl || !summaryEl || !linkEl) return;

    // Заголовок
    titleEl.textContent = latest.title || '';

    // Дата
    dateEl.textContent = latest.date || '';

    // Картинка
    imgEl.src = latest.image || '';
    imgEl.alt = latest.title || 'Оценка фронта';

    // Описание
    summaryEl.textContent = latest.summary || '';

    // Ссылка
    linkEl.href = latest.url || '#';
  })
  .catch(err => {
    console.error('Ошибка загрузки assessment.json:', err);
  });
