fetch('../data/assessment.json', { cache: 'no-cache' })

  .then((res) => {

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    return res.json();
  })

  .then((items) => {

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('assessment.json пустой или неверный формат');
    }

    // Сортировка: новые сверху
    items.sort(
      (a, b) => new Date(b.updated) - new Date(a.updated)
    );

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

      if (dateEl) {
        dateEl.textContent = latest.updated || '';
      }

      if (imgEl) {
        imgEl.src = latest.image || '';
        imgEl.alt = latest.title || 'Оценка фронта';
      }

      if (summaryEl) {
        summaryEl.textContent =
          latest.excerpt ||
          latest.summary ||
          '';
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
        const summary =
          item.excerpt ||
          item.summary ||
          '';

        const dateDiv = document.createElement('div');

        dateDiv.className = 'assessment-date';
        dateDiv.textContent = date;

        const h3 = document.createElement('h3');

        h3.className = 'assessment-title';

        const a = document.createElement('a');

        a.href = link;
        a.textContent = title;

        h3.appendChild(a);

        card.appendChild(dateDiv);
        card.appendChild(h3);

        if (period) {

          const periodDiv = document.createElement('div');

          periodDiv.className = 'assessment-period';
          periodDiv.textContent = period;

          card.appendChild(periodDiv);
        }

        if (summary) {

          const summaryP = document.createElement('p');

          summaryP.className = 'assessment-summary';
          summaryP.textContent = summary;

          card.appendChild(summaryP);
        }

        list.appendChild(card);
      });
    }
  })

  .catch((err) => {

    console.error('Ошибка загрузки assessment.json:', err);

    const list = document.getElementById('assessmentList');

    if (list) {

      list.innerHTML = `
        <div class="card">
          <p>Не удалось загрузить оценки фронта.</p>
          <p><a href="/archive/">Перейти в архив →</a></p>
        </div>
      `;
    }

    const titleEl = document.getElementById('assessmentFooterTitle');

    if (titleEl) {
      titleEl.textContent = 'Не удалось загрузить данные';
    }
  });
