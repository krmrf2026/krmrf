fetch('/data/news.json', { cache: 'no-cache' })
  .then(res => {
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    return res.json();
  })
  .then(items => {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('news.json пустой или неверный формат');
    }

    // текущая дата
    const today = new Date().toISOString().split('T')[0];

    // только опубликованные материалы
    const validItems = items.filter(
      item => item.updated && item.updated <= today
    );

    if (validItems.length === 0) {
      throw new Error('Нет актуальных новостей');
    }

    // новые сверху
    validItems.sort((a, b) =>
      b.updated.localeCompare(a.updated)
    );

    const latest = validItems[0];

    const titleEl = document.getElementById('latestTitle');
    const updatedEl = document.getElementById('latestUpdated');
    const imgEl = document.getElementById('latestImage');
    const textEl = document.getElementById('latestText');

    if (!titleEl || !updatedEl || !imgEl || !textEl) {
      throw new Error('Не найдены элементы блока latest');
    }

    // Заголовок
    titleEl.textContent = latest.title || 'Последнее важное';

    // Дата
    updatedEl.textContent = latest.updated
      ? `Обновлено: ${latest.updated}`
      : '';

    // Картинка
    imgEl.src = latest.image || '';
    imgEl.alt = latest.title || 'Изображение';

    // Очистка
    textEl.innerHTML = '';

    // Текст
    if (
      Array.isArray(latest.paragraphs) &&
      latest.paragraphs.length > 0
    ) {
      latest.paragraphs.forEach(text => {
        const p = document.createElement('p');
        p.textContent = text;
        textEl.appendChild(p);
      });
    } else if (latest.excerpt) {
      const p = document.createElement('p');
      p.textContent = latest.excerpt;
      textEl.appendChild(p);
    }

    // Ссылка
    if (latest.url) {
      const link = document.createElement('a');

      link.href = latest.url;
      link.textContent = 'Открыть полную новость →';
      link.className = 'news-link';

      textEl.appendChild(link);
    }
  })
  .catch(err => {
    console.error('Ошибка загрузки news.json:', err);

    const textEl = document.getElementById('latestText');

    if (textEl) {
      textEl.innerHTML = `
        <p>Не удалось загрузить последние материалы.</p>
        <p><a href="/archive/">Перейти в архив →</a></p>
      `;
    }
  });
