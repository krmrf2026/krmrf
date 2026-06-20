(() => {
  const buttons = [...document.querySelectorAll('[data-filter]')];
  const cards = [...document.querySelectorAll('.material-card')];
  if (!buttons.length || !cards.length) return;
  const status = document.getElementById('chronicle-filter-status');

  const apply = filter => {
    let visible = 0;
    cards.forEach(card => {
      const values = `${card.dataset.section || ''} ${card.dataset.topics || ''}`.trim().split(/\s+/);
      card.hidden = filter !== 'all' && !values.includes(filter);
      if (!card.hidden) visible += 1;
    });
    if (status) status.textContent = `Показано материалов: ${visible} из ${cards.length}`;
  };

  buttons.forEach(button => button.addEventListener('click', () => {
    const filter = button.dataset.filter || 'all';
    buttons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    apply(filter);
  }));

  apply('all');
})();
