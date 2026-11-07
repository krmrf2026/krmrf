import { escapeHtml } from './html-fragments.mjs';
import { sortNewest } from './catalog.mjs';

export const CHRONICLE_SERIES = new Set(['kremennaya-state', 'civilian-impact', 'front-summary']);
const marker = /\s*<!-- KRM CHRONICLE STATUS START -->[\s\S]*?<!-- KRM CHRONICLE STATUS END -->\s*/g;
const series = item => item.type === 'assessment' ? 'assessment' : item.chronicleSeries;

export const laterChronicle = (item, pages) => {
  const family = series(item);
  if (!family) return null;
  return pages.filter(other => series(other) === family && other.datePublished > item.datePublished)
    .sort(sortNewest)[0] || null;
};

export const chronicleStatus = (item, pages) => {
  const later = laterChronicle(item, pages);
  if (!later) return '';
  return '<!-- KRM CHRONICLE STATUS START -->'
    + '<aside class="chronicle-status" aria-label="Дата хроники">'
    + `<p><strong>Хроника на <time datetime="${escapeHtml(item.datePublished)}">${escapeHtml(item.datePublished.split('-').reverse().join('.'))}</time>.</strong> `
    + 'Обстановка и сообщения приведены за период этой публикации.</p>'
    + `<p>Более поздний материал: <a href="${escapeHtml(later.url)}">${escapeHtml(later.title)}</a> `
    + `(<time datetime="${escapeHtml(later.datePublished)}">${escapeHtml(later.datePublished.split('-').reverse().join('.'))}</time>).</p>`
    + '</aside><!-- KRM CHRONICLE STATUS END -->';
};

export const syncChronicleStatus = (html, item, pages) => {
  const cleaned = html.replace(marker, '');
  const block = chronicleStatus(item, pages);
  if (!block) return cleaned;
  // Inside the article, immediately after its header; never rewrite its dated narrative.
  return cleaned.replace(/(<header\b[^>]*class="[^"]*\barticle-header\b[^\"]*"[^>]*>[\s\S]*?<\/header>)\s*/i,
    (_whole, header) => `${header}\n${block}\n`);
};
