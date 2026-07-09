import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const SITE_URL = 'https://krmrf.ru';
const REDIRECTS_FILE = path.join(ROOT, '_redirects');
const PAGES_FILE = path.join(ROOT, 'data', 'pages.json');

const START = '# BEGIN KRM AUTO REDIRECTS';
const END = '# END KRM AUTO REDIRECTS';

const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const norm = value => {
  let url = String(value || '').trim();
  if (!url.startsWith('/')) url = `/${url}`;
  url = url.replace(/\/+/g, '/');
  if (!url.endsWith('/')) url += '/';
  return url;
};

const withoutTrailingSlash = url => {
  return url.endsWith('/') && url !== '/' ? url.slice(0, -1) : url;
};

const routeToFile = url => {
  return path.join(ROOT, ...norm(url).split('/').filter(Boolean), 'index.html');
};

if (!fs.existsSync(PAGES_FILE)) {
  throw new Error('Не найден data/pages.json. Запусти скрипт из корня проекта.');
}

const pages = JSON.parse(fs.readFileSync(PAGES_FILE, 'utf8'));
const currentRedirects = fs.existsSync(REDIRECTS_FILE)
  ? fs.readFileSync(REDIRECTS_FILE, 'utf8')
  : '';

const preserved = currentRedirects
  .replace(new RegExp(`${escapeRegExp(START)}[\\s\\S]*?${escapeRegExp(END)}\\n?`, 'g'), '')
  .replace(/\s+$/g, '');

const preservedRules = new Map();

for (const line of preserved.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;

  const [from, to, status] = trimmed.split(/\s+/);
  if (from && to && /^30[18]$/.test(status || '')) {
    preservedRules.set(from, { to, status });
  }
}

const generated = new Map();

function add(from, to) {
  from = norm(from);
  to = norm(to);

  if (from === to) return;

  const destinationFile = routeToFile(to);

  if (!fs.existsSync(destinationFile)) {
    throw new Error(
      `Не найден destination для редиректа: ${from} -> ${to}\n` +
      `Ожидался файл: ${path.relative(ROOT, destinationFile)}`
    );
  }

  for (const variant of [from, withoutTrailingSlash(from)]) {
    if (preservedRules.has(variant)) continue;

    const previous = generated.get(variant);
    if (previous && previous.to !== to) {
      throw new Error(`Конфликт редиректов для ${variant}: ${previous.to} и ${to}`);
    }

    generated.set(variant, { to, status: '301' });
  }
}

/**
 * Явные редиректы из Яндекс.Вебмастера / старой структуры.
 */
const explicit = [
  ['/news/egrn-2026-05-15/', '/news/reference/egrn-2026-05-15/'],
  ['/news/zemlyalnr-2026-05-04/', '/news/reference/zemlyalnr-2026-05-04/'],
  ['/news/bobp-2026-03-04/', '/news/reference/bobp-2026-03-04/'],
  ['/news/evak-2026-03-10/', '/news/reference/evak-2026-03-10/'],
  ['/news/lnr-vyplaty-terakt-118-26/', '/news/reference/lnr-vyplaty-terakt-118-26/'],
  ['/news/beshoz-2026-04-21/', '/news/reference/beshoz-2026-04-21/'],
  ['/news/beshoz-2026-07-01/', '/news/reference/beshoz-2026-07-01/'],
  ['/news/powrlnr-2026-05-13/', '/news/reference/powrlnr-2026-05-13/'],
  ['/news/vuplatylnr-2026-05-25/', '/news/reference/vuplatylnr-2026-05-25/'],

  ['/news/svo-2026-03-06/', '/news/svo/svo-2026-03-06/'],
  ['/news/svo-2026-04-24/', '/news/svo/svo-2026-04-24/'],
  ['/news/svo-2026-05-06/', '/news/svo/svo-2026-05-06/'],
  ['/news/svo-2026-05-15/', '/news/svo/svo-2026-05-15/'],
  ['/news/svo-2026-05-21/', '/news/svo/svo-2026-05-21/'],
  ['/news/svo-2026-06-09/', '/news/svo/svo-2026-06-09/'],
  ['/news/svo-2026-07-02/', '/news/svo/svo-2026-07-02/'],
  ['/news/kartasvo-2026-05-19/', '/news/svo/kartasvo-2026-05-19/'],
  ['/news/geo-2026-03-16/', '/news/svo/geo-2026-03-16/'],
  ['/news/liman-slavyansk-2026-02-22/', '/news/svo/liman-slavyansk-2026-02-22/'],
  ['/news/vsy-2026-03-31/', '/news/svo/vsy-2026-03-31/'],

  ['/news/bpla-lnr-2026-05-27/', '/news/civilian-impact/bpla-lnr-2026-05-27/'],
  ['/news/bpla-lnr-2026-07-08/', '/news/civilian-impact/bpla-lnr-2026-07-08/'],

  ['/news/kremennaya-2026-02-18/', '/news/kremennaya/kremennaya-2026-02-18/'],
  ['/news/kremennaya-2026-04-16/', '/news/kremennaya/kremennaya-2026-04-16/'],
  ['/news/Kremennaya-2026-04-16/', '/news/kremennaya/kremennaya-2026-04-16/'],
  ['/news/kremennaya-2026-04-28/', '/news/kremennaya/kremennaya-2026-04-28/'],
  ['/news/Kremennaya-2026-04-28/', '/news/kremennaya/kremennaya-2026-04-28/'],
  ['/news/krm-2026-05-16/', '/news/kremennaya/krm-2026-05-16/'],
  ['/news/krm-2026-06-06/', '/news/kremennaya/krm-2026-06-06/'],
  ['/news/krm-2026-06-24/', '/news/kremennaya/krm-2026-06-24/'],
  ['/news/krm-23-03-2026/', '/news/kremennaya/krm-23-03-2026/'],
  ['/news/krm9may-2026-05-09/', '/news/kremennaya/krm9may-2026-05-09/'],

  ['/news/hungary-2026-04-13/', '/news/politics/hungary-2026-04-13/'],
  ['/news/iran-2026-03-02/', '/news/politics/iran-2026-03-02/'],
  ['/news/iranoil-2026-04-09/', '/news/politics/iranoil-2026-04-09/'],
  ['/news/odessarus-2026-05-02/', '/news/politics/odessarus-2026-05-02/'],

  ['/news/lnr-2026-05-12/', '/news/lnr/lnr-2026-05-12/'],
  ['/news/posle-gosudarstva-2026-06-12/', '/news/lnr/posle-gosudarstva-2026-06-12/']
];

for (const [from, to] of explicit) {
  add(from, to);
}

/**
 * Автоматически добавляем старые адреса вида:
 * /news/slug/ -> /news/reference/slug/
 * /news/slug/ -> /news/svo/slug/
 * /news/slug/ -> /news/kremennaya/slug/
 */
for (const page of pages) {
  const url = norm(page.url || '');
  const parts = url.split('/').filter(Boolean);

  if (parts[0] !== 'news' || parts.length !== 3) continue;

  const section = parts[1];
  const slug = parts[2];

  add(`/news/${slug}/`, url);

  if (page.id && page.id !== slug) {
    add(`/news/${page.id}/`, url);
  }

  if (section === 'kremennaya') {
    add(`/news/${slug.charAt(0).toUpperCase()}${slug.slice(1)}/`, url);
  }
}

const rules = [...generated.entries()]
  .sort(([a], [b]) => a.localeCompare(b, 'ru'));

const block = rules.length
  ? `${START}\n${rules.map(([from, rule]) => `${from} ${rule.to} ${rule.status}`).join('\n')}\n${END}`
  : '';

fs.writeFileSync(
  REDIRECTS_FILE,
  `${preserved}${preserved ? '\n\n' : ''}${block}\n`,
  'utf8'
);

console.log(`Готово: добавлено ${rules.length} redirect-правил в _redirects.`);
console.log('Проверь дальше: npm run build && npm run validate && npm run test:smoke');
