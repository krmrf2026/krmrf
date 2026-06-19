(() => {
  const form = document.querySelector('.search-form');
  const input = document.getElementById('site-search');
  const results = document.getElementById('search-results');
  const status = document.getElementById('search-status');
  if (!form || !input || !results || !status) return;
  let index = [];
  const normalize = value => value.toLocaleLowerCase('ru').replace(/ё/g, 'е');
  const render = query => {
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    const found = !terms.length ? [] : index.map(item => {
      const haystack = normalize([item.title,item.description,item.section,item.type,item.text].join(' '));
      const score = terms.reduce((sum, term) => sum + (normalize(item.title).includes(term) ? 5 : 0) + (haystack.includes(term) ? 1 : -50), 0);
      return {item,score};
    }).filter(x => x.score >= terms.length).sort((a,b) => b.score-a.score || b.item.date.localeCompare(a.item.date)).slice(0,50);
    status.textContent = terms.length ? `Найдено: ${found.length}` : 'Введите запрос.';
    results.replaceChildren(...found.map(({item}) => {
      const article = document.createElement('article');
      article.className = 'search-result';
      const meta = document.createElement('p'); meta.className='eyebrow'; meta.textContent=`${item.type} · ${item.section} · ${item.date}`;
      const h2 = document.createElement('h2'); const a=document.createElement('a'); a.href=item.url; a.textContent=item.title; h2.append(a);
      const p=document.createElement('p'); p.textContent=item.description;
      article.append(meta,h2,p); return article;
    }));
  };
  fetch('/data/search-index.json').then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }).then(data => {
    index = Array.isArray(data) ? data : [];
    const initial = new URLSearchParams(location.search).get('q') || '';
    if (initial) { input.value=initial; render(initial); }
    else status.textContent=`В индексе ${index.length} материалов.`;
  }).catch(() => { status.textContent='Поисковый индекс недоступен. Используйте полный архив.'; });
  form.addEventListener('submit', event => { event.preventDefault(); const q=input.value.trim(); history.replaceState(null,'',q?`?q=${encodeURIComponent(q)}`:location.pathname); render(q); });
})();
