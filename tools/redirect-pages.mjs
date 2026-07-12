import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const SITE_URL = 'https://krmrf.ru';
const REDIRECTS_FILE = path.join(ROOT, '_redirects');

const MARKER = 'KRM GENERATED HTML REDIRECT';

const norm = value => {
  let url = String(value || '').trim();

  if (!url.startsWith('/')) url = `/${url}`;
  url = url.replace(/\/+/g, '/');

  if (!url.endsWith('/')) url += '/';

  return url;
};

const escapeHtml = value => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

const routeToFile = route => {
  const parts = norm(route).split('/').filter(Boolean);
  return path.join(ROOT, ...parts, 'index.html');
};

const makeHtml = (from, to) => {
  const targetAbs = to.startsWith('http')
    ? to
    : `${SITE_URL}${norm(to)}`;

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <title>Страница перенесена — KRM РФ</title>
  <meta name="robots" content="noindex,follow">
  <link rel="canonical" href="${escapeHtml(targetAbs)}">
  <meta http-equiv="refresh" content="0; url=${escapeHtml(targetAbs)}">
  <!-- ${MARKER}: ${escapeHtml(from)} -> ${escapeHtml(to)} -->
</head>
<body>
  <main>
    <h1>Страница перенесена</h1>
    <p>Материал находится по новому адресу:</p>
    <p><a href="${escapeHtml(norm(to))}">${escapeHtml(norm(to))}</a></p>
  </main>
</body>
</html>
`;
};

if (!fs.existsSync(REDIRECTS_FILE)) {
  throw new Error('Не найден _redirects. Сначала запусти npm run redirects.');
}

const redirectsText = fs.readFileSync(REDIRECTS_FILE, 'utf8');

const rules = new Map();

for (const line of redirectsText.split(/\r?\n/)) {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith('#')) continue;

  const [fromRaw, toRaw, statusRaw] = trimmed.split(/\s+/);

  if (!fromRaw || !toRaw) continue;
  if (statusRaw && !/^30[1278]$/.test(statusRaw)) continue;

  const from = norm(fromRaw);
  const to = norm(toRaw);

  if (from === to) continue;

  const destinationFile = routeToFile(to);

  if (!fs.existsSync(destinationFile)) {
    console.warn(`Пропуск: цель не найдена: ${from} -> ${to}`);
    continue;
  }

  const redirectFile = routeToFile(from);

  const previous = rules.get(redirectFile);

  if (previous && previous.to !== to) {
    throw new Error(`Конфликт для ${from}: ${previous.to} и ${to}`);
  }

  rules.set(redirectFile, { from, to });
}

let created = 0;
let updated = 0;
let skipped = 0;

for (const [file, rule] of [...rules.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  if (fs.existsSync(file)) {
    const current = fs.readFileSync(file, 'utf8');

    if (!current.includes(MARKER)) {
      console.warn(`Пропуск: файл уже существует и не похож на redirect-page: ${path.relative(ROOT, file)}`);
      skipped++;
      continue;
    }

    fs.writeFileSync(file, makeHtml(rule.from, rule.to), 'utf8');
    updated++;
    continue;
  }

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, makeHtml(rule.from, rule.to), 'utf8');
  created++;
}

console.log(`HTML-редиректы готовы.`);
console.log(`Создано: ${created}`);
console.log(`Обновлено: ${updated}`);
console.log(`Пропущено: ${skipped}`);
