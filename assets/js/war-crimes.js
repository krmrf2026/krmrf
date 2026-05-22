fetch('/data/news.json', { cache: 'no-store' })
  .then((response) => response.json())
  .then((items) => {
    const list = document.getElementById('warCrimesList');
    if (!list) return;

    if (!Array.isArray(items)) {
      throw new Error('news.json имеет неправильный формат');
    }

    const incidents = items
      .filter((item) => item && item.section === 'warcrimes' && item.updated && item.url)
      .sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));

    list.innerHTML = '';

    if (incidents.length === 0) {
      const p = document.createElement('p');
      p.textContent = 'Материалы раздела пока не добавлены.';
      list.appendChild(p);
      return;
    }

    incidents.forEach((item) => {
      const details = document.createElement('details');
      details.className = 'news-item';
      details.open = true;

      const summary = document.createElement('summary');
      summary.className = 'news-summary';
      summary.textContent = (item.updated || '') + ' - ' + (item.title || 'Без названия');

      const body = document.createElement('div');
      body.className = 'news-body';

      if (item.excerpt) {
        const ex = document.createElement('div');
        ex.className = 'news-excerpt';
        ex.textContent = item.excerpt;
        body.appendChild(ex);
      }

      if (item.image) {
        const img = document.createElement('img');
        img.className = 'news-image';
        img.src = item.image;
        img.alt = item.title || 'Изображение';
        body.appendChild(img);
      }

      (item.paragraphs || []).forEach((text) => {
        const p = document.createElement('p');
        p.textContent = text;
        body.appendChild(p);
      });

      const link = document.createElement('a');
      link.href = item.url;
      link.textContent = 'Открыть досье →';
      link.className = 'news-link';
      body.appendChild(link);

      details.appendChild(summary);
      details.appendChild(body);
      list.appendChild(details);
    });
  })
  .catch((error) => {
    console.error('Ошибка загрузки раздела военных преступлений:', error);
    const list = document.getElementById('warCrimesList');
    if (list) {
      list.innerHTML = '';
      const p = document.createElement('p');
      p.textContent = 'Не удалось загрузить материалы раздела. Обновите страницу позже.';
      list.appendChild(p);
    }
  });
