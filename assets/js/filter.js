(() => {
  const buttons = [...document.querySelectorAll('[data-filter]')];
  const cards = [...document.querySelectorAll('.material-card')];
  if (!buttons.length || !cards.length) return;
  buttons.forEach(button => button.addEventListener('click', () => {
    const filter = button.dataset.filter;
    buttons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    cards.forEach(card => { card.hidden = filter !== 'all' && card.dataset.section !== filter; });
  }));
})();
