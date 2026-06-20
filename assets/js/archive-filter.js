(() => {
  const buttons = [...document.querySelectorAll('[data-filter]')];
  const input = document.getElementById('archive-search');
  const status = document.getElementById('archive-status');
  const reset = document.getElementById('archive-reset');
  const listRoot = document.getElementById('archive-list');
  if (!listRoot) return;

  const SECTION_LABELS = {
    kremennaya: 'Кременная',
    svo: 'СВО',
    law: 'Справочник',
    lnr: 'ЛНР',
    'civilian-impact': 'Гражданские последствия',
    politics: 'Политика',
    warcrimes: 'Досье',
    assessment: 'Оценки'
  };

  const TYPE_LABELS = {
    article: 'Материал',
    guide: 'Практическая памятка',
    assessment: 'Оценка фронта',
    dossier: 'Досье'
  };

  const normalize = value => String(value || '')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[–—-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const escapeHtml = value => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const formatDate = value => {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return String(value || '');
    const [, year, month, day] = match;
    const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    return `${Number(day)} ${months[Number(month) - 1]} ${year}`;
  };

  const monthTitle = value => {
    const match = String(value || '').match(/^(\d{4})-(\d{2})/);
    if (!match) return 'Без даты';
    const [, year, month] = match;
    const months = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
      'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
    return `${months[Number(month) - 1]} ${year}`;
  };

  const params = new URLSearchParams(window.location.search);
  const allowed = new Set(buttons.map(button => button.dataset.filter || 'all'));
  let active = allowed.has(params.get('section')) ? params.get('section') : 'all';
  if (input && params.get('q')) input.value = params.get('q');

  let rows = [];
  let extraSearchByUrl = new Map();

  const updateUrl = () => {
    const next = new URLSearchParams();
    const query = input?.value.trim() || '';
    if (active !== 'all') next.set('section', active);
    if (query) next.set('q', query);
    const url = next.toString() ? `${window.location.pathname}?${next}` : window.location.pathname;
    history.replaceState(null, '', url);
  };

  const rowMatchesFilter = row => {
    if (active === 'all') return true;
    const section = row.dataset.section || '';
    const type = row.dataset.type || '';
    const locations = normalize(row.dataset.locations);
    const topics = normalize(row.dataset.topics);

    if (active === 'assessment') return type === 'assessment' || section === 'assessment';
    if (active === 'law') return type === 'guide' || section === 'law';
    if (active === 'warcrimes') return type === 'dossier' || section === 'warcrimes';
    if (active === 'kremennaya') return section === 'kremennaya' || locations.includes('кременная');
    if (active === 'lnr') return section === 'lnr' || locations.includes('лнр');
    if (active === 'civilian-impact') return section === 'civilian-impact' || topics.includes('civilian-impact');
    return section === active || type === active;
  };

  const apply = () => {
    rows = [...listRoot.querySelectorAll('.archive-list li')];
    const query = normalize(input?.value);
    const words = query.split(' ').filter(Boolean);
    let visible = 0;

    rows.forEach(row => {
      const haystack = normalize(`${row.dataset.search || row.textContent} ${extraSearchByUrl.get(row.dataset.url) || ''}`);
      const textMatch = !words.length || words.every(word => haystack.includes(word));
      const categoryMatch = rowMatchesFilter(row);
      row.hidden = !(categoryMatch && textMatch);
      if (!row.hidden) visible += 1;
    });

    listRoot.querySelectorAll('.archive-group').forEach(group => {
      group.hidden = ![...group.querySelectorAll('li')].some(row => !row.hidden);
    });

    buttons.forEach(button => {
      button.setAttribute('aria-pressed', String((button.dataset.filter || 'all') === active));
    });

    const filterLabel = active === 'all'
      ? ''
      : ` · ${buttons.find(button => button.dataset.filter === active)?.textContent.trim() || active}`;
    if (status) {
      status.textContent = visible
        ? `Показано материалов: ${visible} из ${rows.length}${filterLabel}`
        : 'По выбранным условиям материалы не найдены. Очистите поиск или сбросьте фильтр.';
    }

    if (reset) reset.hidden = active === 'all' && !(input?.value.trim());
    updateUrl();
  };

  const renderArchive = (pages, searchByUrl) => {
    const sorted = [...pages]
      .filter(item => item && item.url && item.title && item.datePublished)
      .sort((a, b) => String(b.datePublished).localeCompare(String(a.datePublished)) || String(a.title).localeCompare(String(b.title), 'ru'));

    const groups = new Map();
    sorted.forEach(item => {
      const key = String(item.datePublished).slice(0, 7);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    });

    listRoot.innerHTML = [...groups.entries()].map(([, items]) => {
      const first = items[0];
      const rowsHtml = items.map(item => {
        const searchItem = searchByUrl.get(item.url) || {};
        const topics = Array.isArray(item.topics) ? item.topics.join(' ') : '';
        const locations = Array.isArray(item.locations) ? item.locations.join(' ') : '';
        const searchText = [
          item.title,
          item.excerpt,
          item.period,
          topics,
          locations,
          SECTION_LABELS[item.section],
          TYPE_LABELS[item.type],
          searchItem.description
        ].filter(Boolean).join(' ');
        return `<li data-id="${escapeHtml(item.id)}" data-url="${escapeHtml(item.url)}" data-section="${escapeHtml(item.section)}" data-type="${escapeHtml(item.type)}" data-year="${escapeHtml(String(item.datePublished).slice(0, 4))}" data-topics="${escapeHtml(topics)}" data-locations="${escapeHtml(locations)}" data-search="${escapeHtml(searchText)}">
          <time datetime="${escapeHtml(item.datePublished)}">${escapeHtml(formatDate(item.datePublished))}</time>
          <span>${escapeHtml(TYPE_LABELS[item.type] || 'Материал')}</span>
          <a href="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a>
        </li>`;
      }).join('');
      return `<section class="archive-group"><h2>${escapeHtml(monthTitle(first.datePublished))}</h2><ol class="archive-list">${rowsHtml}</ol></section>`;
    }).join('');
  };

  buttons.forEach(button => button.addEventListener('click', () => {
    const next = button.dataset.filter || 'all';
    active = next === active && next !== 'all' ? 'all' : next;
    apply();
  }));

  input?.addEventListener('input', apply);
  reset?.addEventListener('click', () => {
    active = 'all';
    if (input) input.value = '';
    apply();
    input?.focus();
  });

  window.addEventListener('popstate', () => window.location.reload());

  Promise.allSettled([
    fetch('/data/pages.json', { credentials: 'same-origin', cache: 'no-store' }).then(response => {
      if (!response.ok) throw new Error(`pages.json: HTTP ${response.status}`);
      return response.json();
    }),
    fetch('/data/search-index.json', { credentials: 'same-origin', cache: 'no-store' }).then(response => {
      if (!response.ok) throw new Error(`search-index.json: HTTP ${response.status}`);
      return response.json();
    })
  ]).then(([pagesResult, searchResult]) => {
    if (pagesResult.status === 'fulfilled' && Array.isArray(pagesResult.value)) {
      const searchByUrl = new Map(
        searchResult.status === 'fulfilled' && Array.isArray(searchResult.value)
          ? searchResult.value.map(item => [item.url, item])
          : []
      );
      extraSearchByUrl = new Map([...searchByUrl.entries()].map(([url, item]) => [url, `${item.description || ''} ${item.text || ''}`]));
      renderArchive(pagesResult.value, searchByUrl);
    }
    apply();
  }).catch(() => apply());
})();
