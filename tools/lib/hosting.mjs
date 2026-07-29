export const REFERRER_POLICY = 'strict-origin-when-cross-origin';

export const META_CSP = [
  "default-src 'self'",
  "script-src 'self' https://mc.yandex.ru https://yastatic.net",
  "script-src-attr 'none'",
  "style-src 'self'",
  "style-src-elem 'self'",
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data: https://*.tile.openstreetmap.org https://mc.yandex.ru",
  "connect-src 'self' https://*.tile.openstreetmap.org https://mc.yandex.ru https://*.mc.yandex.ru",
  "font-src 'self'",
  "media-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  'upgrade-insecure-requests'
].join('; ');

export const hostingMetaTags = () => [
  `<meta content="${META_CSP}" http-equiv="Content-Security-Policy"/>`,
  `<meta content="${REFERRER_POLICY}" name="referrer"/>`
].join('\n');

const isHostingMeta = tag => (
  /\bhttp-equiv\s*=\s*["']Content-Security-Policy["']/i.test(tag)
  || /\bname\s*=\s*["']referrer["']/i.test(tag)
);

export const syncHostingMeta = html => {
  if (!/<head\b/i.test(html)) return html;

  const cleaned = html.replace(/<meta\b[^>]*>\s*/gi, tag => (
    isHostingMeta(tag) ? '' : tag
  ));
  const tags = hostingMetaTags();
  const charset = cleaned.match(/<meta\b[^>]*\bcharset\s*=\s*["'][^"']+["'][^>]*>/i)?.[0];

  if (charset) return cleaned.replace(charset, `${charset}\n${tags}`);
  return cleaned.replace(/<head\b[^>]*>/i, match => `${match}\n${tags}`);
};
