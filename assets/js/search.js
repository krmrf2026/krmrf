(() => {
  const form = document.querySelector('.search-form');
  const input = document.getElementById('site-search');
  const results = document.getElementById('search-results');
  const status = document.getElementById('search-status');
  if (!form || !input || !results || !status) return;

  const SECTION_LABELS = {
    kremennaya: 'Кременная', svo: 'СВО', law: 'Справочник', lnr: 'ЛНР',
    'civilian-impact': 'Гражданские последствия', politics: 'Политика',
    warcrimes: 'Досье', assessment: 'Оценки фронта'
  };
  const TYPE_LABELS = {
    article: 'Материал', guide: 'Практическая памятка',
    assessment: 'Оценка фронта', dossier: 'Досье'
  };

  let index = [];
  const normalize = value => String(value || '')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[–—-]/g, ' ')
    .replace(/[^a-zа-я0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const distance = (a, b) => {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i += 1) {
      let diagonal = previous[0];
      previous[0] = i;
      for (let j = 1; j <= b.length; j += 1) {
        const old = previous[j];
        previous[j] = Math.min(
          previous[j] + 1,
          previous[j - 1] + 1,
          diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
        diagonal = old;
      }
    }
    return previous[b.length];
  };

  const closeEnough = (term, word) => {
    if (word.includes(term) || term.includes(word)) return true;
    const limit = term.length >= 8 ? 2 : term.length >= 4 ? 1 : 0;
    return limit > 0 && Math.abs(term.length - word.length) <= limit && distance(term, word) <= limit;
  };

  const scoreExact = (item, terms) => {
    const title = normalize(item.title);
    const description = normalize(item.description);
    const haystack = normalize([item.title, item.description, item.section, item.type,
      item.text, item.topics, item.locations, item.period].join(' '));
    if (!terms.every(term => haystack.includes(term))) return null;
    return terms.reduce((sum, term) => sum
      + (title.includes(term) ? 8 : 0)
      + (description.includes(term) ? 3 : 0)
      + 1, 0);
  };

  const scoreFuzzy = (item, terms) => {
    const title = normalize(item.title);
    const words = normalize([item.title, item.description, item.section, item.type,
      item.topics, item.locations, item.period].join(' ')).split(' ').filter(Boolean);
    if (!terms.every(term => words.some(word => closeEnough(term, word)))) return null;
    return terms.reduce((sum, term) => sum + (title.split(' ').some(word => closeEnough(term, word)) ? 5 : 1), 0);
  };

  const createResult = (item, { suggestion = false } = {}) => {
    const article = document.createElement('article');
    article.className = `search-result${suggestion ? ' search-result--suggestion' : ''}`;
    const meta = document.createElement('p');
    meta.className = 'eyebrow';
    meta.textContent = suggestion
      ? `Возможное совпадение · ${item.type} · ${item.section}`
      : `${item.type} · ${item.section} · ${item.date}`;
    const h2 = document.createElement('h2');
    const link = document.createElement('a');
    link.href = item.url;
    link.textContent = item.title;
    h2.append(link);
    const description = document.createElement('p');
    description.textContent = item.description || '';
    article.append(meta, h2, description);
    return article;
  };

  const render = query => {
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    if (!terms.length) {
      status.textContent = `В индексе ${index.length} материалов.`;
      results.replaceChildren();
      return;
    }

    const exact = index.map(item => {
      const score = scoreExact(item, terms);
      return score === null ? null : { item, score };
    }).filter(Boolean)
      .sort((a, b) => b.score - a.score || String(b.item.date).localeCompare(String(a.item.date)))
      .slice(0, 50);

    if (exact.length) {
      status.textContent = `Найдено: ${exact.length}`;
      results.replaceChildren(...exact.map(({ item }) => createResult(item)));
      return;
    }

    const fuzzy = index.map(item => {
      const score = scoreFuzzy(item, terms);
      return score === null ? null : { item, score };
    }).filter(Boolean)
      .sort((a, b) => b.score - a.score || String(b.item.date).localeCompare(String(a.item.date)))
      .slice(0, 8);

    if (fuzzy.length) {
      status.textContent = 'Точных совпадений нет. Возможно, подойдут эти материалы:';
      results.replaceChildren(...fuzzy.map(({ item }) => createResult(item, { suggestion: true })));
    } else {
      status.textContent = 'Ничего не найдено. Проверьте написание, сократите запрос или откройте полный архив.';
      results.replaceChildren();
    }
  };

  const setQuery = (query, { push = false } = {}) => {
    const url = query ? `?q=${encodeURIComponent(query)}` : location.pathname;
    history[push ? 'pushState' : 'replaceState']({ q: query }, '', url);
    render(query);
  };

  Promise.allSettled([
    fetch('/data/search-index.json', { credentials: 'same-origin', cache: 'no-store' }).then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    }),
    fetch('/data/pages.json', { credentials: 'same-origin', cache: 'no-store' }).then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
  ]).then(([searchResult, pagesResult]) => {
    const full = searchResult.status === 'fulfilled' && Array.isArray(searchResult.value)
      ? searchResult.value
      : [];
    const byUrl = new Map(full.map(item => [item.url, { ...item }]));

    if (pagesResult.status === 'fulfilled' && Array.isArray(pagesResult.value)) {
      pagesResult.value.forEach(page => {
        if (!page?.url || !page?.title) return;
        const existing = byUrl.get(page.url) || {};
        byUrl.set(page.url, {
          ...existing,
          title: page.title,
          url: page.url,
          section: SECTION_LABELS[page.section] || page.section || existing.section || '',
          type: TYPE_LABELS[page.type] || page.type || existing.type || '',
          date: page.datePublished || existing.date || '',
          description: page.excerpt || existing.description || '',
          text: existing.text || '',
          topics: Array.isArray(page.topics) ? page.topics.join(' ') : existing.topics || '',
          locations: Array.isArray(page.locations) ? page.locations.join(' ') : existing.locations || '',
          period: page.period || existing.period || ''
        });
      });
    }

    index = [...byUrl.values()].filter(item => item.url && item.title);
    const initial = new URLSearchParams(location.search).get('q') || '';
    input.value = initial;
    render(initial);
  }).catch(() => {
    status.textContent = 'Поисковый индекс недоступен. Используйте полный архив.';
  });

  form.addEventListener('submit', event => {
    event.preventDefault();
    setQuery(input.value.trim(), { push: true });
  });

  window.addEventListener('popstate', () => {
    const query = new URLSearchParams(location.search).get('q') || '';
    input.value = query;
    render(query);
  });
})();
