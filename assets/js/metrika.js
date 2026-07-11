(function initYandexMetrika(windowObject, documentObject, tagName, source, functionName, script, firstScript) {
  windowObject[functionName] = windowObject[functionName] || function queueMetrikaCall() {
    (windowObject[functionName].a = windowObject[functionName].a || []).push(arguments);
  };
  windowObject[functionName].l = Date.now();

  for (const existing of documentObject.scripts) {
    if (existing.src === source) return;
  }

  script = documentObject.createElement(tagName);
  firstScript = documentObject.getElementsByTagName(tagName)[0];
  script.async = true;
  script.src = source;
  firstScript.parentNode.insertBefore(script, firstScript);
})(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js?id=110383043', 'ym');

window.ym(110383043, 'init', {
  ssr: true,
  webvisor: false,
  clickmap: false,
  accurateTrackBounce: true,
  trackLinks: true
});
