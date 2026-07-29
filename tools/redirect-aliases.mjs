import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  REDIRECT_REGISTRY,
  normalizeRedirectRoute,
  readRedirectRules,
  redirectRouteToFile
} from './lib/redirects.mjs';

const ROOT = path.resolve(process.cwd());
const file = path.join(ROOT, REDIRECT_REGISTRY);
const normalized = new Map();

const add = (fromRaw, toRaw, status = 301) => {
  const from = normalizeRedirectRoute(fromRaw);
  const to = normalizeRedirectRoute(toRaw);
  const previous = normalized.get(from);
  if (previous && previous.to !== to) {
    throw new Error(`Конфликт целей для ${from}: ${previous.to} и ${to}.`);
  }
  const targetFile = path.join(ROOT, redirectRouteToFile(to));
  if (!fs.existsSync(targetFile)) {
    throw new Error(`Не найдена цель старого URL: ${from} -> ${to}.`);
  }
  if (!previous) normalized.set(from, { to, status });
};

for (const rule of readRedirectRules(ROOT)) add(rule.from, rule.to, rule.status);

// Единственный исторический маршрут, найденный в сохранённой статистике, но
// отсутствовавший в r11. Историю карт не возвращаем: ведём на текущую карту.
add('/map/archive/', '/map/', 301);

const rules = [...normalized.entries()]
  .sort(([left], [right]) => left.localeCompare(right, 'ru'));
const output = [
  '# INTERNAL URL REGISTRY — GitHub Pages does not execute this file.',
  '# tools/export-public.mjs generates one static HTML document per route in dist.',
  '# Sources are normalized to the trailing-slash form served by GitHub Pages.',
  ...rules.map(([from, rule]) => `${from} ${rule.to} ${rule.status}`),
  ''
].join('\n');

fs.writeFileSync(file, output, 'utf8');
console.log(`Реестр нормализован: ${rules.length} проверенных старых адресов.`);
console.log('Публичные HTML-страницы создаются только командой npm run export:public.');
