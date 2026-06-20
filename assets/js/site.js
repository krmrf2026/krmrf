(() => {
  const button = document.querySelector('.nav-toggle');
  const nav = document.getElementById('site-navigation');
  if (!button || !nav) return;
  const close = () => { button.setAttribute('aria-expanded', 'false'); nav.classList.remove('is-open'); };
  button.addEventListener('click', () => {
    const expanded = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!expanded));
    nav.classList.toggle('is-open', !expanded);
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { close(); button.focus(); } });
  window.addEventListener('resize', () => { if (window.innerWidth > 900) close(); });
})();
