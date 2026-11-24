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

(() => {
  const button = document.querySelector('[data-share-query]');
  if (!button) return;
  const field = document.getElementById(button.dataset.shareQuery);
  const status = document.querySelector('[data-share-status]');
  if (!field || !status) return;
  button.hidden = false;
  button.addEventListener('click', async () => {
    const url = new URL(location.href);
    const q = field.value.trim().slice(0, 100);
    if (q) url.searchParams.set('q', q);
    try {
      await navigator.clipboard.writeText(url.href);
      status.textContent = 'Ссылка скопирована.';
    } catch {
      // A selectable local input also works when clipboard access is unavailable.
      const copy = document.createElement('input');
      copy.readOnly = true;
      copy.value = url.href;
      copy.setAttribute('aria-label', 'Ссылка для копирования');
      status.replaceChildren(copy);
      copy.focus();
      copy.select();
    }
  });
})();
