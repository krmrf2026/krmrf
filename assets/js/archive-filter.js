(() => {
  const buttons = [...document.querySelectorAll('[data-filter]')];
  const rows = [...document.querySelectorAll('.archive-list li')];
  const input = document.getElementById('archive-search');
  const status = document.getElementById('archive-status');
  if (!rows.length) return;

  const params = new URLSearchParams(window.location.search);
  const allowed = new Set(buttons.map(button => button.dataset.filter || 'all'));
  let active = allowed.has(params.get('section')) ? params.get('section') : 'all';
  if (input && params.get('q')) input.value = params.get('q');

  const normalize = value => String(value || '').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').trim();
  const updateUrl = () => {
    const next = new URLSearchParams();
    const query = input?.value.trim() || '';
    if (active !== 'all') next.set('section', active);
    if (query) next.set('q', query);
    const suffix = next.toString() ? `?${next}` : window.location.pathname;
    history.replaceState(null, '', next.toString() ? `${window.location.pathname}?${next}` : window.location.pathname);
  };

  const apply = () => {
    const query = normalize(input?.value);
    let visible = 0;
    rows.forEach(row => {
      const categoryMatch = active === 'all' || row.dataset.section === active || row.dataset.type === active;
      const textMatch = !query || normalize(row.textContent).includes(query);
      row.hidden = !(categoryMatch && textMatch);
      if (!row.hidden) visible += 1;
    });
    document.querySelectorAll('.archive-group').forEach(group => {
      group.hidden = ![...group.querySelectorAll('li')].some(row => !row.hidden);
    });
    buttons.forEach(button => button.setAttribute('aria-pressed', String((button.dataset.filter || 'all') === active)));
    if (status) status.textContent = visible
      ? `Показано материалов: ${visible} из ${rows.length}`
      : 'По выбранным условиям материалы не найдены.';
    updateUrl();
  };

  buttons.forEach(button => button.addEventListener('click', () => {
    active = button.dataset.filter || 'all';
    apply();
  }));
  input?.addEventListener('input', apply);
  window.addEventListener('popstate', () => window.location.reload());
  apply();
})();
