(() => {
  'use strict';
  const counterId = 110383043;
  const tagUrl = `https://mc.yandex.ru/metrika/tag.js?id=${counterId}`;
  window.ym = window.ym || function (...args) { (window.ym.a = window.ym.a || []).push(args); };
  window.ym.l ||= Date.now();
  if (!document.querySelector(`script[src="${tagUrl}"]`)) {
    const script = document.createElement('script'); script.async = true; script.src = tagUrl; document.head.appendChild(script);
  }
  window.ym(counterId, 'init', { ssr: true, webvisor: false, clickmap: false, accurateTrackBounce: true, trackLinks: true });

  const goal = (name, params = {}) => {
    const clean = Object.fromEntries(Object.entries(params).filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
      .map(([key, value]) => [String(key).slice(0, 40), typeof value === 'string' ? value.slice(0, 120) : value]));
    try { window.ym(counterId, 'reachGoal', String(name || '').slice(0, 40), clean); } catch {}
  };
  window.KRMAnalytics = Object.freeze({ goal });

  document.addEventListener('click', event => {
    const link = event.target?.closest?.('a[href]'); if (!link) return;
    let url; try { url = new URL(link.href, location.href); } catch { return; }
    if (url.hostname === 't.me' || url.hostname === 'max.ru') goal('channel_click', { channel: url.hostname === 't.me' ? 'telegram' : 'max' });
    else if (location.pathname === '/' && url.origin === location.origin) goal('home_route', { target: url.pathname });
  });

  if (document.querySelector('article.article')) {
    const fired = new Set(); let scheduled = false;
    const check = () => {
      scheduled = false;
      const max = Math.max(0, document.documentElement.scrollHeight - innerHeight);
      const ratio = max ? Math.min(1, Math.max(0, scrollY / max)) : 1;
      for (const threshold of [0.5, 0.9]) if (ratio >= threshold && !fired.has(threshold)) {
        fired.add(threshold); goal('read_depth', { percent: threshold * 100, path: location.pathname });
      }
    };
    addEventListener('scroll', () => { if (!scheduled) { scheduled = true; requestAnimationFrame(check); } }, { passive: true });
    addEventListener('load', check, { once: true });
  }
})();
