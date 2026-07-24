import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';

const requestedRoot = process.env.KRM_SERVE_DIR || process.cwd();
const root = fs.realpathSync(path.resolve(requestedRoot));
const port = Number(process.env.PORT || 8000);
const host = process.env.HOST || '0.0.0.0';

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.geojson': 'application/geo+json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-Permitted-Cross-Domain-Policies': 'none',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
  'Origin-Agent-Cluster': '?1',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' https://mc.yandex.ru; style-src 'self'; style-src-elem 'self'; style-src-attr 'unsafe-inline'; img-src 'self' data: https://*.tile.openstreetmap.org https://mc.yandex.ru; connect-src 'self' https://*.tile.openstreetmap.org https://mc.yandex.ru https://*.mc.yandex.ru; font-src 'self'; media-src 'self'; manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests; block-all-mixed-content"
};

const safeResolve = pathname => {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const relative = decoded.replace(/^\/+/, '');
  const candidate = path.resolve(root, relative);
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) return null;
  return candidate;
};

const resolveRequestFile = pathname => {
  let candidate = safeResolve(pathname);
  if (!candidate) return null;
  if (pathname.endsWith('/')) candidate = path.join(candidate, 'index.html');
  if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
    candidate = path.join(candidate, 'index.html');
  }
  if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) return null;
  const real = fs.realpathSync(candidate);
  if (real !== root && !real.startsWith(`${root}${path.sep}`)) return null;
  return real;
};

const send = (request, response, file, statusCode = 200) => {
  const stat = fs.statSync(file);
  const etag = `"${crypto.createHash('sha1').update(`${stat.size}:${stat.mtimeMs}`).digest('hex')}"`;
  response.statusCode = statusCode;
  response.setHeader('Content-Type', types[path.extname(file).toLowerCase()] || 'application/octet-stream');
  response.setHeader('Content-Length', stat.size);
  response.setHeader('ETag', etag);
  response.setHeader('Cache-Control', 'no-cache');
  for (const [name, value] of Object.entries(securityHeaders)) response.setHeader(name, value);

  if (request.headers['if-none-match'] === etag) {
    response.statusCode = 304;
    response.removeHeader('Content-Length');
    response.end();
    return;
  }
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  fs.createReadStream(file).pipe(response);
};

const server = http.createServer((request, response) => {
  if (!['GET', 'HEAD'].includes(request.method || '')) {
    response.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Method Not Allowed');
    return;
  }

  let url;
  try {
    url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  } catch {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Bad Request');
    return;
  }

  const file = resolveRequestFile(url.pathname);
  if (file) {
    send(request, response, file);
    return;
  }

  const notFound = path.join(root, '404.html');
  if (fs.existsSync(notFound)) send(request, response, notFound, 404);
  else {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not Found');
  }
});

server.listen(port, host, () => {
  console.log(`KRM РФ открыт: http://localhost:${port}/`);
  console.log(`Корень: ${root}`);
});
