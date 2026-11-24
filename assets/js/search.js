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
    if (documentData.review && window.KRMReview) {
      const badge = document.createElement('small');
      const { status, checked, due } = documentData.review;
      badge.className = 'review-summary';
      Object.assign(badge.dataset, { reviewStatus: status, reviewChecked: checked, reviewDue: due });
      badge.textContent = window.KRMReview.label(documentData.review);
      article.append(badge);
    }
    return article;
  };

  const showAlternatives = () => {
    const links = document.createElement('p');
    for (const [name, href] of [['Открыть справочник', '/reference/'], ['Открыть архив', '/archive/']]) {
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.textContent = name;
      if (links.childNodes.length) links.append(' · ');
      links.append(anchor);
    }
    results.replaceChildren(links);
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
      showAlternatives();
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
    params.delete('q');
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
      const initial = history.state?.q || '';
      input.value = initial.slice(0, 100);
      render(input.value);
    })
    .catch(error => {
      console.error('Ошибка загрузки поискового индекса:', error);
      status.textContent = 'Поисковый индекс недоступен. Используйте полный архив.';
      showAlternatives();
    });

  form.addEventListener('submit', event => {
    event.preventDefault();
    const clean = String(input.value || '').trim();
    window.KRMAnalytics?.goal('search_submit', {
      length: Math.min(100, clean.length),
      words: clean ? Math.min(8, clean.split(/\s+/).filter(Boolean).length) : 0
    });
    setQuery(clean, { push: true });
  });

  results.addEventListener('click', event => {
    const link = event.target?.closest?.('a[href]');
    if (!link?.closest('.search-result')) return;
    let target = '';
    try { target = new URL(link.href, location.href).pathname; } catch {}
    window.KRMAnalytics?.goal('search_result_click', { target });
  });

  window.addEventListener('popstate', () => {
    const query = history.state?.q || '';
    input.value = query.slice(0, 100);
    render(input.value);
  });
})();
