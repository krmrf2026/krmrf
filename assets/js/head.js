document.documentElement.classList.replace('no-js', 'js');
if (window.location.hostname.endsWith('.pages.dev')) {
  const robots = document.createElement('meta');
  robots.name = 'robots';
  robots.content = 'noindex, nofollow, noarchive';
  document.head.appendChild(robots);
}

// Keep old shared links readable without leaving free text in subsequent URLs.
if (/^\/(search|archive)\/?$/.test(location.pathname)) {
  const entry = new URL(location.href);
  if (entry.searchParams.has('q')) {
    window.KRMPrivateEntry = true;
    const q = (entry.searchParams.get('q') || '').slice(0, 100);
    entry.searchParams.delete('q');
    history.replaceState({ ...history.state, q }, '', entry);
  }
}
