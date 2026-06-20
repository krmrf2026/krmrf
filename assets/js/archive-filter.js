(() => {
  const controls = [...document.querySelectorAll('[data-filter-group][data-filter-value]')];
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
    assessment: 'Оценки фронта'
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

  const state = { type: '', section: '', location: '' };
  let rows = [];
  let extraSearchByUrl = new Map();
  let hydrated = false;

  const readUrl = () => {
    const params = new URLSearchParams(window.location.search);
    for (const group of Object.keys(state)) {
      const value = params.get(group) || '';
      const allowed = controls.some(control => control.dataset.filterGroup === group && control.dataset.filterValue === value);
      state[group] = allowed ? value : '';
    }
    if (input) input.value = params.get('q') || '';
  };

  const writeUrl = ({ push = false } = {}) => {
    const params = new URLSearchParams();
    for (const [group, value] of Object.entries(state)) if (value) params.set(group, value);
    const query = input?.value.trim() || '';
    if (query) params.set('q', query);
    const url = params.toString() ? `${window.location.pathname}?${params}` : window.location.pathname;
    const method = push ? 'pushState' : 'replaceState';
    history[method]({ ...state, q: query }, '', url);
  };

  const matchesCategory = (row, candidate = state) => {
    if (candidate.type && row.dataset.type !== candidate.type) return false;
    if (candidate.section && row.dataset.section !== candidate.section) return false;
    if (candidate.location) {
      const locations = String(row.dataset.locations || '').split('|').map(normalize).filter(Boolean);
      const target = normalize(candidate.location);
      if (!locations.includes(target)) return false;
    }
    return true;
  };

  const matchesText = row => {
    const words = normalize(input?.value).split(' ').filter(Boolean);
    if (!words.length) return true;
    const haystack = normalize(`${row.dataset.search || row.textContent} ${extraSearchByUrl.get(row.dataset.url) || ''}`);
    return words.every(word => haystack.includes(word));
  };

  const updateCounts = () => {
    controls.forEach(control => {
      const group = control.dataset.filterGroup;
      const value = control.dataset.filterValue;
      const candidate = { ...state, [group]: value };
      const count = rows.filter(row => matchesText(row) && matchesCategory(row, candidate)).length;
      const countEl = control.querySelector('.filter-count');
      if (countEl) countEl.textContent = String(count);
      control.disabled = count === 0 && state[group] !== value;
    });
  };

  const apply = ({ updateHistory = false, push = false } = {}) => {
    rows = [...listRoot.querySelectorAll('.archive-list li')];
    let visible = 0;

    rows.forEach(row => {
      row.hidden = !(matchesCategory(row) && matchesText(row));
      if (!row.hidden) visible += 1;
    });

    listRoot.querySelectorAll('.archive-group').forEach(group => {
      group.hidden = ![...group.querySelectorAll('li')].some(row => !row.hidden);
    });

    controls.forEach(control => {
      const active = state[control.dataset.filterGroup] === control.dataset.filterValue;
      control.setAttribute('aria-pressed', String(active));
    });

    const activeLabels = controls
      .filter(control => control.getAttribute('aria-pressed') === 'true')
      .map(control => control.dataset.filterLabel || control.childNodes[0]?.textContent?.trim() || control.textContent.trim());

    if (status) {
      status.textContent = visible
        ? `Показано материалов: ${visible} из ${rows.length}${activeLabels.length ? ` · ${activeLabels.join(' · ')}` : ''}`
        : 'По выбранным условиям материалы не найдены. Измените запрос или сбросьте фильтры.';
    }

    if (reset) reset.hidden = !Object.values(state).some(Boolean) && !(input?.value.trim());
    updateCounts();
    if (updateHistory) writeUrl({ push });
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
      const rowsHtml = items.map(item => {
        const searchItem = searchByUrl.get(item.url) || {};
        const topics = Array.isArray(item.topics) ? item.topics.join(' ') : '';
        const locations = Array.isArray(item.locations) ? item.locations.join('|') : '';
        const searchText = [item.title, item.excerpt, item.period, topics, Array.isArray(item.locations) ? item.locations.join(' ') : '',
          SECTION_LABELS[item.section], TYPE_LABELS[item.type], searchItem.description, searchItem.text]
          .filter(Boolean).join(' ');
        return `<li data-id="${escapeHtml(item.id)}" data-url="${escapeHtml(item.url)}" data-section="${escapeHtml(item.section)}" data-type="${escapeHtml(item.type)}" data-year="${escapeHtml(String(item.datePublished).slice(0, 4))}" data-topics="${escapeHtml(topics)}" data-locations="${escapeHtml(locations)}" data-search="${escapeHtml(searchText)}">
          <time datetime="${escapeHtml(item.datePublished)}">${escapeHtml(formatDate(item.datePublished))}</time>
          <span>${escapeHtml(TYPE_LABELS[item.type] || 'Материал')}</span>
          <a href="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a>
        </li>`;
      }).join('');
      return `<section class="archive-group"><h2>${escapeHtml(monthTitle(items[0].datePublished))}</h2><ol class="archive-list">${rowsHtml}</ol></section>`;
    }).join('');
    hydrated = true;
  };

  controls.forEach(control => control.addEventListener('click', () => {
    const group = control.dataset.filterGroup;
    const value = control.dataset.filterValue;
    state[group] = state[group] === value ? '' : value;
    apply({ updateHistory: true, push: true });
  }));

  let inputTimer;
  input?.addEventListener('input', () => {
    clearTimeout(inputTimer);
    inputTimer = setTimeout(() => apply({ updateHistory: true }), 120);
  });

  reset?.addEventListener('click', () => {
    Object.keys(state).forEach(key => { state[key] = ''; });
    if (input) input.value = '';
    apply({ updateHistory: true, push: true });
    input?.focus();
  });

  window.addEventListener('popstate', () => {
    readUrl();
    apply();
  });

  readUrl();

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

  if (!hydrated) apply();
})();
