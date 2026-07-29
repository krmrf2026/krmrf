import fs from 'node:fs';
import path from 'node:path';
import { META_CSP, REFERRER_POLICY } from './hosting.mjs';
import { SITE_URL } from './project.mjs';

export const REDIRECT_MARKER = 'KRM GITHUB PAGES REDIRECT';
export const REDIRECT_REGISTRY = '_redirects';

const ROUTE_PATTERN = /^\/[a-z0-9/_-]*\/?$/i;

const escapeHtml = value => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

export const normalizeRedirectRoute = (value, { trailingSlash = true } = {}) => {
  let route = String(value || '').trim();
  if (!route.startsWith('/')) route = `/${route}`;
  route = route.replace(/\/+/g, '/');
  if (
    !ROUTE_PATTERN.test(route)
    || route.includes('..')
    || route.includes('\\')
    || route.includes('\0')
  ) {
    throw new Error(`Недопустимый внутренний маршрут: ${value}`);
  }
  if (trailingSlash && route !== '/' && !route.endsWith('/')) route += '/';
  if (!trailingSlash && route !== '/' && route.endsWith('/')) route = route.slice(0, -1);
  return route;
};

export const redirectRouteToFile = route => {
  const normalized = normalizeRedirectRoute(route);
  if (normalized === '/') throw new Error('Корневой URL нельзя использовать как страницу-перенаправление.');
  return path.posix.join(...normalized.split('/').filter(Boolean), 'index.html');
};

export const readRedirectRules = root => {
  const file = path.join(root, REDIRECT_REGISTRY);
  if (!fs.existsSync(file)) throw new Error(`Не найден внутренний реестр ${REDIRECT_REGISTRY}.`);

  const rules = [];
  const seen = new Set();
  for (const [index, rawLine] of fs.readFileSync(file, 'utf8').split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    if (parts.length !== 3) throw new Error(`${REDIRECT_REGISTRY}:${index + 1}: ожидаются source, target и status.`);
    const [fromRaw, toRaw, statusRaw] = parts;
    const from = normalizeRedirectRoute(fromRaw, { trailingSlash: fromRaw.endsWith('/') });
    const to = normalizeRedirectRoute(toRaw);
    const status = Number(statusRaw);
    if (![301, 308].includes(status)) {
      throw new Error(`${REDIRECT_REGISTRY}:${index + 1}: допустим только постоянный статус 301 или 308.`);
    }
    if (from === to) throw new Error(`${REDIRECT_REGISTRY}:${index + 1}: маршрут перенаправляет сам на себя.`);
    if (seen.has(from)) throw new Error(`${REDIRECT_REGISTRY}:${index + 1}: повторяющийся источник ${from}.`);
    seen.add(from);
    rules.push({ from, to, status, line: index + 1 });
  }
  return rules;
};

export const redirectPages = root => {
  const grouped = new Map();
  for (const rule of readRedirectRules(root)) {
    const route = normalizeRedirectRoute(rule.from);
    const file = redirectRouteToFile(route);
    const previous = grouped.get(file);
    if (previous && previous.to !== rule.to) {
      throw new Error(`Конфликт целей для ${route}: ${previous.to} и ${rule.to}.`);
    }
    if (!previous) grouped.set(file, { route, file, to: rule.to, sources: [] });
    grouped.get(file).sources.push(rule.from);
  }
  return [...grouped.values()].sort((a, b) => a.file.localeCompare(b.file, 'ru'));
};

export const renderRedirectPage = ({ route, to, version }) => {
  const targetAbsolute = new URL(to, SITE_URL).href;
  return `<!doctype html>
<html class="no-js" data-redirect-target="${escapeHtml(to)}" lang="ru">
<head>
  <meta charset="utf-8"/>
  <meta content="${META_CSP}" http-equiv="Content-Security-Policy"/>
  <meta content="${REFERRER_POLICY}" name="referrer"/>
  <meta content="width=device-width, initial-scale=1" name="viewport"/>
  <title>Страница перенесена — KRM РФ</title>
  <meta content="noindex,follow" name="robots"/>
  <link href="${escapeHtml(targetAbsolute)}" rel="canonical"/>
  <link href="/assets/img/favicon.webp" rel="icon" type="image/webp"/>
  <link href="/assets/css/style.css?v=${escapeHtml(version)}" rel="stylesheet"/>
  <link href="/assets/css/page-index.css?v=${escapeHtml(version)}" rel="stylesheet"/>
  <script src="/assets/js/redirect.js?v=${escapeHtml(version)}"></script>
  <meta content="0; url=${escapeHtml(to)}" http-equiv="refresh"/>
  <!-- ${REDIRECT_MARKER}: ${escapeHtml(route)} -> ${escapeHtml(to)} -->
</head>
<body class="page page-index">
  <main class="index-main" id="main-content">
    <div class="container container--content">
      <section class="error-card">
        <p class="eyebrow">Постоянный новый адрес</p>
        <h1>Страница перенесена</h1>
        <p>Материал находится по новому адресу.</p>
        <p><a class="button button--primary" href="${escapeHtml(to)}">Открыть материал</a></p>
      </section>
    </div>
  </main>
</body>
</html>
`;
};

export const generateRedirectPages = ({ registryRoot, outputRoot, version }) => {
  const pages = redirectPages(registryRoot);
  for (const page of pages) {
    const targetFile = path.join(outputRoot, redirectRouteToFile(page.to));
    if (!fs.existsSync(targetFile)) {
      throw new Error(`Цель страницы-перенаправления отсутствует в публичной сборке: ${page.to}`);
    }
    const outputFile = path.join(outputRoot, page.file);
    if (fs.existsSync(outputFile)) {
      throw new Error(`Страница-перенаправление конфликтует с публичным файлом: ${page.file}`);
    }
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, renderRedirectPage({ ...page, version }), 'utf8');
  }
  return pages;
};
