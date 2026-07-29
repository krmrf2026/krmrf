(() => {
  'use strict';

  const target = document.documentElement.dataset.redirectTarget;
  if (!target || !target.startsWith('/') || target.startsWith('//')) return;

  try {
    const destination = new URL(target, window.location.origin);
    if (destination.origin !== window.location.origin) return;
    if (!destination.search) destination.search = window.location.search;
    if (!destination.hash) destination.hash = window.location.hash;
    window.location.replace(destination.href);
  } catch {
    // The following meta refresh and visible link remain a no-JavaScript fallback.
  }
})();
