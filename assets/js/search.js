(() => {
  'use strict';

  const form = document.getElementById('site-search-form');
  const input = document.getElementById('site-search-input');
  const results = document.getElementById('search-results');
  const status = document.getElementById('search-status');
  if (!form || !input || !results || !status || !window.KRMSearchIndex) return;

  let engine = null;

  const formatDate = value => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const date = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(date).replace(/\s*г\.$/u, ' года');
  };

  const createResult = ({ document: documentData, suggestion = false }) => {
    const article = document.createElement('article');
    article.className = `search-result${suggestion ? ' search-result--suggestion' : ''}`;

    const meta = document.createElement('p');
    meta.className = 'eyebrow';
    meta.textContent = `${suggestion ? 'Возможное совпадение · ' : ''}${documentData.type} · ${documentData.section}`;
    if (documentData.date) {
      const time = document.createElement('time');
      time.dateTime = documentData.date;
      time.textContent = formatDate(documentData.date);
      meta.append(' · ', time);
    }

    const heading = document.createElement('h2');
    const link = document.createElement('a');
    link.href = documentData.url;
    link.textContent = documentData.title;
    heading.append(link);

    const description = document.createElement('p');
    description.textContent = documentData.description || '';
    article.append(meta, heading, description);
    return article;
  };

  const render = rawQuery => {
    if (!engine) return;
    const query = String(rawQuery || '').trim().slice(0, 100);
    if (!engine.normalize(query)) {
      status.textContent = `В индексе ${engine.documents.length} материалов.`;
      results.replaceChildren();
      return;
    }

    const matches = engine.find(query, { fuzzy: true, limit: engine.documents.length });
    if (!matches.length) {
      status.textContent = 'Ничего не найдено. Проверьте написание, сократите запрос или откройте полный архив.';
      results.replaceChildren();
      return;
    }

    const suggestion = matches.every(match => match.suggestion);
    status.textContent = suggestion
      ? 'Точных совпадений нет. Возможно, подойдут эти материалы:'
      : `Найдено материалов: ${matches.length}`;
    results.replaceChildren(...matches.map(createResult));
  };

  const setQuery = (query, { push = false } = {}) => {
    const clean = String(query || '').trim().slice(0, 100);
    const params = new URLSearchParams(location.search);
    if (clean) params.set('q', clean);
    else params.delete('q');
    const next = `${location.pathname}${params.size ? `?${params}` : ''}${location.hash}`;
    history[push ? 'pushState' : 'replaceState']({ q: clean }, '', next);
    render(clean);
  };

  status.textContent = 'Загружается поисковый индекс…';
  fetch('/data/search-index.json', { credentials: 'same-origin' })
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(payload => {
      engine = window.KRMSearchIndex.create(payload);
      const initial = new URLSearchParams(location.search).get('q') || '';
      input.value = initial.slice(0, 100);
      render(input.value);
    })
    .catch(error => {
      console.error('Ошибка загрузки поискового индекса:', error);
      status.textContent = 'Поисковый индекс недоступен. Используйте полный архив.';
    });

  form.addEventListener('submit', event => {
    event.preventDefault();
    setQuery(input.value, { push: true });
  });

  window.addEventListener('popstate', () => {
    const query = new URLSearchParams(location.search).get('q') || '';
    input.value = query.slice(0, 100);
    render(input.value);
  });
})();
