#!/usr/bin/env node
/** Whole-catalog, Git-independent publication preflight.
 * Default: read-only validation. --sync-utm: add only missing ID→ID campaigns.
 * Never rewrites existing campaigns, article HTML, taxonomy or editorial text. */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const args = process.argv.slice(2);
const help = args.includes('--help') || args.includes('-h');
if (help) {
  console.log('node tools/preflight-new-articles.mjs [--sync-utm]\nDefault is read-only. --sync-utm adds missing UTM campaigns for registered pages, preserving historical values.');
  process.exit(0);
}
if (args.some(arg => arg !== '--sync-utm') || args.filter(arg => arg === '--sync-utm').length > 1) {
  console.error('Неизвестная опция. Используйте --help.');
  process.exit(2);
}
const syncUtm = args.includes('--sync-utm');
const at = rel => path.join(root, ...rel.split('/'));
const exists = rel => fs.existsSync(at(rel));
const read = rel => fs.readFileSync(at(rel), 'utf8');
const errorMessages = [];
const issue = text => errorMessages.push(text);
const parse = name => JSON.parse(read(name));
let pages, utm, taxonomy;
try {
  pages = parse('data/pages.json');
  utm = parse('data/utm-campaigns.json');
  taxonomy = parse('data/taxonomy.json');
} catch (error) {
  console.error('Не удалось прочитать реестры публикаций: ' + error.message);
  process.exit(2);
}
if (!Array.isArray(pages) || !utm.campaigns || typeof utm.campaigns !== 'object'
    || !taxonomy.locations || !taxonomy.topics) {
  console.error('Неверная структура pages.json, utm-campaigns.json или taxonomy.json.');
  process.exit(2);
}
const urlPattern = /^\/(?:[a-z0-9_-]+\/)+$/;
const idPattern = /^[a-z0-9][a-z0-9_-]{0,79}$/;
const usedIds = new Set();
const usedUrls = new Set();
const claimedCampaigns = new Set(Object.values(utm.campaigns));
const newCampaigns = [];
for (const page of pages) {
  const prefix = `${page?.id ?? '(нет ID)'}: `;
  if (!idPattern.test(page?.id || '')) { issue(prefix + 'некорректный ID'); continue; }
  if (usedIds.has(page.id)) issue(prefix + 'повторяющийся ID');
  usedIds.add(page.id);
  if (!urlPattern.test(page.url || '')) { issue(prefix + 'некорректный адрес ' + page.url); continue; }
  if (usedUrls.has(page.url)) issue(prefix + 'повтор URL ' + page.url);
  usedUrls.add(page.url);
  for (const location of page.locations || []) {
    if (!Object.hasOwn(taxonomy.locations, location)) issue(prefix + 'нет территории в data/taxonomy.json: ' + location);
  }
  for (const topic of page.topics || []) {
    if (!Object.hasOwn(taxonomy.topics, topic)) issue(prefix + 'нет темы в data/taxonomy.json: ' + topic);
  }
  if (!Object.hasOwn(utm.campaigns, page.id)) {
    if (!syncUtm) issue(prefix + 'нет UTM-кампании; исправление: npm run articles:prepare');
    else if (claimedCampaigns.has(page.id)) issue(prefix + 'коллизия нового UTM ID: ' + page.id);
    else {
      newCampaigns.push(page.id);
      claimedCampaigns.add(page.id);
    }
  }
  const file = page.url.slice(1) + 'index.html';
  if (!exists(file)) { issue(prefix + 'нет HTML-файла ' + file); continue; }
  const html = read(file);
  if (/\sstyle\s*=\s*["']/i.test(html)) issue(file + ': запрещён inline style= по CSP');
  for (const table of html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)) {
    if (!/<caption\b/i.test(table[0])) issue(file + ': таблица без <caption>');
  }
  if (!/<link\b(?=[^>]*rel=["']canonical["'])/i.test(html)) issue(file + ': отсутствует canonical');
  for (const match of html.matchAll(/<img\b[^>]*\bsrc=["'](\/assets\/[^"']+)["']/gi)) {
    if (!exists(match[1].slice(1).split('?')[0])) issue(file + ': отсутствует изображение ' + match[1]);
  }
}
const editorDir = at('editorial');
if (fs.existsSync(editorDir)) {
  for (const entry of fs.readdirSync(editorDir, { withFileTypes: true })) {
    if (entry.isFile() && /_BODY\.html$/i.test(entry.name)) {
      issue('editorial/' + entry.name + ': HTML-фрагмент должен иметь расширение .fragment');
    }
  }
}
const imageRoot = at('assets/img');
if (fs.existsSync(imageRoot)) {
  const stack = [imageRoot];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) stack.push(path.join(dir, entry.name));
      else if (entry.isFile() && entry.name === '.gitkeep') {
        issue(path.relative(root, path.join(dir, entry.name)).replaceAll('\\', '/') + ': пустой файл в дереве изображений');
      }
    }
  }
}
console.log(`Предварительная проверка: ${pages.length} зарегистрированных публикаций (история Git не нужна).`);
if (errorMessages.length) {
  console.error(`Обнаружено проблем: ${errorMessages.length}`);
  for (const message of errorMessages) console.error(' • ' + message);
  process.exitCode = 1;
} else if (syncUtm && newCampaigns.length) {
  for (const id of newCampaigns) utm.campaigns[id] = id;
  fs.writeFileSync(at('data/utm-campaigns.json'), JSON.stringify(utm, null, 2) + '\n');
  console.log('Зарегистрированы UTM-кампании: ' + newCampaigns.join(', '));
  console.log('Сохранены все прежние имена UTM-кампаний и каналов.');
} else {
  console.log(syncUtm ? 'UTM уже синхронизированы, изменений нет.' : 'PASS: типовых ошибок не обнаружено.');
}
