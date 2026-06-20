(() => {
  const button = document.querySelector('.nav-toggle');
  const nav = document.getElementById('site-navigation');
  if (!button || !nav) return;

  const isOpen = () => button.getAttribute('aria-expanded') === 'true';
  const close = ({ returnFocus = false } = {}) => {
    const wasOpen = isOpen();
    button.setAttribute('aria-expanded', 'false');
    nav.classList.remove('is-open');
    if (returnFocus && wasOpen) button.focus();
  };

  button.addEventListener('click', () => {
    const expanded = isOpen();
    button.setAttribute('aria-expanded', String(!expanded));
    nav.classList.toggle('is-open', !expanded);
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && isOpen()) close({ returnFocus: true });
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 900 && isOpen()) close();
  });
})();
