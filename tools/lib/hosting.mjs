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

// Only /map/ needs the vector-map provider and MapLibre CDN. Keeping this policy
// map-specific means the other HTML pages preserve the exact existing security contract.
export const MAP_META_CSP = [
  "default-src 'self'",
  "script-src 'self' https://mc.yandex.ru https://yastatic.net https://unpkg.com",
  "script-src-attr 'none'",
  "style-src 'self' https://unpkg.com",
  "style-src-elem 'self' https://unpkg.com",
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data: blob: https://tiles.openfreemap.org https://*.openfreemap.org https://*.tile.openstreetmap.org https://mc.yandex.ru",
  "connect-src 'self' https://tiles.openfreemap.org https://*.openfreemap.org https://*.tile.openstreetmap.org https://mc.yandex.ru https://*.mc.yandex.ru",
  "font-src 'self'",
  "media-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self' blob:",
  "child-src blob:",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  'upgrade-insecure-requests'
].join('; ');

export const cspForFile = rel => String(rel || '').replace(/\\/g, '/') === 'map/index.html' ? MAP_META_CSP : META_CSP;

export const hostingMetaTags = (csp = META_CSP) => [
  `<meta content="${csp}" http-equiv="Content-Security-Policy"/>`,
  `<meta content="${REFERRER_POLICY}" name="referrer"/>`
].join('\n');

const isHostingMeta = tag => (
  /\bhttp-equiv\s*=\s*["']Content-Security-Policy["']/i.test(tag)
  || /\bname\s*=\s*["']referrer["']/i.test(tag)
);

export const syncHostingMeta = (html, csp = META_CSP) => {
  if (!/<head\b/i.test(html)) return html;

  const cleaned = html.replace(/<meta\b[^>]*>\s*/gi, tag => (
    isHostingMeta(tag) ? '' : tag
  ));
  const tags = hostingMetaTags(csp);
  const charset = cleaned.match(/<meta\b[^>]*\bcharset\s*=\s*["'][^"']+["'][^>]*>/i)?.[0];

  if (charset) return cleaned.replace(charset, `${charset}\n${tags}`);
  return cleaned.replace(/<head\b[^>]*>/i, match => `${match}\n${tags}`);
};
