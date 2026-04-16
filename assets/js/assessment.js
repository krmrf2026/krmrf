fetch('../data/assessment.json', { cache: 'no-store' })
  .then((res) => res.json())
  .then((items) => {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('assessment.json пустой или неверный формат');
    }

    // Сортировка: новые сверху
    items.sort((a, b) => new Date(b.updated) - new Date(a.updated));

    // ========================
    // 1. Блок на главной
    // ========================
    const titleEl = document.getElementById('assessmentFooterTitle');

    if (titleEl) {
      const latest = items[0];

      const dateEl = document.getElementById('assessmentFooterDate');
      const imgEl = document.getElementById('assessmentFooterImage');
      const summaryEl = document.getElementById('assessmentFooterSummary');
      const linkEl = document.getElementById('assessmentFooterLink');

      titleEl.textContent = latest.title || '';
      if (dateEl) dateEl.textContent = latest.updated || '';

      if (imgEl) {
        imgEl.src = latest.image || '';
        imgEl.alt = latest.title || 'Оценка фронта';
      }

      if (summaryEl) {
        summaryEl.textContent = latest.excerpt || latest.summary || '';
      }

      if (linkEl) {
        linkEl.href = latest.url || '#';
      }
    }

    // ========================
    // 2. Страница /assessment/
    // ========================
    const list = document.getElementById('assessmentList');

    if (list) {
      list.innerHTML = '';

      items.slice(0, 15).forEach((item) => {
        const card = document.createElement('article');
        card.className = 'assessment-item';

        const link = item.url || '#';
        const title = item.title || 'Без названия';
        const date = item.updated || '';
        const period = item.period || '';
        const summary = item.excerpt || item.summary || '';

        card.innerHTML = `
          <div class="assessment-date">${date}</div>
          <h3 class="assessment-title">
            <a href="${link}">${title}</a>
          </h3>
          ${period ? `<div class="assessment-period">${period}</div>` : ''}
          ${summary ? `<p class="assessment-summary">${summary}</p>` : ''}
        `;

        list.appendChild(card);
      });
    }
  })
  .catch((err) => {
    console.error('Ошибка загрузки assessment.json:', err);
  });
