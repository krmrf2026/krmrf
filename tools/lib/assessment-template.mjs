import { scanElements, attribute, hasClass, textContent, rawElement } from './html-fragments.mjs';
export const V5_FROM = '2026-10-25';
const normalize = value => value.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
const directions = [
  ['Купянское направление', 'kupyansk.webp'], ['Боровское направление', 'borovaya.webp'],
  ['Краснолиманское направление', 'krasnyi-liman.webp'], ['Славянское направление', 'slavyansk.webp']
];
export function checkAssessmentTemplate(html, item, pages) {
  if (item.type !== 'assessment' || item.datePublished < V5_FROM) return [];
  const errors = [];
  let all;try { all = scanElements(html); } catch (error) { return [`HTML: ${error.message}`]; }
  const article = all.find(node => node.tag === 'article' && hasClass(node, 'article'));
  if (!article) return ['Отсутствует article.article.'];
  const nodes = all.filter(node => node.start > article.start && node.end <= article.end);
  const headings = nodes.filter(node => /^h[23]$/.test(node.tag));
  const heading = name => headings.find(node => normalize(textContent(rawElement(html, node))) === normalize(name));
  for (const name of ['Коротко', 'Главное изменение периода', 'Обстановка по направлениям',
    'Кременная и гражданская обстановка', 'Кременная', 'ЛНР', 'Что отслеживать на следующей неделе', 'Итог']) {
    if (!heading(name)) errors.push(`Отсутствует раздел: ${name}.`);
  }
  const images = nodes.filter(node => node.tag === 'img');
  const prefix = `/assets/img/assessment/${item.datePublished}/`;
  const expected = ['cover.webp', ...directions.map(([, file]) => file)].map(file => prefix + file);
  if (images.length !== 5 || expected.some(src => images.filter(node => attribute(node.open, 'src') === src).length !== 1)) errors.push('V5 требует ровно пять отдельных WebP: cover, kupyansk, borovaya, krasnyi-liman, slavyansk в каталоге даты выпуска.');
  const cover = nodes.find(node => hasClass(node, 'article-cover'));
  if (!cover || !images.some(node => attribute(node.open, 'src') === prefix + 'cover.webp' && node.start > cover.start && node.end <= cover.end)) errors.push('Обложка должна находиться в article-cover.');
  const short = heading('Коротко');
  const shortBox = short && nodes.find(node => hasClass(node, 'note-box') && node.start < short.start && node.end >= short.end);
  if (short && !shortBox) errors.push('Коротко должно находиться в note-box.');
  if (shortBox && !textContent(html.slice(short.end, shortBox.closeStart)).trim()) errors.push('Блок Коротко не должен быть пустым.');
  if (!nodes.some(node => node.tag === 'nav' && hasClass(node, 'article-toc'))) errors.push('Отсутствует оглавление article-toc.');
  if (!nodes.some(node => node.tag === 'nav' && hasClass(node, 'series-nav'))) errors.push('Отсутствует навигация series-nav.');
  const links = nodes.filter(node => node.tag === 'a').map(node => attribute(node.open, 'href'));
  if (!links.includes('/map/') || !links.includes('/assessment/')) errors.push('Нужны ссылки на карту и архив оценок.');
  const previous = pages.filter(page => page.type === 'assessment' && page.datePublished < item.datePublished)
    .sort((a, b) => b.datePublished.localeCompare(a.datePublished))[0];
  if (!previous || !links.includes(previous.url)) errors.push('Нужна ссылка на ближайшую предыдущую зарегистрированную оценку.');
  if (!nodes.some(node => node.tag === 'strong' && /^Контекст:/.test(textContent(rawElement(html, node))))) errors.push('Отсутствует блок Контекст.');
  const checkConclusion = (start, end, name) => {
    const paragraphs = nodes.filter(node => node.tag === 'p' && node.start > start && node.end <= end && /^Оценка:/.test(textContent(rawElement(html, node))));
    if (paragraphs.length !== 1) { errors.push(`${name}: нужен один вывод Оценка.`);return; }
    const paragraph = paragraphs[0];
    const bold = nodes.filter(node => ['strong', 'b'].includes(node.tag) && node.start > paragraph.start && node.end <= paragraph.end);
    if (bold.length !== 1 || textContent(rawElement(html, bold[0])) !== 'Оценка:'
      || !textContent(rawElement(html, paragraph)).slice('Оценка:'.length).trim()) errors.push(`${name}: полужирным выделяется только метка Оценка:, вывод пишется обычным текстом.`);
  };
  for (const [name, file] of directions) {
    const node = heading(name);if (!node) { errors.push(`Отсутствует направление ${name}.`);continue; }
    const end = headings.find(next => next.start > node.start)?.start ?? article.closeStart;
    if (!images.some(image => image.start > node.end && image.end <= end && attribute(image.open, 'src') === prefix + file)) errors.push(`${name}: отсутствует собственная иллюстрация ${file}.`);
    checkConclusion(node.end, end, name);
  }
  for (const name of ['Кременная', 'ЛНР']) {
    const node = heading(name);if (node) checkConclusion(node.end, headings.find(next => next.start > node.start)?.start ?? article.closeStart, name);
  }
  return errors;
}
