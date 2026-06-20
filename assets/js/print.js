(() => {
  const article = document.querySelector('article.article');
  if (!article || article.querySelector('.print-meta')) return;
  const canonical = document.querySelector('link[rel="canonical"]')?.href || window.location.href;
  const date = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  const meta = document.createElement('p');
  meta.className = 'print-meta';
  meta.textContent = `Источник: ${canonical} · Дата печати: ${date}`;
  article.appendChild(meta);
})();
