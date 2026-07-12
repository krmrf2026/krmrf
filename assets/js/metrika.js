(() => {
  'use strict';

  const counterId = 110383043;
  const tagUrl = `https://mc.yandex.ru/metrika/tag.js?id=${counterId}`;

  window.ym = window.ym || function (...args) {
    (window.ym.a = window.ym.a || []).push(args);
  };

  window.ym.l = Date.now();

  if (!document.querySelector(`script[src="${tagUrl}"]`)) {
    const script = document.createElement('script');
    script.async = true;
    script.src = tagUrl;
    document.head.appendChild(script);
  }

  window.ym(counterId, 'init', {
    ssr: true,
    webvisor: false,
    clickmap: false,
    accurateTrackBounce: true,
    trackLinks: true
  });
})();
