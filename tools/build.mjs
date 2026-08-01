import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { SITE_URL, SECTION_LABELS, TYPE_LABELS } from './lib/project.mjs';
import { syncHostingMeta } from './lib/hosting.mjs';

const ROOT = path.resolve(process.cwd());
const HOME_LIMITS = { important: 3, assessment: 1, kremennaya: 3, guide: 3, dossier: 2 };

const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const write = (file, content) => fs.writeFileSync(path.join(ROOT, file), content, 'utf8');
const exists = file => fs.existsSync(path.join(ROOT, file));
const readJson = file => JSON.parse(read(file));
const writeJson = (file, value) => write(file, `${JSON.stringify(value, null, 2)}\n`);
const writeCompactJson = (file, value) => write(file, `${JSON.stringify(value)}\n`);

const PUBLIC_HTML_SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'releases',
  'dist',
  'krmrf-releases',
  'test-results',
  'playwright-report'
]);

const listHtmlFiles = dir => {
  const files = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && PUBLIC_HTML_SKIP_DIRS.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...listHtmlFiles(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(path.relative(ROOT, fullPath));
    }
  }

  return files;
};

const syncAssetVersions = (html, version) => html
  .replace(
    /((?:href|src)=["']\/assets\/(?:css|js)\/[^"'?]+)(?:\?v=[^"']*)?(["'])/gi,
    (_whole, prefix, quote) => `${prefix}?v=${version}${quote}`
  )
  .replace(/\sdefer=(['"])(?:true)?\1/gi, ' defer');

const removeVisibleBuildMeta = html => html.replace(
  /<div\b[^>]*class=(["'])[^"']*\bsite-footer__meta\b[^"']*\1[^>]*>[\s\S]*?<\/div>/gi,
  ''
);

const syncAnalyticsMarkup = html => {
  const pixel = html.match(
    /<noscript><div><img\b(?=[^>]*\banalytics-noscript-pixel\b)[^>]*\/?><\/div><\/noscript>/i
  )?.[0];
  if (!pixel) return html;
  const withoutPixel = html.replace(pixel, '');
  return withoutPixel.replace(/(<body\b[^>]*>)/i, `$1${pixel}`);
};

const formatMapDateTime = value => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!match) return String(value || '');
  const [, year, month, day, hour, minute] = match;
  const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  return `${Number(day)} ${months[Number(month) - 1]} ${year} года, ${hour}:${minute}`;
};


const escapeHtml = value => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const escapeXml = escapeHtml;
const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const decodeEntities = value => String(value || '')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&#039;/g, "'")
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

const stripTags = html => decodeEntities(String(html || '')
  .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
  .replace(/<nav\b[\s\S]*?<\/nav>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim());

const attr = (tag, name) => {
  const match = tag.match(new RegExp(`\\b${escapeRegExp(name)}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i'));
  return match ? decodeEntities(match[2]) : '';
};

const metaContent = (html, name) => {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  const tag = tags.find(item => attr(item, 'name').toLowerCase() === name.toLowerCase());
  return tag ? attr(tag, 'content') : '';
};

const smartTrim = (value, limit = 155) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= limit) return text;
  const candidate = text.slice(0, limit + 1);
  const sentenceEnds = [...candidate.matchAll(/[.!?](?:\s|$)/g)].map(match => match.index + 1);
  if (sentenceEnds.length && sentenceEnds.at(-1) >= Math.floor(limit * 0.65)) {
    return candidate.slice(0, sentenceEnds.at(-1)).trim();
  }
  const clipped = candidate.slice(0, limit - 1)
    .replace(/\s+\S*$/, '')
    .replace(/[ ,;:–—-]+$/, '');
  return `${clipped}…`;
};

const replaceMeta = (html, attribute, key, value) => {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  const current = tags.find(tag => attr(tag, attribute).toLowerCase() === key.toLowerCase());
  const next = `<meta content="${escapeHtml(value)}" ${attribute}="${escapeHtml(key)}"/>`;
  if (current) return html.replace(current, next);
  return html.replace(/<\/title>/i, `</title>\n${next}`);
};

const replaceTitle = (html, value) => html.replace(
  /<title\b[^>]*>[\s\S]*?<\/title>/i,
  `<title>${escapeHtml(value)}</title>`
);

const searchTokens = value => {
  const tokens = String(value || '')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[–—-]/g, ' ')
    .replace(/[^a-zа-я0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(token => token.length > 1 || /^\d+$/.test(token));
  return [...new Set(tokens)].join(' ');
};

const formatDate = value => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(value || '');
  const [, year, month, day] = match;
  const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  return `${Number(day)} ${months[Number(month) - 1]} ${year} года`;
};

const formatArchiveDate = value => formatDate(value).replace(/ года$/, '');

const monthTitle = value => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})/);
  if (!match) return 'Без даты';
  const [, year, month] = match;
  const months = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  return `${months[Number(month) - 1]} ${year}`;
};

const sortNewest = (a, b) => String(b.datePublished || '').localeCompare(String(a.datePublished || ''))
  || String(a.title || '').localeCompare(String(b.title || ''), 'ru');

const urlToHtmlFile = url => {
  const clean = String(url || '').replace(/^\//, '').replace(/\/$/, '');
  return clean ? `${clean}/index.html` : 'index.html';
};

const derivedImageCandidates = (image, originalWidth) => {
  if (!image?.startsWith('/assets/img/')) return [];
  const rel = image.slice('/assets/img/'.length);
  const parsed = path.posix.parse(rel);
  return [480, 960].map(width => ({
    width,
    url: `/assets/img/derived/${parsed.dir ? `${parsed.dir}/` : ''}${parsed.name}-${width}.webp`
  })).filter(item => (
    (!originalWidth || item.width < originalWidth)
    && exists(item.url.replace(/^\//, ''))
  ));
};

const imageMarkup = item => {
  if (!item.image) return '';
  const candidates = derivedImageCandidates(item.image, item.imageWidth);
  const srcsetItems = candidates.map(entry => `${escapeHtml(entry.url)} ${entry.width}w`);
  if (candidates.length && item.imageWidth) {
    srcsetItems.push(`${escapeHtml(item.image)} ${item.imageWidth}w`);
  }
  const srcset = candidates.length
    ? ` srcset="${srcsetItems.join(', ')}"`
    : '';
  const sizes = candidates.length
    ? ' sizes="(max-width: 640px) calc(100vw - 1.25rem), (max-width: 900px) calc(50vw - 2rem), 370px"'
    : '';
  return `<img alt="${escapeHtml(item.imageAlt || '')}" decoding="async" height="360" loading="lazy"${sizes} src="${escapeHtml(item.image)}"${srcset} width="640"/>`;
};

const cardHtml = (item, catalogKey = '') => {
  const section = SECTION_LABELS[item.section] || item.section || 'Материалы';
  const type = TYPE_LABELS[item.type] || item.type || 'Материал';
  const topics = Array.isArray(item.topics) && item.topics.length
    ? ` data-topics="${escapeHtml(item.topics.join(' '))}"`
    : '';
  const catalog = catalogKey ? ` data-catalog="${escapeHtml(catalogKey)}"` : '';
  return `<article class="material-card"${catalog} data-section="${escapeHtml(item.section)}"${topics} data-type="${escapeHtml(item.type)}">${imageMarkup(item)}<div class="material-card__body"><p class="eyebrow">${escapeHtml(type)} · ${escapeHtml(section)}</p><h2><a href="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a></h2><p>${escapeHtml(item.excerpt || '')}</p><p class="card-meta"><time datetime="${escapeHtml(item.datePublished)}">${escapeHtml(formatDate(item.datePublished))}</time></p></div></article>`;
};

const homeFallback = (pages, group) => {
  if (group === 'assessment') return pages.filter(item => item.type === 'assessment');
  if (group === 'kremennaya') return pages.filter(item => item.section === 'kremennaya');
  if (group === 'guide') return pages.filter(item => item.type === 'guide');
  if (group === 'dossier') return pages.filter(item => item.type === 'dossier');
  if (group === 'important') return pages.filter(item => item.type === 'article' && item.section !== 'politics');
  return [];
};

const selectHome = (pages, group, excludedUrls = new Set()) => {
  const explicit = pages
    .filter(item => item.home && Number.isFinite(Number(item.home[group])))
    .sort((a, b) => Number(a.home[group]) - Number(b.home[group]));
  const fallback = homeFallback(pages, group).sort(sortNewest);
  const seen = new Set(excludedUrls);
  return [...explicit, ...fallback].filter(item => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  }).slice(0, HOME_LIMITS[group] || 3);
};

const selectItems = (pages, key) => {
  if (key === 'news') return pages.filter(item => item.type === 'article' || item.type === 'guide').sort(sortNewest);
  if (key.startsWith('section:')) return pages.filter(item => item.section === key.slice(8)).sort(sortNewest);
  if (key.startsWith('type:')) return pages.filter(item => item.type === key.slice(5)).sort(sortNewest);
  if (key.startsWith('chronicle:')) return pages.filter(item => item.section === key.slice(10)).sort(sortNewest);
  return [];
};

const replaceCatalog = (html, key, items, innerOverride = null) => {
  const token = escapeRegExp(key);
  const pattern = new RegExp(`<!-- KRM CATALOG ${token} START -->([\\s\\S]*?)<!-- KRM CATALOG ${token} END -->`);
  const match = html.match(pattern);
  if (!match) throw new Error(`Не найден блок каталога «${key}»`);
  const segment = match[1].trim();
  let replacement;
  if (key === 'home:assessment') {
    replacement = items.length ? cardHtml(items[0], key) : segment;
  } else {
    const rootMatch = segment.match(/^<([a-z0-9-]+)([^>]*)>[\s\S]*<\/\1>$/i);
    if (!rootMatch) throw new Error(`Не удалось разобрать контейнер «${key}»`);
    const [, tag, attrs] = rootMatch;
    const inner = innerOverride ?? items.map(item => cardHtml(item)).join('');
    replacement = `<${tag}${attrs}>${inner}</${tag}>`;
  }
  return html.replace(pattern, `<!-- KRM CATALOG ${key} START -->${replacement}<!-- KRM CATALOG ${key} END -->`);
};


const latestKremennayaStateItem = pages => {
  const kremennaya = pages.filter(item => item.section === 'kremennaya');
  const stateItems = kremennaya.filter(item => {
    const topics = Array.isArray(item.topics) ? item.topics : [];
    return topics.length === 0 || topics.some(topic => ['safety', 'daily', 'infrastructure'].includes(topic));
  });
  return [...(stateItems.length ? stateItems : kremennaya)].sort(sortNewest)[0] || null;
};

const syncKremennayaIntro = (html, latestState) => {
  let updated = html;

  if (latestState) {
    const currentState = `<section class="current-state"><h2>Последнее зафиксированное состояние</h2><p>${escapeHtml(latestState.excerpt || '')}</p><p><a href="${escapeHtml(latestState.url)}">Открыть материал от ${escapeHtml(formatDate(latestState.datePublished))}</a></p></section>`;
    updated = updated.replace(/<section class="current-state">[\s\S]*?<\/section>/, currentState);
  }

  const chronicleIntro = `<section class="chronicle-intro"><h2>Что сохраняет хроника</h2><p>В этом разделе собраны материалы о Кременной: безопасность, БПЛА, дороги, транспорт, топливо, связь, коммунальные службы, повреждения гражданской инфраструктуры и изменения повседневной жизни города. Хроника помогает смотреть не на один отдельный эпизод, а на то, как обстановка менялась по датам.</p></section>`;
  updated = updated.replace(/<section class="chronicle-intro">[\s\S]*?<\/section>/, chronicleIntro);

  return updated;
};

const syncPublicationMetadata = (html, item, buildDate) => {
  const seoTitle = item.seoTitle || item.title;
  const currentDescription = metaContent(html, 'description') || item.excerpt;
  const seoDescription = smartTrim(item.seoDescription || currentDescription || item.excerpt, 155);
  const pageTitle = `${seoTitle} — KRM РФ`;
  const absoluteUrl = `${SITE_URL}${item.url}`;
  const absoluteImage = `${SITE_URL}${item.image}`;

  let updated = replaceTitle(html, pageTitle);
  for (const [attribute, key, value] of [
    ['name', 'description', seoDescription],
    ['name', 'author', 'KRM РФ'],
    ['property', 'og:site_name', 'KRM РФ'],
    ['property', 'og:title', seoTitle],
    ['property', 'og:description', seoDescription],
    ['property', 'og:url', absoluteUrl],
    ['property', 'og:image', absoluteImage],
    ['property', 'og:image:alt', item.imageAlt || item.title],
    ['property', 'article:published_time', `${item.datePublished}T12:00:00+03:00`],
    ['property', 'article:modified_time', `${item.dateModified}T12:00:00+03:00`],
    ['name', 'twitter:title', seoTitle],
    ['name', 'twitter:description', seoDescription],
    ['name', 'twitter:image', absoluteImage],
    ['name', 'twitter:image:alt', item.imageAlt || item.title]
  ]) updated = replaceMeta(updated, attribute, key, value);

  updated = updated.replace(
    /<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/g,
    (whole, jsonText) => {
      let data;
      try { data = JSON.parse(jsonText); } catch { return whole; }
      const nodes = Array.isArray(data?.['@graph']) ? data['@graph'] : [data];
      const organization = nodes.find(node => node && node['@type'] === 'Organization');
      if (organization) {
        organization.logo ||= { '@type': 'ImageObject', url: `${SITE_URL}/assets/img/favicon.webp` };
        organization.sameAs ||= ['https://t.me/xykrm', 'https://max.ru/xykrm'];
      }
      const website = nodes.find(node => node && node['@type'] === 'WebSite');
      if (website) {
        website.inLanguage = 'ru-RU';
        delete website.potentialAction;
      }
      const article = nodes.find(node => node && ['Article', 'NewsArticle', 'Report'].includes(node['@type']));
      if (!article) return whole;
      article['@type'] = item.type === 'assessment' || item.type === 'dossier' ? 'Report'
        : item.type === 'article' ? 'NewsArticle' : 'Article';
      article.headline = item.title;
      article.alternativeHeadline = seoTitle;
      article.description = seoDescription;
      article.datePublished = item.datePublished;
      article.dateModified = item.dateModified;
      article.url = absoluteUrl;
      article.mainEntityOfPage = absoluteUrl;
      article.image = absoluteImage;
      article.inLanguage = 'ru-RU';
      article.articleSection = SECTION_LABELS[item.section] || item.section;
      article.isAccessibleForFree = true;
      article.author = { '@id': `${SITE_URL}/#organization` };
      article.publisher = { '@id': `${SITE_URL}/#organization` };
      const keywords = [
        ...(Array.isArray(item.topics) ? item.topics : []),
        ...(Array.isArray(item.locations) ? item.locations : [])
      ];
      if (keywords.length) article.keywords = [...new Set(keywords)].join(', ');
      return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
    }
  );

  const section = SECTION_LABELS[item.section] || item.section;
  updated = updated.replace(/(<strong>Раздел:<\/strong>\s*)[^<•]+/i, `$1${section}`);

  const revisionMarker = `<!-- KRM REVISION META START -->${item.dateModified > item.datePublished
    ? `<p class="revision-meta">Материал обновлён: <time datetime="${escapeHtml(item.dateModified)}">${escapeHtml(formatDate(item.dateModified))}</time></p>`
    : ''}<!-- KRM REVISION META END -->`;
  if (/<!-- KRM REVISION META START -->[\s\S]*?<!-- KRM REVISION META END -->/.test(updated)) {
    updated = updated.replace(/<!-- KRM REVISION META START -->[\s\S]*?<!-- KRM REVISION META END -->/, revisionMarker);
  } else if (item.dateModified > item.datePublished) {
    const metaMatch = updated.match(/<p\b[^>]*class="[^"]*(?:article-meta|meta)[^"]*"[^>]*>[\s\S]*?<\/p>/i);
    if (metaMatch) updated = updated.replace(metaMatch[0], `${metaMatch[0]}${revisionMarker}`);
    else updated = updated.replace(/(<h1\b[^>]*>[\s\S]*?<\/h1>)/i, `$1${revisionMarker}`);
  }

  if (item.type === 'guide') {
    const due = item.reviewStatus === 'review-due' || item.reviewAfter < buildDate;
    const statusClass = due ? 'guide-status--review' : 'guide-status--current';
    const statusText = due
      ? `Срок плановой проверки наступил ${formatDate(item.reviewAfter)}. Перед практическим применением сверьте нормы с официальным органом.`
      : `Плановая повторная проверка актуальности — не позднее ${formatDate(item.reviewAfter)}.`;
    const reviewed = item.reviewedAt || item.dateModified;
    const block = `<!-- KRM GUIDE STATUS START --><aside class="guide-status ${statusClass}" aria-label="Статус актуальности памятки"><p><strong>${due ? 'Требует повторной проверки' : 'Контроль актуальности'}</strong></p><p>Последняя редакционная проверка: <time datetime="${escapeHtml(reviewed)}">${escapeHtml(formatDate(reviewed))}</time>. ${escapeHtml(statusText)}</p></aside><!-- KRM GUIDE STATUS END -->`;
    if (/<!-- KRM GUIDE STATUS START -->[\s\S]*?<!-- KRM GUIDE STATUS END -->/.test(updated)) {
      updated = updated.replace(/<!-- KRM GUIDE STATUS START -->[\s\S]*?<!-- KRM GUIDE STATUS END -->/, block);
    } else {
      const metaMatch = updated.match(/<p\b[^>]*class="[^"]*(?:article-meta|meta)[^"]*"[^>]*>[\s\S]*?<\/p>/i);
      if (metaMatch) updated = updated.replace(metaMatch[0], `${metaMatch[0]}${block}`);
      else updated = updated.replace(/(<h1\b[^>]*>[\s\S]*?<\/h1>)/i, `$1${block}`);
    }
  }
  return updated;
};


const formatDateTime = value => {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return formatDate(raw.slice(0, 10));
  const [, year, month, day, hour, minute] = match;
  const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  return `${Number(day)} ${months[Number(month) - 1]} ${year} года, ${hour}:${minute}`;
};

const mapChangesHtml = (payload, zonesUpdated) => {
  const latest = Array.isArray(payload?.changes) ? payload.changes[0] : null;
  if (!latest) {
    return '<section aria-live="polite" id="mapChanges"><h2>Что изменилось на карте</h2><p>Описание последнего обновления карты пока не заполнено.</p></section>';
  }
  const details = Array.isArray(latest.details) && latest.details.length
    ? `<ul>${latest.details.slice(0, 4).map(detail => `<li>${escapeHtml(detail)}</li>`).join('')}</ul>`
    : '';
  const link = latest.relatedUrl && latest.relatedTitle
    ? `<p><a href="${escapeHtml(latest.relatedUrl)}">${escapeHtml(latest.relatedTitle)}</a></p>`
    : '';
  return `<section aria-live="polite" id="mapChanges"><h2>Что изменилось на карте</h2><p class="eyebrow">${escapeHtml(formatMapDateTime(latest.zonesUpdated || payload.updated || zonesUpdated))}</p><h3>${escapeHtml(latest.title || 'Последнее изменение карты')}</h3><p>${escapeHtml(latest.summary || 'Краткое описание изменения не заполнено.')}</p>${details}${link}</section>`;
};

const updateItemList = (html, items) => html.replace(
  /<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/g,
  (whole, jsonText) => {
    let data;
    try { data = JSON.parse(jsonText); } catch { return whole; }
    const nodes = Array.isArray(data?.['@graph']) ? data['@graph'] : [data];
    const list = nodes.find(node => node && node['@type'] === 'ItemList');
    if (!list) return whole;
    list.itemListElement = items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: `${SITE_URL}${item.url}`,
      name: item.title
    }));
    return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
  }
);

const archiveInner = (pages, searchByUrl) => {
  const groups = new Map();
  [...pages].sort(sortNewest).forEach(item => {
    const key = String(item.datePublished).slice(0, 7);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  return [...groups.values()].map(items => {
    const rows = items.map(item => {
      const search = searchByUrl.get(item.url) || {};
      const topics = Array.isArray(item.topics) ? item.topics.join(' ') : '';
      const locations = Array.isArray(item.locations) ? item.locations.join('|') : '';
      const haystack = [item.title, item.excerpt, item.period, topics, locations,
        SECTION_LABELS[item.section], TYPE_LABELS[item.type], search.description]
        .filter(Boolean).join(' ');
      return `<li data-id="${escapeHtml(item.id)}" data-url="${escapeHtml(item.url)}" data-locations="${escapeHtml(locations)}" data-search="${escapeHtml(haystack)}" data-section="${escapeHtml(item.section)}" data-topics="${escapeHtml(topics)}" data-type="${escapeHtml(item.type)}" data-year="${escapeHtml(String(item.datePublished).slice(0, 4))}"><time datetime="${escapeHtml(item.datePublished)}">${escapeHtml(formatArchiveDate(item.datePublished))}</time><span>${escapeHtml(TYPE_LABELS[item.type] || 'Материал')}</span><a href="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a></li>`;
    }).join('');
    return `<section class="archive-group"><h2>${escapeHtml(monthTitle(items[0].datePublished))}</h2><ol class="archive-list">${rows}</ol></section>`;
  }).join('');
};

const parseSitemap = xml => {
  const map = new Map();
  for (const match of xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?[\s\S]*?<\/url>/g)) {
    map.set(match[1], match[2] || '');
  }
  return map;
};

const latestDate = (items, fallback) => items
  .flatMap(item => [item.dateModified, item.datePublished])
  .filter(value => /^\d{4}-\d{2}-\d{2}$/.test(String(value)))
  .sort()
  .at(-1) || fallback;

const sitemapXml = (pages, oldMap, buildDate, mapDate, redirectedPaths = new Set()) => {
  const publicationUrls = new Set(pages.map(item => `${SITE_URL}${item.url}`));
  const allLatest = latestDate(pages, buildDate);
  const previous = pathname => oldMap.get(`${SITE_URL}${pathname}`) || buildDate;
  const staticDates = new Map([
    ['/', allLatest],
    ['/about/', previous('/about/')],
    ['/archive/', allLatest],
    ['/assessment/', latestDate(pages.filter(item => item.type === 'assessment'), allLatest)],
    ['/kremennaya/', latestDate(pages.filter(item => item.section === 'kremennaya'), allLatest)],
    ['/map/', /^\d{4}-\d{2}-\d{2}/.test(String(mapDate || '')) ? String(mapDate).slice(0, 10) : allLatest],
    ['/methodology/', previous('/methodology/')],
    ['/news/', latestDate(pages.filter(item => item.type === 'article' || item.type === 'guide'), allLatest)],
    ['/news/civilian-impact/', latestDate(pages.filter(item => item.section === 'civilian-impact'), allLatest)],
    ['/news/lnr/', latestDate(pages.filter(item => item.section === 'lnr'), allLatest)],
    ['/news/politics/', latestDate(pages.filter(item => item.section === 'politics'), allLatest)],
    ['/news/svo/', latestDate(pages.filter(item => item.section === 'svo'), allLatest)],
    ['/privacy/', previous('/privacy/')],
    ['/reference/', latestDate(pages.filter(item => item.type === 'guide'), allLatest)],
    ['/war-crimes/', latestDate(pages.filter(item => item.type === 'dossier'), allLatest)]
  ]);
  const fixed = [...staticDates.entries()]
    .filter(([pathname]) => !redirectedPaths.has(pathname))
    .map(([pathname, lastmod]) => ({ url: `${SITE_URL}${pathname}`, lastmod }));
  const pubs = pages.map(item => ({
    url: `${SITE_URL}${item.url}`,
    lastmod: item.dateModified || item.datePublished
  }));
  const all = [...fixed, ...pubs]
    .filter(item => !publicationUrls.has(item.url) || pages.some(page => `${SITE_URL}${page.url}` === item.url))
    .sort((a, b) => a.url.localeCompare(b.url));
  const body = all.map(item => `  <url>\n    <loc>${escapeXml(item.url)}</loc>\n    <lastmod>${escapeXml(item.lastmod)}</lastmod>\n  </url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
};

const errors = [];
const pages = readJson('data/pages.json');
if (!Array.isArray(pages)) throw new Error('data/pages.json должен содержать массив');

const ids = new Set();
const urls = new Set();
for (const [index, item] of pages.entries()) {
  const prefix = `pages.json[${index}]`;
  for (const field of ['id', 'type', 'title', 'url', 'section', 'datePublished', 'dateModified', 'excerpt', 'image', 'imageAlt']) {
    if (item[field] === undefined || item[field] === null || item[field] === '') errors.push(`${prefix}: отсутствует поле ${field}`);
  }
  if (ids.has(item.id)) errors.push(`${prefix}: повторяющийся id ${item.id}`);
  if (urls.has(item.url)) errors.push(`${prefix}: повторяющийся url ${item.url}`);
  ids.add(item.id); urls.add(item.url);
  if (!/^\/.*\/$/.test(item.url)) errors.push(`${prefix}: URL должен начинаться и заканчиваться слешем: ${item.url}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(item.datePublished)) errors.push(`${prefix}: неверная datePublished`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(item.dateModified)) errors.push(`${prefix}: неверная dateModified`);
  const htmlFile = urlToHtmlFile(item.url);
  if (!exists(htmlFile)) errors.push(`${prefix}: отсутствует HTML ${htmlFile}`);
  if (item.image && !exists(item.image.replace(/^\//, ''))) errors.push(`${prefix}: отсутствует изображение ${item.image}`);
}
if (errors.length) {
  console.error(errors.map(error => `• ${error}`).join('\n'));
  process.exit(1);
}

const site = readJson('data/site.json');
const packageJson = readJson('package.json');

site.version = packageJson.version;

const versionDateMatch = packageJson.version.match(
  /(\d{4})\.(\d{1,2})\.(\d{1,2})/
);

const versionDate = versionDateMatch
  ? [
      versionDateMatch[1],
      versionDateMatch[2].padStart(2, '0'),
      versionDateMatch[3].padStart(2, '0')
    ].join('-')
  : null;

const latestContentDate = pages
  .flatMap(item => [item.dateModified, item.datePublished])
  .filter(value => /^\d{4}-\d{2}-\d{2}$/.test(String(value)))
  .sort()
  .at(-1);

site.buildDate = [versionDate, latestContentDate]
  .filter(Boolean)
  .sort()
  .at(-1) || new Date().toISOString().slice(0, 10);

for (const file of listHtmlFiles(ROOT)) {
  const html = syncAnalyticsMarkup(syncAssetVersions(read(file), site.version));
  write(file, removeVisibleBuildMeta(html));
}

for (const item of pages) {
  const file = urlToHtmlFile(item.url);
  write(file, syncPublicationMetadata(read(file), item, site.buildDate));
}

const enriched = pages.map(item => {
  const html = read(urlToHtmlFile(item.url));
  const main = html.match(/<main\b[\s\S]*?<\/main>/i)?.[0] || html;
  const imageTag = (main.match(/<img\b[^>]*>/gi) || []).find(tag => {
    const source = attr(tag, 'src').replace(SITE_URL, '');
    return source === item.image;
  });
  return {
    ...item,
    searchText: stripTags(main),
    imageWidth: Number(attr(imageTag || '', 'width')) || null,
    imageHeight: Number(attr(imageTag || '', 'height')) || null
  };
});

const searchDocuments = enriched.map(item => ({
  title: item.title,
  url: item.url,
  section: SECTION_LABELS[item.section] || item.section,
  type: TYPE_LABELS[item.type] || item.type,
  date: item.datePublished,
  description: item.excerpt,
  topics: Array.isArray(item.topics) ? item.topics.join(' ') : '',
  locations: Array.isArray(item.locations) ? item.locations.join(' ') : '',
  period: item.period || '',
  _text: item.searchText
})).sort((a, b) => String(b.date).localeCompare(String(a.date)));

const searchTerms = new Map();
searchDocuments.forEach((item, documentId) => {
  for (const term of searchTokens(item._text).split(' ').filter(Boolean)) {
    if (!searchTerms.has(term)) searchTerms.set(term, []);
    searchTerms.get(term).push(documentId);
  }
});
const searchIndex = {
  version: 2,
  generatedAt: site.buildDate,
  documents: searchDocuments.map(({ _text, ...item }) => item),
  terms: Object.fromEntries([...searchTerms.entries()].sort(([a], [b]) => a.localeCompare(b, 'ru')))
};
const searchByUrl = new Map(searchDocuments.map(item => [item.url, item]));

const pageJobs = [
  ['news/index.html', 'news'],
  ['news/svo/index.html', 'section:svo'],
  ['news/lnr/index.html', 'section:lnr'],
  ['news/civilian-impact/index.html', 'section:civilian-impact'],
  ['news/politics/index.html', 'section:politics'],
  ['reference/index.html', 'type:guide'],
  ['assessment/index.html', 'type:assessment'],
  ['war-crimes/index.html', 'type:dossier'],
  ['kremennaya/index.html', 'chronicle:kremennaya']
];

for (const [file, key] of pageJobs) {
  const items = selectItems(enriched, key);
  let html = read(file);
  html = replaceCatalog(html, key, items);
  if (key === 'chronicle:kremennaya') {
    html = syncKremennayaIntro(html, latestKremennayaStateItem(enriched));
  }
  html = updateItemList(html, items);
  write(file, html);
}

let home = read('index.html');
const usedHomeUrls = new Set();
for (const group of ['important', 'assessment', 'kremennaya', 'guide', 'dossier']) {
  const key = `home:${group}`;
  const items = selectHome(enriched, group, usedHomeUrls);
  home = replaceCatalog(home, key, items);
  items.forEach(item => usedHomeUrls.add(item.url));
}
const latestAssessment = enriched.filter(item => item.type === 'assessment').sort(sortNewest)[0];
if (latestAssessment) {
  home = home.replace(/<a class="button" href="[^"]*">Последняя оценка<\/a>/, `<a class="button" href="${escapeHtml(latestAssessment.url)}">Последняя оценка</a>`);
}
write('index.html', home);

let mapPage = read('map/index.html');
const zones = readJson('data/zones.geojson');
const mapChanges = readJson('data/map-changes.json');
const mapUpdated = formatMapDateTime(zones.updated);
if (mapUpdated) {
  mapPage = mapPage.replace(/<dd([^>]*\bid="mapUpdated"[^>]*)>[^<]*<\/dd>/, (_whole, attrs) => {
    let syncedAttrs = /data-fallback="[^"]*"/.test(attrs)
      ? attrs.replace(/data-fallback="[^"]*"/, `data-fallback="${escapeHtml(mapUpdated)}"`)
      : `${attrs} data-fallback="${escapeHtml(mapUpdated)}"`;
    syncedAttrs = /data-updated-iso="[^"]*"/.test(syncedAttrs)
      ? syncedAttrs.replace(/data-updated-iso="[^"]*"/, `data-updated-iso="${escapeHtml(zones.updated)}"`)
      : `${syncedAttrs} data-updated-iso="${escapeHtml(zones.updated)}"`;
    return `<dd${syncedAttrs}>${escapeHtml(mapUpdated)}</dd>`;
  });
}
if (latestAssessment) {
  mapPage = mapPage.replace(/<a href="\/assessment\/[^"]*">Последняя оценка фронта<\/a>/, `<a href="${escapeHtml(latestAssessment.url)}">Последняя оценка фронта</a>`);
}
mapPage = mapPage.replace(/<section\b[^>]*id="mapChanges"[^>]*>[\s\S]*?<\/section>/, mapChangesHtml(mapChanges, zones.updated));
write('map/index.html', mapPage);

let archive = read('archive/index.html');
archive = replaceCatalog(archive, 'archive', enriched, archiveInner(enriched, searchByUrl));
archive = updateItemList(archive, [...enriched].sort(sortNewest));
write('archive/index.html', archive);

writeCompactJson('data/search-index.json', searchIndex);

site.contentCount = enriched.length;
writeJson('data/site.json', site);

const oldSitemap = parseSitemap(read('sitemap.xml'));
const redirectedPaths = new Set(read('_redirects').split(/\r?\n/)
  .map(line => line.trim()).filter(line => line && !line.startsWith('#'))
  .map(line => line.split(/\s+/)[0]));
write('sitemap.xml', sitemapXml(enriched, oldSitemap, site.buildDate, zones.updated, redirectedPaths));

// Hosting meta must be the final HTML transformation. Publication metadata and
// generated catalogs can otherwise move surrounding whitespace after this pass,
// making the next build differ from the first one.
for (const file of listHtmlFiles(ROOT)) {
  write(file, syncHostingMeta(read(file)));
}

console.log(`Сборка завершена: ${enriched.length} публикаций.`);
console.log('Обновлены главная, разделы, архив, поиск, sitemap и данные версии.');
