(() => {
  const containers = [...document.querySelectorAll('[data-catalog]')]
    .filter(element => element.dataset.catalog !== 'archive');
  if (!containers.length) return;

  const SECTION_LABELS = {
    kremennaya: 'Кременная',
    svo: 'СВО',
    law: 'Справочник',
    lnr: 'ЛНР',
    'civilian-impact': 'Гражданские последствия',
    politics: 'Политика',
    warcrimes: 'Досье',
    assessment: 'Оценки фронта'
  };

  const TYPE_LABELS = {
    article: 'Материал',
    guide: 'Практическая памятка',
    assessment: 'Оценка фронта',
    dossier: 'CASE FILE'
  };

  const HOME_LIMITS = {
    important: 3,
    assessment: 1,
    kremennaya: 3,
    guide: 3,
    dossier: 2
  };

  const escapeHtml = value => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const formatDate = value => {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return String(value || '');
    const [, year, month, day] = match;
    const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    return `${Number(day)} ${months[Number(month) - 1]} ${year} года`;
  };

  const sortNewest = (a, b) => {
    const date = String(b.datePublished || '').localeCompare(String(a.datePublished || ''));
    if (date) return date;
    return String(a.title || '').localeCompare(String(b.title || ''), 'ru');
  };

  const cardUrl = card => card.querySelector('h2 a, h3 a')?.getAttribute('href') || '';

  const createCard = item => {
    const section = SECTION_LABELS[item.section] || item.section || 'Материалы';
    const type = TYPE_LABELS[item.type] || item.type || 'Материал';
    const topics = Array.isArray(item.topics) ? item.topics.join(' ') : '';
    const derived = value => {
      const match = String(value || '').match(/^\/assets\/img\/(.+)\.([a-z0-9]+)$/i);
      if (!match) return [];
      return [480, 960].map(width => `/assets/img/derived/${match[1]}-${width}.webp`);
    };
    const responsive = derived(item.image);
    const image = item.image
      ? `<img src="${escapeHtml(item.image)}"${responsive.length ? ` srcset="${escapeHtml(responsive[0])} 480w, ${escapeHtml(responsive[1])} 960w"` : ''} alt="${escapeHtml(item.imageAlt || '')}" width="640" height="360" loading="lazy" decoding="async" sizes="(max-width: 640px) calc(100vw - 1.25rem), (max-width: 900px) calc(50vw - 2rem), 370px">`
      : '';
    const template = document.createElement('template');
    template.innerHTML = `<article class="material-card" data-section="${escapeHtml(item.section)}" data-type="${escapeHtml(item.type)}"${topics ? ` data-topics="${escapeHtml(topics)}"` : ''}>
      ${image}
      <div class="material-card__body">
        <p class="eyebrow">${escapeHtml(type)} · ${escapeHtml(section)}</p>
        <h2><a href="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a></h2>
        <p>${escapeHtml(item.excerpt || '')}</p>
        <p class="card-meta"><time datetime="${escapeHtml(item.datePublished)}">${escapeHtml(formatDate(item.datePublished))}</time></p>
      </div>
    </article>`;
    return template.content.firstElementChild;
  };

  const selectHome = (pages, group) => {
    if (group === 'assessment') {
      return pages.filter(item => item.type === 'assessment').sort(sortNewest).slice(0, 1);
    }

    const explicit = pages
      .filter(item => item.home && Number.isFinite(Number(item.home[group])))
      .sort((a, b) => Number(a.home[group]) - Number(b.home[group]));
    if (explicit.length) return explicit.slice(0, HOME_LIMITS[group] || explicit.length);

    let fallback = pages;
    if (group === 'kremennaya') fallback = pages.filter(item => item.section === 'kremennaya');
    if (group === 'guide') fallback = pages.filter(item => item.type === 'guide');
    if (group === 'dossier') fallback = pages.filter(item => item.type === 'dossier');
    if (group === 'important') fallback = pages.filter(item => item.type === 'article' && item.section !== 'politics');
    return fallback.sort(sortNewest).slice(0, HOME_LIMITS[group] || 3);
  };

  const selectItems = (pages, key) => {
    if (key === 'news') return pages.filter(item => item.type === 'article' || item.type === 'guide').sort(sortNewest);
    if (key.startsWith('section:')) {
      const section = key.slice('section:'.length);
      return pages.filter(item => item.section === section).sort(sortNewest);
    }
    if (key.startsWith('type:')) {
      const type = key.slice('type:'.length);
      return pages.filter(item => item.type === type).sort(sortNewest);
    }
    if (key.startsWith('chronicle:')) {
      const section = key.slice('chronicle:'.length);
      return pages.filter(item => item.section === section).sort(sortNewest);
    }
    if (key.startsWith('home:')) return selectHome(pages, key.slice('home:'.length));
    return [];
  };

  const renderContainer = (container, pages) => {
    const key = container.dataset.catalog || '';
    const items = selectItems(pages, key);
    if (!items.length) return;

    if (container.matches('article.material-card')) {
      const replacement = createCard(items[0]);
      replacement.dataset.catalog = key;
      container.replaceWith(replacement);
      return;
    }

    const existing = new Map(
      [...container.querySelectorAll(':scope > article.material-card')]
        .map(card => [cardUrl(card), card])
        .filter(([url]) => url)
    );

    const fragment = document.createDocumentFragment();
    items.forEach(item => {
      const card = existing.get(item.url) || createCard(item);
      card.dataset.section = item.section || '';
      card.dataset.type = item.type || '';
      if (Array.isArray(item.topics) && item.topics.length) {
        card.dataset.topics = item.topics.join(' ');
      } else {
        delete card.dataset.topics;
      }
      fragment.append(card);
    });
    container.replaceChildren(fragment);
  };

  fetch('/data/pages.json', { credentials: 'same-origin', cache: 'no-store' })
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(data => {
      if (!Array.isArray(data)) throw new Error('pages.json должен содержать массив');
      const pages = data.filter(item => item && item.url && item.title && item.datePublished);
      containers.forEach(container => renderContainer(container, pages));

      const latestAssessment = pages.filter(item => item.type === 'assessment').sort(sortNewest)[0];
      if (latestAssessment) {
        document.querySelectorAll('a.button').forEach(link => {
          if (link.textContent.trim() === 'Последняя оценка') link.href = latestAssessment.url;
        });
      }
      document.dispatchEvent(new CustomEvent('krm:catalog-ready'));
    })
    .catch(error => {
      console.warn('Каталог KRM РФ не обновлён из pages.json; используется статическая HTML-версия.', error);
      document.dispatchEvent(new CustomEvent('krm:catalog-ready'));
    });
})();
