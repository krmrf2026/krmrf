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
    .replace(/\s+/g, ' ')
    .trim();

  const render = query => {
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    const found = !terms.length ? [] : index.map(item => {
      const title = normalize(item.title);
      const haystack = normalize([
        item.title, item.description, item.section, item.type,
        item.text, item.topics, item.locations, item.period
      ].join(' '));
      const allMatch = terms.every(term => haystack.includes(term));
      if (!allMatch) return null;
      const score = terms.reduce((sum, term) => sum
        + (title.includes(term) ? 8 : 0)
        + (normalize(item.description).includes(term) ? 3 : 0)
        + (haystack.includes(term) ? 1 : 0), 0);
      return { item, score };
    }).filter(Boolean)
      .sort((a, b) => b.score - a.score || String(b.item.date).localeCompare(String(a.item.date)))
      .slice(0, 50);

    status.textContent = terms.length ? `Найдено: ${found.length}` : `В индексе ${index.length} материалов.`;
    results.replaceChildren(...found.map(({ item }) => {
      const article = document.createElement('article');
      article.className = 'search-result';
      const meta = document.createElement('p');
      meta.className = 'eyebrow';
      meta.textContent = `${item.type} · ${item.section} · ${item.date}`;
      const h2 = document.createElement('h2');
      const link = document.createElement('a');
      link.href = item.url;
      link.textContent = item.title;
      h2.append(link);
      const description = document.createElement('p');
      description.textContent = item.description || '';
      article.append(meta, h2, description);
      return article;
    }));
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
          topics: Array.isArray(page.topics) ? page.topics.join(' ') : '',
          locations: Array.isArray(page.locations) ? page.locations.join(' ') : '',
          period: page.period || ''
        });
      });
    }

    index = [...byUrl.values()].filter(item => item.url && item.title);
    const initial = new URLSearchParams(location.search).get('q') || '';
    if (initial) {
      input.value = initial;
      render(initial);
    } else {
      status.textContent = `В индексе ${index.length} материалов.`;
    }
  }).catch(() => {
    status.textContent = 'Поисковый индекс недоступен. Используйте полный архив.';
  });

  form.addEventListener('submit', event => {
    event.preventDefault();
    const query = input.value.trim();
    history.replaceState(null, '', query ? `?q=${encodeURIComponent(query)}` : location.pathname);
    render(query);
  });
})();
