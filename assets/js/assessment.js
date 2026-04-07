fetch('../data/assessment.json', { cache: 'no-store' })
  .then(res => res.json())
  .then(items => {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('assessment.json пустой или неверный формат');
    }

    // ========================
    // 1. ГЛАВНАЯ СТРАНИЦА
    // ========================
    const titleEl = document.getElementById('assessmentFooterTitle');

    if (titleEl) {
      const latest = items[0];

      const dateEl = document.getElementById('assessmentFooterDate');
      const imgEl = document.getElementById('assessmentFooterImage');
      const summaryEl = document.getElementById('assessmentFooterSummary');
      const linkEl = document.getElementById('assessmentFooterLink');

      titleEl.textContent = latest.title || '';
      dateEl.textContent = latest.date || '';
      imgEl.src = latest.image || '';
      imgEl.alt = latest.title || 'Оценка фронта';
      summaryEl.textContent = latest.summary || '';
      linkEl.href = latest.url || '#';
    }

    // ========================
    // 2. СТРАНИЦА /assessment/
    // ========================
    const list = document.getElementById('assessmentList');

    if (list) {
      list.innerHTML = '';

      items.forEach(item => {
        const card = document.createElement('a');
        card.href = item.url || '#';
        card.className = 'card';

        card.innerHTML = `
          <img src="${item.image}" alt="${item.title}">
          <div class="card-content">
            <div class="card-date">${item.date}</div>
            <h3>${item.title}</h3>
            <p>${item.summary}</p>
          </div>
        `;

        list.appendChild(card);
      });
    }
  })
  .catch(err => {
    console.error('Ошибка загрузки assessment.json:', err);
  });
