document.documentElement.classList.replace('no-js', 'js');
if (window.location.hostname.endsWith('.pages.dev')) {
  const robots = document.createElement('meta');
  robots.name = 'robots';
  robots.content = 'noindex, nofollow, noarchive';
  document.head.appendChild(robots);
}
