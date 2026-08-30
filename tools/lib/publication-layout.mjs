import { SITE_URL, SECTION_LABELS } from './project.mjs';
import { ancestors, attribute, escapeHtml, hasClass, rawElement, replaceRanges,
  scanElements, setAttribute, textContent } from './html-fragments.mjs';

const classes = node => attribute(node.open, 'class').split(/\s+/).filter(Boolean);
const navClass = node => node.tag === 'nav' && ['article-toc', 'series-nav', 'article-nav', 'breadcrumbs'].some(name => hasClass(node, name));
const normalizedUrl = value => value.startsWith(SITE_URL) ? value.slice(SITE_URL.length) : value;

export const publicationSection = item => {
  if (item.type === 'assessment') return { url: '/assessment/', label: SECTION_LABELS.assessment, all: 'Все оценки' };
  if (item.type === 'guide') return { url: '/reference/', label: SECTION_LABELS.law, all: 'Все памятки' };
  if (item.type === 'dossier') return { url: '/war-crimes/', label: SECTION_LABELS.warcrimes, all: 'Все досье' };
  if (item.section === 'kremennaya') return { url: '/kremennaya/', label: SECTION_LABELS.kremennaya, all: 'Все материалы о Кременной' };
  if (!SECTION_LABELS[item.section]) throw new Error(`Неизвестная рубрика ${item.section}`);
  return { url: `/news/${item.section}/`, label: SECTION_LABELS[item.section], all: `Все материалы: ${SECTION_LABELS[item.section]}` };
};

export const publicationNeighbours = (item, pages) => {
  const family = pages.filter(other => other.type === item.type
    && (item.type !== 'article' || other.section === item.section))
    .sort((a, b) => a.datePublished.localeCompare(b.datePublished) || a.url.localeCompare(b.url));
  const index = family.findIndex(other => other.url === item.url);
  if (index < 0) throw new Error(`Публикации нет в каталоге: ${item.url}`);
  return { previous: family[index - 1], next: family[index + 1] };
};

const articleNode = html => {
  const articles = scanElements(html).filter(node => node.tag === 'article' && hasClass(node, 'article'));
  if (articles.length !== 1) throw new Error('Ожидается ровно одна основная статья');
  return articles[0];
};

const insertBlock = (html, position, block) => `${html.slice(0, position).trimEnd()}\n${block}\n${html.slice(position).trimStart()}`;

const removeBlocks = (html, blocks) => replaceRanges(html, blocks.map(({ start, end }) => {
  const lineStart = html.lastIndexOf('\n', start - 1) + 1;
  return { start: /^[\t ]*$/.test(html.slice(lineStart, start)) ? lineStart : start, end };
}));

const normalizeMarkerClasses = html => replaceRanges(html, scanElements(html).flatMap(node => {
  const names = classes(node);
  const normalized = [...new Set(names.map(name => name === 'summary-box' ? 'note-box' : name)
    .filter(name => !['article-lead', 'note-box--warning'].includes(name)))];
  if (names.join(' ') === normalized.join(' ')) return [];
  return [{ start: node.start, end: node.openEnd, text: setAttribute(node.open, 'class', normalized.join(' ') || null) }];
}));

const serviceBlocks = html => [...html.matchAll(/<!-- KRM (REVISION META|GUIDE STATUS) START -->[\s\S]*?<!-- KRM \1 END -->/g)]
  .map(match => ({ start: match.index, end: match.index + match[0].length, kind: match[1], html: match[0] }));

const normalizeHeader = html => {
  let nodes = scanElements(html);
  const root = nodes[0];
  const headers = nodes.filter(node => node.tag === 'header' && node.parent === root);
  if (headers.length > 1) throw new Error('Несколько заголовочных блоков публикации');
  const headerOpen = headers.length
    ? setAttribute(headers[0].open, 'class', [...new Set([...classes(headers[0]), 'article-header'])].join(' '))
    : '<header class="article-header">';
  html = removeBlocks(html, headers.flatMap(node => [
    { start: node.start, end: node.openEnd }, { start: node.closeStart, end: node.end }
  ]));
  nodes = scanElements(html);
  const headings = nodes.filter(node => node.tag === 'h1');
  const metas = nodes.filter(node => ['p', 'dl'].includes(node.tag) && hasClass(node, 'article-meta'));
  if (headings.length !== 1 || metas.length !== 1) throw new Error('Нужны один H1 и один блок article-meta');
  const eyebrow = nodes.find(node => node.tag === 'p' && hasClass(node, 'eyebrow') && node.start < headings[0].start);
  if (!eyebrow) throw new Error('Не найдена подпись типа публикации');
  const markers = serviceBlocks(html);
  for (const kind of ['REVISION META', 'GUIDE STATUS']) {
    if (markers.filter(block => block.kind === kind).length > 1) throw new Error(`Повторный блок ${kind}`);
  }
  const ordered = [rawElement(html, eyebrow), rawElement(html, headings[0]), rawElement(html, metas[0]),
    ...['REVISION META', 'GUIDE STATUS'].flatMap(kind => markers.filter(block => block.kind === kind).map(block => block.html))];
  html = removeBlocks(html, [eyebrow, headings[0], metas[0], ...markers]);
  const article = articleNode(html);
  const body = html.slice(article.openEnd, article.closeStart).trim();
  return `${article.open}\n${headerOpen}\n${ordered.join('\n')}\n</header>\n${body}\n</article>`;
};

const isEditorialUpdate = node => ancestors(node).some(parent => (
  parent.tag === 'section' && /^Обновление(?:\s|$)/u.test(attribute(parent.open, 'aria-label'))
));

const contentHeadings = html => scanElements(html).filter(node => node.tag === 'h2'
  && !isEditorialUpdate(node)
  && !ancestors(node).some(parent => parent.tag === 'nav' || hasClass(parent, 'article-header') || hasClass(parent, 'guide-status')));

const normalizeToc = (html, item) => {
  let headings = contentHeadings(html);
  // Two short older articles contain only the related-materials/source headings.
  // A dated editorial notice is not a reason to add a table of contents.
  if (headings.length < 3) return html;
  const ids = new Set(scanElements(html).map(node => attribute(node.open, 'id')).filter(Boolean));
  const patches = [];
  headings.forEach((node, index) => {
    if (attribute(node.open, 'id')) return;
    let id = `content-section-${index + 1}`;
    while (ids.has(id)) id += '-section';
    ids.add(id);
    patches.push({ start: node.start, end: node.openEnd, text: setAttribute(node.open, 'id', id) });
  });
  html = replaceRanges(html, patches);
  headings = contentHeadings(html);
  const entries = headings.map(node => `<li><a href="#${escapeHtml(attribute(node.open, 'id'))}">${escapeHtml(textContent(html.slice(node.openEnd, node.closeStart)))}</a></li>`).join('');
  const toc = `<nav aria-label="Содержание" class="article-toc"><p class="article-toc__title">В материале</p><ol>${entries}</ol></nav>`;
  const article = articleNode(html);
  if (item.type === 'assessment') return insertBlock(html, article.closeStart, toc);
  const firstRegular = headings.find(node => !ancestors(node).some(parent => hasClass(parent, 'note-box'))) || headings[0];
  let anchor = firstRegular;
  while (anchor.parent && !hasClass(anchor.parent, 'article')) anchor = anchor.parent;
  return insertBlock(html, anchor.start, toc);
};

const navigationLink = (item, { label, slot, kind }) => `<a class="series-nav__${slot}" data-series-kind="${kind}" href="${escapeHtml(item.url)}"><span>${escapeHtml(label)}</span>${escapeHtml(item.title)}</a>`;

const guideRelated = (html, item, pages) => {
  const byUrl = new Map(pages.map(page => [page.url, page]));
  const nodes = scanElements(html);
  const nav = nodes.find(node => node.tag === 'nav' && hasClass(node, 'series-nav'));
  const section = publicationSection(item);
  const candidates = [];
  if (nav) {
    for (const link of nodes.filter(node => node.tag === 'a' && ancestors(node).includes(nav))) {
      const url = normalizedUrl(attribute(link.open, 'href'));
      if (url === section.url) continue;
      const target = byUrl.get(url);
      if (!target || target.type !== 'guide' || url === item.url) throw new Error(`Недопустимая тематическая ссылка памятки: ${url}`);
      const span = nodes.find(node => node.tag === 'span' && node.parent === link);
      let label = span ? textContent(html.slice(span.openEnd, span.closeStart)) : '';
      if (!label || /^(?:Предыдущ|Следующ)/u.test(label)) label = 'Связанная памятка';
      candidates.push({ item: target, label });
    }
  } else {
    // For a guide without bottom navigation, reuse the editor's own related list.
    const related = nodes.find(node => node.tag === 'h2' && /(?:связанные|по теме)/iu.test(textContent(html.slice(node.openEnd, node.closeStart))));
    if (related) {
      const end = nodes.find(node => node.tag === 'h2' && node.start > related.start)?.start || html.length;
      for (const link of nodes.filter(node => node.tag === 'a' && node.start > related.end && node.start < end)) {
        const target = byUrl.get(normalizedUrl(attribute(link.open, 'href')));
        if (target?.type === 'guide' && target.url !== item.url) candidates.push({ item: target, label: 'Связанная памятка' });
      }
    }
  }
  const seen = new Set();
  const unique = candidates.filter(({ item: target }) => !seen.has(target.url) && seen.add(target.url));
  if (nav && unique.length > 2) throw new Error('Более двух тематических переходов: нужен явный редакционный выбор');
  return unique.slice(0, 2);
};

export const publicationNavigation = (item, pages, related = []) => {
  const section = publicationSection(item);
  const hub = { url: section.url, title: section.all };
  let links;
  let label;
  if (item.type === 'guide') {
    links = related.map(({ item: target, label: caption }, index) => navigationLink(target,
      { label: caption, slot: index ? 'next' : 'prev', kind: 'related' }));
    if (links.length < 2) links.push(navigationLink(hub, { label: 'Раздел', slot: links.length ? 'next' : 'prev', kind: 'index' }));
    label = 'Связанные памятки';
  } else {
    const { previous, next } = publicationNeighbours(item, pages);
    links = [];
    if (previous) links.push(navigationLink(previous, { label: 'Предыдущий материал', slot: 'prev', kind: 'previous' }));
    else links.push(navigationLink(hub, { label: 'Раздел', slot: 'prev', kind: 'index' }));
    if (next) links.push(navigationLink(next, { label: 'Следующий материал', slot: 'next', kind: 'next' }));
    else if (previous) links.push(navigationLink(hub, { label: 'Раздел', slot: 'next', kind: 'index' }));
    label = item.type === 'assessment' ? 'Навигация по оценкам'
      : item.type === 'dossier' ? 'Досье по дате публикации' : 'Материалы рубрики по дате публикации';
  }
  return `<nav aria-label="${label}" class="series-nav">${links.join('')}</nav>`;
};

const syncBreadcrumbs = (html, item) => {
  const nodes = scanElements(html);
  const wrappers = nodes.filter(node => hasClass(node, 'breadcrumbs-wrap'));
  const navs = nodes.filter(node => node.tag === 'nav' && hasClass(node, 'breadcrumbs'));
  if (wrappers.length > 1 || navs.length !== 1) throw new Error('Ожидается одна внешняя цепочка хлебных крошек');
  const wrapper = wrappers[0];
  const leaf = nodes.filter(node => node.tag === 'li' && ancestors(node).includes(navs[0])).at(-1);
  const leafLabel = leaf ? textContent(html.slice(leaf.openEnd, leaf.closeStart)) : item.title;
  const section = publicationSection(item);
  const crumbs = [{ name: 'Главная', url: '/' }];
  if (item.type === 'article' && item.section !== 'kremennaya') crumbs.push({ name: 'Материалы', url: '/news/' });
  crumbs.push({ name: section.label, url: section.url }, { name: leafLabel });
  const markup = `<div class="breadcrumbs-wrap"><nav aria-label="Хлебные крошки" class="breadcrumbs container"><ol>${crumbs.map(crumb => crumb.url
    ? `<li><a href="${escapeHtml(crumb.url)}">${escapeHtml(crumb.name)}</a></li>`
    : `<li aria-current="page">${escapeHtml(crumb.name)}</li>`).join('')}</ol></nav></div>`;
  if (wrapper) html = replaceRanges(html, [{ start: wrapper.start, end: wrapper.end, text: markup }]);
  else {
    html = removeBlocks(html, [navs[0]]);
    const main = scanElements(html).find(node => node.tag === 'main');
    if (!main) throw new Error('Не найден main');
    html = insertBlock(html, main.start, markup);
  }
  return html.replace(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/g, (whole, text) => {
    const graph = JSON.parse(text);
    const list = (Array.isArray(graph['@graph']) ? graph['@graph'] : [graph]).find(node => node['@type'] === 'BreadcrumbList');
    if (!list) return whole;
    list.itemListElement = crumbs.map((crumb, index) => ({ '@type': 'ListItem', position: index + 1,
      name: crumb.name, ...(crumb.url ? { item: `${SITE_URL}${crumb.url}` } : {}) }));
    return `<script type="application/ld+json">${JSON.stringify(graph).replace(/</g, '\\u003c')}</script>`;
  });
};

export const syncPublicationLayout = (html, item, pages) => {
  const article = articleNode(html);
  let content = rawElement(html, article);
  const related = item.type === 'guide' ? guideRelated(content, item, pages) : [];
  content = removeBlocks(content, scanElements(content).filter(navClass));
  content = normalizeMarkerClasses(content);
  content = normalizeHeader(content);
  content = normalizeToc(content, item);
  content = insertBlock(content, articleNode(content).closeStart, publicationNavigation(item, pages, related));
  html = replaceRanges(html, [{ start: article.start, end: article.end, text: content }]);
  const normalizedArticle = articleNode(html);
  const container = normalizedArticle.parent;
  if (!container || !hasClass(container, 'container')) throw new Error('У статьи отсутствует общий контейнер');
  html = replaceRanges(html, [
    { start: container.start, end: container.openEnd,
      text: setAttribute(container.open, 'class', [...new Set([...classes(container), 'container--content'])].join(' ')) },
    { start: normalizedArticle.start, end: normalizedArticle.openEnd,
      text: setAttribute(normalizedArticle.open, 'data-print-url', `${SITE_URL}${item.url}`) }
  ]);
  return syncBreadcrumbs(html, item);
};
