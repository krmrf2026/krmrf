// Offset-based inspection: never serialize an article's editorial HTML.
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

export const escapeHtml = value => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

export const decodeHtml = value => String(value || '')
  .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, '&');

export const textContent = html => decodeHtml(String(html).replace(/<[^>]*>/g, ' '))
  .replace(/\s+/g, ' ').trim();

export const attribute = (tag, name) => {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i'));
  return match ? decodeHtml(match[2]) : '';
};

export const setAttribute = (tag, name, value) => {
  const pattern = new RegExp(`\\s${name}\\s*=\\s*(["'])[\\s\\S]*?\\1`, 'i');
  if (value === null) return tag.replace(pattern, '');
  const pair = ` ${name}="${escapeHtml(value)}"`;
  return pattern.test(tag) ? tag.replace(pattern, () => pair) : tag.replace(/\s*\/?>(?=$)/, end => `${pair}${end}`);
};

export const hasClass = (node, name) => attribute(node.open, 'class').split(/\s+/).includes(name);

export const ancestors = node => {
  const result = [];
  for (let parent = node.parent; parent; parent = parent.parent) result.push(parent);
  return result;
};

export const scanElements = html => {
  const nodes = [];
  const stack = [];
  let cursor = 0;
  while (cursor < html.length) {
    const start = html.indexOf('<', cursor);
    if (start < 0) break;
    if (html.startsWith('<!--', start)) {
      const end = html.indexOf('-->', start + 4);
      if (end < 0) throw new Error('Незакрытый HTML-комментарий');
      cursor = end + 3;
      continue;
    }
    const match = html.slice(start).match(/^<(\/?)([a-z][a-z0-9:-]*)\b/i);
    if (!match) { cursor = start + 1; continue; }
    let quote = '';
    let end = start + match[0].length;
    for (; end < html.length; end += 1) {
      const char = html[end];
      if (quote) { if (char === quote) quote = ''; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === '>') break;
    }
    if (end === html.length) throw new Error('Незакрытый HTML-тег');
    cursor = end + 1;
    const tag = match[2].toLowerCase();
    if (match[1]) {
      const node = stack.pop();
      if (!node || node.tag !== tag) throw new Error(`Несогласованные теги около </${tag}>: ${start}`);
      node.closeStart = start;
      node.end = cursor;
      continue;
    }
    const open = html.slice(start, cursor);
    const node = { tag, open, start, openEnd: cursor, closeStart: cursor, end: cursor, parent: stack.at(-1) || null };
    nodes.push(node);
    if (VOID.has(tag) || /\/\s*>$/.test(open)) continue;
    if (tag === 'script' || tag === 'style') {
      const closing = new RegExp(`</${tag}\\s*>`, 'ig');
      closing.lastIndex = cursor;
      const close = closing.exec(html);
      if (!close) throw new Error(`Не закрыт ${tag}`);
      node.closeStart = close.index;
      node.end = closing.lastIndex;
      cursor = node.end;
    } else stack.push(node);
  }
  if (stack.length) throw new Error(`Не закрыт ${stack.at(-1).tag}`);
  return nodes;
};

export const replaceRanges = (html, changes) => {
  let boundary = html.length;
  for (const { start, end, text = '' } of [...changes].sort((a, b) => b.start - a.start || b.end - a.end)) {
    if (start < 0 || end < start || end > boundary) throw new Error('Пересекающиеся HTML-правки');
    html = html.slice(0, start) + text + html.slice(end);
    boundary = start;
  }
  return html;
};

export const rawElement = (html, node) => html.slice(node.start, node.end);
