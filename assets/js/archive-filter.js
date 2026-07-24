(() => {
  'use strict';

  const listRoot = document.getElementById('archive-list');
  if (!listRoot) return;

  const controls = [...document.querySelectorAll('[data-filter-group][data-filter-value]')];
  const input = document.getElementById('archive-search');
  const status = document.getElementById('archive-status');
  const reset = document.getElementById('archive-reset');
  const rows = [...listRoot.querySelectorAll('.archive-list li')];
  const state = { type: '', section: '', location: '' };
  let fullTextEngine = null;
  let fullTextUrls = null;
  let searchIndexPromise = null;

  const normalize = value => String(value || '')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[–—-]/g, ' ')
    .replace(/[^a-zа-я0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const readUrl = () => {
    const params = new URLSearchParams(window.location.search);
    for (const group of Object.keys(state)) {
      const value = params.get(group) || '';
      const allowed = controls.some(control => (
        control.dataset.filterGroup === group && control.dataset.filterValue === value
      ));
      state[group] = allowed ? value : '';
    }
    if (input) input.value = params.get('q') || '';
  };

  const writeUrl = ({ push = false } = {}) => {
    const params = new URLSearchParams();
    for (const [group, value] of Object.entries(state)) if (value) params.set(group, value);
    const query = input?.value.trim() || '';
    if (query) params.set('q', query);
    const next = params.size ? `${window.location.pathname}?${params}` : window.location.pathname;
    history[push ? 'pushState' : 'replaceState']({ ...state, q: query }, '', next);
  };

  const matchesCategory = (row, candidate = state) => {
    if (candidate.type && row.dataset.type !== candidate.type) return false;
    if (candidate.section && row.dataset.section !== candidate.section) return false;
    if (candidate.location) {
      const locations = String(row.dataset.locations || '').split('|').map(normalize).filter(Boolean);
      if (!locations.includes(normalize(candidate.location))) return false;
    }
    return true;
  };

  const matchesText = row => {
    const terms = normalize(input?.value).split(' ').filter(Boolean);
    if (!terms.length) return true;
    const haystack = normalize(row.dataset.search || row.textContent);
    if (terms.every(term => haystack.includes(term))) return true;
    return fullTextUrls ? fullTextUrls.has(row.dataset.url) : false;
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
      .map(control => control.dataset.filterLabel || control.textContent.trim());

    if (status) {
      status.textContent = visible
        ? `Показано материалов: ${visible} из ${rows.length}${activeLabels.length ? ` · ${activeLabels.join(' · ')}` : ''}`
        : 'По выбранным условиям материалы не найдены. Измените запрос или сбросьте фильтры.';
    }

    if (reset) reset.hidden = !Object.values(state).some(Boolean) && !(input?.value.trim());
    updateCounts();
    if (updateHistory) writeUrl({ push });
  };

  const ensureFullTextIndex = () => {
    if (searchIndexPromise) return searchIndexPromise;
    searchIndexPromise = fetch('/data/search-index.json', { credentials: 'same-origin' })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(payload => {
        if (!window.KRMSearchIndex) throw new Error('Поисковый модуль не загружен');
        fullTextEngine = window.KRMSearchIndex.create(payload);
        fullTextUrls = fullTextEngine.urls(input?.value || '');
      })
      .catch(error => {
        console.warn('Полнотекстовый индекс архива недоступен:', error);
      });
    return searchIndexPromise;
  };

  const refreshFullTextMatches = () => {
    fullTextUrls = fullTextEngine ? fullTextEngine.urls(input?.value || '') : null;
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
    inputTimer = setTimeout(async () => {
      apply({ updateHistory: true });
      if (normalize(input.value).length >= 2) {
        await ensureFullTextIndex();
        refreshFullTextMatches();
        apply();
      }
    }, 120);
  });

  reset?.addEventListener('click', () => {
    Object.keys(state).forEach(key => { state[key] = ''; });
    if (input) input.value = '';
    apply({ updateHistory: true, push: true });
    input?.focus();
  });

  window.addEventListener('popstate', async () => {
    readUrl();
    if (normalize(input?.value).length >= 2) {
      await ensureFullTextIndex();
      refreshFullTextMatches();
    } else {
      fullTextUrls = null;
    }
    apply();
  });

  readUrl();
  apply();
  if (normalize(input?.value).length >= 2) ensureFullTextIndex().then(() => {
    refreshFullTextMatches();
    apply();
  });
})();
