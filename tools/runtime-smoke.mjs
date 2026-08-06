import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import http from 'node:http';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import { cspForFile, REFERRER_POLICY } from './lib/hosting.mjs';
import { REDIRECT_MARKER, redirectPages } from './lib/redirects.mjs';

const ROOT = path.resolve(process.cwd());
const PORT = Number(process.env.KRM_RUNTIME_PORT || 41789);
const HOST = '127.0.0.1';
const expectedVersion = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const errors = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const server = spawn(process.execPath, [path.join(ROOT, 'tools/serve.mjs')], {
  cwd: ROOT,
  env: { ...process.env, KRM_SERVE_DIR: 'dist', PORT: String(PORT), HOST },
  stdio: ['ignore', 'ignore', 'pipe']
});
let serverError = '';
server.stderr.on('data', chunk => { serverError += chunk; });

const waitForServer = async () => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://${HOST}:${PORT}/`, { signal: AbortSignal.timeout(500) });
      if (response.ok) return;
    } catch {}
    await sleep(100);
  }
  throw new Error(`Сервер не запустился: ${serverError}`);
};

const raw = (requestPath, method = 'GET', headers = {}) => new Promise((resolve, reject) => {
  const request = http.request({ host: HOST, port: PORT, path: requestPath, method, headers }, response => {
    const chunks = [];
    response.on('data', chunk => chunks.push(chunk));
    response.on('end', () => resolve({
      status: response.statusCode,
      headers: response.headers,
      body: Buffer.concat(chunks).toString('utf8')
    }));
  });
  request.on('error', reject);
  request.end();
});

try {
  await waitForServer();

  for (const requestPath of ['/', '/archive/', '/search/', '/map/']) {
    const response = await raw(requestPath);
    if (response.status !== 200 || !response.body.length) {
      errors.push(`${requestPath}: HTTP ${response.status}, пустой ответ.`);
      continue;
    }
    if (!response.body.includes(`?v=${expectedVersion}`)) {
      errors.push(`${requestPath}: HTML не содержит согласованную версию ассетов ${expectedVersion}.`);
    }
    if (/site-footer__meta|Версия архива:|Техническая сборка:/i.test(response.body)) {
      errors.push(`${requestPath}: внутренняя версия или дата сборки видна читателю.`);
    }
    const rel = requestPath === '/' ? 'index.html' : `${requestPath.replace(/^\//, '')}index.html`;
    if (!response.body.includes(`<meta content="${cspForFile(rel)}" http-equiv="Content-Security-Policy"/>`)) {
      errors.push(`${requestPath}: отсутствует точная meta CSP для GitHub Pages.`);
    }
    if (!response.body.includes(`<meta content="${REFERRER_POLICY}" name="referrer"/>`)) {
      errors.push(`${requestPath}: отсутствует meta referrer policy.`);
    }
    for (const forbiddenHeader of ['content-security-policy', 'x-frame-options', 'referrer-policy', 'permissions-policy']) {
      if (response.headers[forbiddenHeader]) {
        errors.push(`${requestPath}: локальный сервер ложно имитирует неподдерживаемый GitHub Pages заголовок ${forbiddenHeader}.`);
      }
    }
  }

  for (const requestPath of ['/data/search-index.json', '/assets/js/search-core.js']) {
    const response = await raw(requestPath);
    if (response.status !== 200 || !response.body.length) errors.push(`${requestPath}: HTTP ${response.status}, пустой ответ.`);
  }

  const home = await raw('/');
  const etag = home.headers.etag;
  if (!etag) errors.push('Локальный сервер не выдаёт ETag.');
  else {
    const cached = await raw('/', 'GET', { 'If-None-Match': etag });
    if (cached.status !== 304 || cached.body) errors.push('ETag/304 работает некорректно.');
  }
  const head = await raw('/', 'HEAD');
  if (head.status !== 200 || head.body) errors.push('HEAD обрабатывается некорректно.');
  const post = await raw('/', 'POST');
  if (post.status !== 405) errors.push('Неподдерживаемый метод не возвращает 405.');
  const leak = await raw('/package.json');
  if (leak.status === 200 || leak.body.includes('krmrf-static-archive')) errors.push('dist раскрыл package.json.');
  for (const removedPath of [
    '/feed.xml',
    '/data/news.json',
    '/data/pages.json',
    '/_headers',
    '/_redirects'
  ]) {
    const response = await raw(removedPath);
    if (response.status !== 404) {
      errors.push(`${removedPath}: удалённый или служебный путь должен возвращать 404, сейчас ${response.status}.`);
    }
  }

  const aliasPages = redirectPages(ROOT);
  for (const alias of aliasPages) {
    const slashed = await raw(alias.route);
    if (slashed.status !== 200) errors.push(`${alias.route}: страница старого адреса вернула ${slashed.status}, ожидался 200.`);
    if (!slashed.body.includes(REDIRECT_MARKER) || !slashed.body.includes(`data-redirect-target="${alias.to}"`)) {
      errors.push(`${alias.route}: статическая страница старого адреса не содержит проверенную цель ${alias.to}.`);
    }
    if (!slashed.body.includes(`content="0; url=${alias.to}"`)) {
      errors.push(`${alias.route}: отсутствует мгновенный meta refresh.`);
    }

    const noSlash = alias.route.slice(0, -1);
    const query = '?utm_source=runtime&utm_medium=test';
    const directoryResponse = await raw(`${noSlash}${query}`);
    if (directoryResponse.status !== 301) {
      errors.push(`${noSlash}: каталог без завершающего слеша вернул ${directoryResponse.status}, ожидался 301 на вариант со слешем.`);
    }
    if (directoryResponse.headers.location !== `${alias.route}${query}`) {
      errors.push(`${noSlash}: каталог потерял путь или query: ${directoryResponse.headers.location || 'нет Location'}.`);
    }
  }

  for (const attack of ['/%2e%2e/%2e%2e/etc/passwd', '/..%2f..%2fetc%2fpasswd', '/%00']) {
    const response = await raw(attack);
    if (response.status === 200 && /root:.*:0:0/.test(response.body)) errors.push(`Обход корня через ${attack}.`);
  }

  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'dist/assets/js/search-core.js'), 'utf8'), sandbox);
  const payload = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist/data/search-index.json'), 'utf8'));
  const engine = sandbox.window.KRMSearchIndex.create(payload);
  for (const query of ['кременная', 'выплаты', 'красный лиман', 'недвижимость лнр']) {
    const results = engine.find(query, { limit: 10 });
    if (!results.length) errors.push(`Поисковое ядро не находит «${query}».`);
  }
  if (engine.find('кременная', { limit: 10 }).some(result => !result.document.url.startsWith('/'))) {
    errors.push('Поиск вернул небезопасный URL.');
  }

  const zones = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist/data/zones.geojson'), 'utf8'));
  const changes = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist/data/map-changes.json'), 'utf8'));
  const mapHtml = fs.readFileSync(path.join(ROOT, 'dist/map/index.html'), 'utf8');
  if (changes.changes?.[0]?.zonesUpdated !== zones.updated || !mapHtml.includes(`data-updated-iso="${zones.updated}"`)) {
    errors.push('Публичная карта рассинхронизирована.');
  }
} catch (error) {
  errors.push(error.message);
} finally {
  server.kill('SIGTERM');
  await sleep(100);
  if (!server.killed) server.kill('SIGKILL');
}

if (errors.length) {
  console.error(errors.map(item => `• ${item}`).join('\n'));
  process.exit(1);
}
console.log('Runtime-тесты пройдены: GitHub Pages-совместимые каталоги и страницы старых адресов, meta-политики, ETag, методы, изоляция dist, поиск и карта работают согласованно.');
