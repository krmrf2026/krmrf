(() => {
  const buttons = [...document.querySelectorAll('[data-filter]')];
  if (!buttons.length) return;
  const status = document.getElementById('chronicle-filter-status');
  let active = buttons.find(button => button.getAttribute('aria-pressed') === 'true')?.dataset.filter || 'all';

  const apply = filter => {
    active = filter || 'all';
    const cards = [...document.querySelectorAll('.material-grid .material-card')];
    let visible = 0;
    cards.forEach(card => {
      const values = `${card.dataset.section || ''} ${card.dataset.type || ''} ${card.dataset.topics || ''}`
        .trim().split(/\s+/).filter(Boolean);
      card.hidden = active !== 'all' && !values.includes(active);
      if (!card.hidden) visible += 1;
    });
    buttons.forEach(button => {
      button.setAttribute('aria-pressed', String((button.dataset.filter || 'all') === active));
    });
    if (status) status.textContent = `Показано материалов: ${visible} из ${cards.length}`;
  };

  buttons.forEach(button => button.addEventListener('click', () => {
    apply(button.dataset.filter || 'all');
  }));

  document.addEventListener('krm:catalog-ready', () => apply(active));
  apply(active);
})();
