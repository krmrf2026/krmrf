import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { core } from './lib/map-statistics.mjs';
try { execFileSync(process.execPath, [fileURLToPath(new URL('./map-statistics.mjs', import.meta.url)), '--check'], { cwd: process.cwd(), stdio: ['ignore', 'ignore', 'pipe'] }); }
catch { throw new Error('Статистика не прошла воспроизводимую проверку. Выполните npm run build и npm run map:verify перед получением поста.'); }
const data = JSON.parse(fs.readFileSync('data/map-statistics.json', 'utf8'));
const zones = JSON.parse(fs.readFileSync('data/zones.geojson', 'utf8'));
if (data.current !== zones.updated) throw new Error('Статистика устарела: сначала выполните npm run build.');
const arg = prefix => process.argv.find(a => a.startsWith(prefix))?.slice(prefix.length);
const month = arg('--month='), period = arg('--period=') || 'latest';
const summary = month ? data.monthly.find(m => m.month === month) : data.periods[period];
if (!summary) throw new Error('Период не найден. Используйте --period=latest|7d|30d|all|month или --month=YYYY-MM.');
console.log(core.post(summary, month ? `изменения, опубликованные в ${month}` : period === 'latest' ? 'последнее обновление' : period === 'month' ? 'месяц последнего среза' : 'выбранный период'));
