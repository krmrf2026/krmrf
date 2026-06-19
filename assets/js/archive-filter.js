(() => {
  const buttons = [...document.querySelectorAll('[data-filter]')];
  const rows = [...document.querySelectorAll('.archive-list li')];
  if (!buttons.length || !rows.length) return;
  buttons.forEach(button => button.addEventListener('click', () => {
    const filter = button.dataset.filter;
    buttons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    rows.forEach(row => {
      const match = filter === 'all' || row.dataset.section === filter || row.dataset.type === filter;
      row.hidden = !match;
    });
    document.querySelectorAll('.archive-group').forEach(group => {
      group.hidden = ![...group.querySelectorAll('li')].some(row => !row.hidden);
    });
  }));
})();
