import fs from 'node:fs';
import path from 'node:path';
import { ancestors, attribute, hasClass, rawElement, scanElements, textContent } from './html-fragments.mjs';
import { SITE_URL } from './project.mjs';
import { publicationSection } from './publication-layout.mjs';
import { ARTICLE_IMAGE_SIZES, cardImageSizes } from './image-sizes.mjs';

const normalizedShell = html => html.replace(/\saria-current=(["'])[^"']*\1/g, '')
  .replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim();

// Read-only contract checks. The checker does not call the layout generator or
// rewrite failed pages, and checks actual links/positions instead of a snapshot.
export const checkUniformity = (root, pages, htmlFiles) => {
  const errors = [];
  const cache = new Map();
  const read = file => {
    if (!cache.has(file)) {
      const html = fs.readFileSync(path.join(root, file), 'utf8');
      cache.set(file, { html, nodes: scanElements(html) });
    }
    return cache.get(file);
  };
  const byUrl = new Map(pages.map(item => [item.url, item]));
  const home = read('index.html');
  const shells = Object.fromEntries(['site-header', 'site-footer'].map(name => {
    const node = home.nodes.find(node => hasClass(node, name));
    return [name, node ? normalizedShell(rawElement(home.html, node)) : ''];
  }));

  for (const file of htmlFiles.map(file => path.isAbsolute(file) ? path.relative(root, file) : file)) {
    try {
      if (/^(?:google|yandex_)[a-z0-9]+\.html$/i.test(path.basename(file))) continue;
      const { html, nodes } = read(file);
      if (!/<html\b/i.test(html) || /<meta\b[^>]*http-equiv=["']refresh["']/i.test(html)) continue;
      for (const name of Object.keys(shells)) {
        const found = nodes.filter(node => hasClass(node, name));
        if (found.length !== 1 || normalizedShell(rawElement(html, found[0])) !== shells[name]) {
          errors.push(`${file}: несогласованный ${name}; общая оболочка должна совпадать с главной.`);
        }
      }
      for (const image of nodes.filter(node => node.tag === 'img' && ancestors(node).some(parent => hasClass(parent, 'material-card')))) {
        if (!attribute(image.open, 'srcset')) continue;
        const parents = ancestors(image);
        const layout = parents.some(node => hasClass(node, 'split-feature')) ? 'feature'
          : parents.some(node => hasClass(node, 'material-grid--three')) ? 'three' : 'two';
        if (attribute(image.open, 'sizes') !== cardImageSizes(layout)) errors.push(`${file}: sizes карточки не соответствует её сетке.`);
      }
    } catch (error) { errors.push(`${file}: ${error.message}`); }
  }

  for (const item of pages) {
    const file = `${item.url.replace(/^\//, '')}index.html`;
    const fail = message => errors.push(`${file}: ${message}`);
    try {
      const { html, nodes } = read(file);
      const articles = nodes.filter(node => node.tag === 'article' && hasClass(node, 'article'));
      if (articles.length !== 1) { fail('должна быть одна основная статья.'); continue; }
      const article = articles[0];
      const inside = nodes.filter(node => ancestors(node).includes(article));
      const children = inside.filter(node => node.parent === article);
      const header = children.find(node => node.tag === 'header' && hasClass(node, 'article-header'));
      if (!header || children[0] !== header) fail('первым блоком статьи должен быть article-header.');
      if (!hasClass(article.parent, 'container--content')) fail('потерян container--content.');
      if (attribute(article.open, 'data-print-url') !== `${SITE_URL}${item.url}`) fail('неверный адрес печати.');
      const meta = inside.filter(node => hasClass(node, 'article-meta'));
      if (meta.length !== 1 || meta[0].parent !== header) fail('метаданные должны находиться в article-header.');
      const revisions = inside.filter(node => hasClass(node, 'revision-meta'));
      const statuses = inside.filter(node => hasClass(node, 'guide-status'));
      if (statuses.length !== (item.type === 'guide' ? 1 : 0)) fail('неверное количество статусов памятки.');
      for (const node of [...revisions, ...statuses]) {
        if (node.parent !== header || (meta[0] && node.start < meta[0].end)) fail('служебный блок должен стоять после метаданных.');
      }
      if (revisions.length > 1 || (revisions[0] && statuses[0] && revisions[0].start > statuses[0].start)) fail('неверный порядок обновления и статуса памятки.');
      const crumbs = nodes.filter(node => node.tag === 'nav' && hasClass(node, 'breadcrumbs'));
      const main = nodes.find(node => node.tag === 'main');
      if (crumbs.length !== 1 || !hasClass(crumbs[0].parent, 'breadcrumbs-wrap') || crumbs[0].end > main.start) {
        fail('нужна одна внешняя цепочка хлебных крошек перед main.');
      } else {
        const links = nodes.filter(node => node.tag === 'a' && ancestors(node).includes(crumbs[0]));
        const section = publicationSection(item);
        const expected = ['/', ...(item.type === 'article' && item.section !== 'kremennaya' ? ['/news/'] : []), section.url];
        if (JSON.stringify(links.map(node => attribute(node.open, 'href'))) !== JSON.stringify(expected)) fail('крошки не соответствуют рубрике.');
      }
      if (inside.some(node => ['article-nav', 'summary-box', 'article-lead', 'note-box--warning'].some(name => hasClass(node, name)))) {
        fail('сохранился несистемный или неоформленный вариант компонента.');
      }

      const headings = inside.filter(node => node.tag === 'h2' && !ancestors(node).some(parent => (
        parent.tag === 'nav' || parent === header || hasClass(parent, 'guide-status')
        || (parent.tag === 'section' && /^Обновление(?:\s|$)/u.test(attribute(parent.open, 'aria-label')))
      )));
      const tocs = inside.filter(node => node.tag === 'nav' && hasClass(node, 'article-toc'));
      if (tocs.length !== (headings.length >= 3 ? 1 : 0)) fail('оглавление не соответствует числу разделов.');
      if (tocs[0]) {
        const toc = tocs[0];
        if (toc.parent !== article || (header && toc.start < header.end)) fail('неверное положение оглавления.');
        const links = inside.filter(node => node.tag === 'a' && ancestors(node).includes(toc));
        const actual = links.map(node => [attribute(node.open, 'href'), textContent(html.slice(node.openEnd, node.closeStart))]);
        const expected = headings.map(node => [`#${attribute(node.open, 'id')}`, textContent(html.slice(node.openEnd, node.closeStart))]);
        if (JSON.stringify(actual) !== JSON.stringify(expected)) fail('оглавление пропускает раздел или содержит устаревшую подпись.');
        if (item.type === 'assessment') {
          if (headings.some(node => node.start > toc.start)) fail('оглавление оценки должно завершать материал.');
        } else {
          const regular = headings.find(node => !ancestors(node).some(parent => hasClass(parent, 'note-box'))) || headings[0];
          if (toc.start > regular.start) fail('оглавление должно предшествовать основным разделам.');
        }
      }

      const navs = inside.filter(node => node.tag === 'nav' && hasClass(node, 'series-nav'));
      if (navs.length !== 1 || children.at(-1) !== navs[0]) { fail('series-nav должна быть единственным последним блоком статьи.'); continue; }
      const links = inside.filter(node => node.tag === 'a' && node.parent === navs[0]);
      if (links.length < 1 || links.length > 2) fail('в нижней навигации должно быть одна или две карточки.');
      const family = pages.filter(other => other.type === item.type && (item.type !== 'article' || other.section === item.section))
        .sort((a, b) => a.datePublished.localeCompare(b.datePublished) || a.url.localeCompare(b.url));
      const position = family.findIndex(other => other.url === item.url);
      for (const link of links) {
        const kind = attribute(link.open, 'data-series-kind');
        const href = attribute(link.open, 'href');
        const span = inside.find(node => node.tag === 'span' && node.parent === link);
        if (!span) { fail('карточка перехода не имеет подписи.'); continue; }
        const title = textContent(html.slice(span.end, link.closeStart));
        if (kind === 'index') {
          if (href !== publicationSection(item).url) fail('неверная ссылка на раздел.');
        } else {
          if (!byUrl.has(href) || title !== byUrl.get(href).title) fail('название или адрес соседней публикации не совпадает с каталогом.');
          if (item.type === 'guide') {
            if (kind !== 'related' || byUrl.get(href)?.type !== 'guide' || /^(?:Предыдущ|Следующ)/u.test(textContent(rawElement(html, span)))) fail('тематическая ссылка памятки выдана за хронологическую.');
          } else if (!['previous', 'next'].includes(kind)) fail('неизвестное направление соседнего перехода.');
        }
      }
      if (item.type !== 'guide') {
        for (const [kind, expected] of [['previous', family[position - 1]], ['next', family[position + 1]]]) {
          const found = links.filter(link => attribute(link.open, 'data-series-kind') === kind);
          if (found.length !== (expected ? 1 : 0) || (expected && attribute(found[0].open, 'href') !== expected.url)) fail(`пропущен или неверен переход ${kind}.`);
        }
      }
      for (const image of inside.filter(node => node.tag === 'img')) {
        if (attribute(image.open, 'decoding') !== 'async') fail('изображение не использует общий decoding.');
        if (attribute(image.open, 'srcset') && attribute(image.open, 'sizes') !== ARTICLE_IMAGE_SIZES) fail('неверный sizes изображения статьи.');
      }
    } catch (error) { fail(error.message); }
  }
  return errors;
};
