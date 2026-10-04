(() => {
  'use strict';
  const ID = 110383043;
  const tag = `https://mc.yandex.ru/metrika/tag.js?id=${ID}`;
  window.ym = window.ym || function (...args) { (window.ym.a = window.ym.a || []).push(args); };
  window.ym.l ||= Date.now();
  if (!document.querySelector(`script[src="${tag}"]`)) {
    const script = document.createElement('script');
    script.async = true; script.src = tag; document.head.appendChild(script);
  }
  window.ym(ID, 'init', { ssr: true, webvisor: false, clickmap: false, accurateTrackBounce: true, trackLinks: true });

  const goal = (name, params = {}) => {
    const clean = Object.fromEntries(Object.entries(params)
      .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
      .map(([key, value]) => [String(key).slice(0, 40), typeof value === 'string' ? value.slice(0, 120) : value]));
    try { window.ym(ID, 'reachGoal', String(name || '').slice(0, 40), clean); } catch {}
  };
  window.KRMAnalytics = Object.freeze({ goal });

  const placement = link => link.closest('.site-header') ? 'header'
    : link.closest('.site-footer') ? 'footer'
      : link.closest('.series-nav') ? 'series_nav'
        : link.closest('article.article') ? 'article' : 'page';

  document.addEventListener('click', event => {
    const link = event.target?.closest?.('a[href]');
    if (!link) return;
    let url; try { url = new URL(link.href, location.href); } catch { return; }
    const place = placement(link);

    if (url.hostname === 't.me' || url.hostname === 'max.ru') {
      goal('channel_click', { channel: url.hostname === 't.me' ? 'telegram' : 'max', placement: place });
    }
    if (link.closest('.source-list, li[id^="src-"]') && url.origin !== location.origin) {
      goal('source_click', { host: url.hostname, placement: place });
    }
    if (url.origin !== location.origin || url.pathname === location.pathname) return;
    if (location.pathname === '/') goal('home_route', { target: url.pathname, placement: place });
    if (link.closest('article.article')) goal('content_continue', { target: url.pathname, placement: place });
  });

  const article = document.querySelector('article.article');
  if (!article || !document.body?.matches('.page--article, .page--guide, .page--assessment, .page--dossier')) return;

  const fired = new Set();
  let scheduled = false;
  const check = () => {
    scheduled = false;
    const rect = article.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (innerHeight - rect.top) / Math.max(1, rect.height)));
    for (const threshold of [50, 90]) if (ratio >= threshold / 100 && !fired.has(threshold)) {
      fired.add(threshold);
      goal('read_depth', { percent: threshold });
      goal(`read_${threshold}`, { percent: threshold });
    }
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true; requestAnimationFrame(check);
  };
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule, { passive: true });
  addEventListener('load', schedule, { once: true });
})();
