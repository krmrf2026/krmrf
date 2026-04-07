fetch('../data/assessment.json', { cache: 'no-store' })
  .then(res => res.json())
  .then(items => {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('assessment.json пустой или неверный формат');
    }

    // ========================
    // 1. СОРТИРОВКА (по дате)
    // ========================
    items.sort((a, b) => new Date(b.updated) - new Date(a.updated));

    // ========================
    // 2. ГЛАВНАЯ СТРАНИЦА
    // ========================
    const titleEl = document.getElementById('assessmentFooterTitle');

    if (titleEl) {
      const latest = items[0];

      const dateEl = document.getElementById('assessmentFooterDate');
      const imgEl = document.getElementById('assessmentFooterImage');
      const summaryEl = document.getElementById('assessmentFooterSummary');
      const linkEl = document.getElementById('assessmentFooterLink');

      titleEl.textContent = latest.title || '';
      dateEl.textContent = latest.updated || '';

      if (imgEl) {
        imgEl.src = latest.image || '';
        imgEl.alt = latest.title || 'Оценка фронта';
      }

      summaryEl.textContent = latest.excerpt || latest.summary || '';
      linkEl.href = latest.url || '#';
    }

    // ========================
    // 3. СТРАНИЦА /assessment/
    // ========================
    const list = document.getElementById('assessmentList');

    if (list) {
      list.innerHTML = '';

      items.slice(0, 10).forEach(item => {
        const card = document.createElement('div');
        card.className = 'news-item';

        card.innerHTML = `
          <div class="news-date">${item.updated}</div>
          <h3 class="news-title">
            <a href="${item.url || '#'}">${item.title}</a>
          </h3>
          <div class="news-meta">${item.period || ''}</div>
          <p class="news-summary">${item.excerpt || item.summary || ''}</p>
        `;

        list.appendChild(card);
      });
    }
  })
  .catch(err => {
    console.error('Ошибка загрузки assessment.json:', err);
  });
