import fs from 'node:fs';
import path from 'node:path';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import '../assets/js/search-core.js';

const samples = 5;
const query = 'потерял связь с родными';
const bytes = fs.readFileSync('data/search-index.json');
const stats = values => {
  const order = [...values].sort((a, b) => a - b);
  return { min: order[0], median: order[Math.floor(order.length / 2)], max: order.at(-1) };
};
const cpu = [];
for (let i = 0; i < samples; i++) {
  const start = performance.now();
  const engine = globalThis.KRMSearchIndex.create(JSON.parse(bytes));
  const ready = performance.now();
  if (!engine.find(query)[0]?.document.url.endsWith('/poisk-evakuirovannogo-grazhdanskogo/')) throw new Error('Неверный первый результат');
  cpu.push({ readyMs: ready - start, findMs: performance.now() - ready });
}
const report = { node: process.version, indexBytes: bytes.length, localGzip9: gzipSync(bytes, { level: 9 }).length,
  cpu: { samples, parseAndIndexMs: stats(cpu.map(s => s.readyMs)), queryMs: stats(cpu.map(s => s.findMs)) } };
if (!process.argv.includes('--cpu-only')) {
  if (!fs.existsSync('dist/search/index.html')) throw new Error('Нужна сборка и npm run export:public.');
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch(process.env.KRM_CHROMIUM_PATH ? { executablePath: process.env.KRM_CHROMIUM_PATH } : {});
  const server = spawn(process.execPath, ['tools/serve.mjs'], { env: { ...process.env, HOST: '127.0.0.1', PORT: '0', KRM_SERVE_DIR: 'dist' } });
  try {
    const origin = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Не запустился локальный просмотр')), 10000);
      let output = '';
      server.stdout.on('data', data => {
        output += data;
        const match = output.match(/localhost:(\d+)\//);
        if (match) { clearTimeout(timer); resolve('http://127.0.0.1:' + match[1]); }
      });
      server.once('error', error => { clearTimeout(timer); reject(error); });
      server.once('exit', () => { clearTimeout(timer); reject(new Error('Локальный просмотр завершился')); });
    });
    report.browser = { version: browser.version(), rttMs: 150, downKbit: 1600, upKbit: 750,
      server: 'Встроенный HTTP-просмотр dist с ETag, без транспортного сжатия. Эмуляция Chromium.', devices: [] };
    for (const [device, width, height] of [['phone', 390, 844], ['tablet', 820, 1180]]) {
      const runs = [];
      for (let pair = 1; pair <= samples; pair++) {
        const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true });
        try {
          const page = await context.newPage();
          const cdp = await context.newCDPSession(page);
          await cdp.send('Network.enable');
          // Playwright route() disables the browser cache. CDP blocks analytics without doing so.
          await cdp.send('Network.setBlockedURLs', { urls: ['https://*'] });
          await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150,
            downloadThroughput: 1600000 / 8, uploadThroughput: 750000 / 8 });
          for (const visit of ['cold', 'warm']) {
            await page.goto(origin + '/search/', { waitUntil: 'domcontentloaded' });
            await page.waitForFunction(() => document.querySelector('#search-status')?.textContent.includes('В индексе'));
            const entry = await page.evaluate(() => {
              const e = performance.getEntriesByType('resource').find(r => r.name.endsWith('/data/search-index.json'));
              if (!e) throw new Error('Нет Resource Timing индекса');
              return { readyMs: performance.now(), transferBytes: e.transferSize, encodedBodyBytes: e.encodedBodySize };
            });
            await page.locator('#site-search-input').fill(query);
            const start = await page.evaluate(() => performance.now());
            await page.locator('#site-search-form').evaluate(form => form.requestSubmit());
            await page.waitForFunction(() => document.querySelector('#search-results h2 a')?.pathname.endsWith('/poisk-evakuirovannogo-grazhdanskogo/'));
            runs.push({ pair, visit, ...entry, resultMs: await page.evaluate(() => performance.now()) - start });
            await page.goto('about:blank');
          }
        } finally { await context.close(); }
      }
      const summary = Object.fromEntries(['cold', 'warm'].map(visit => {
        const rows = runs.filter(r => r.visit === visit);
        return [visit, Object.fromEntries(['readyMs', 'resultMs', 'transferBytes'].map(k => [k, stats(rows.map(r => r[k]))]))];
      }));
      report.browser.devices.push({ device, width, height, runs, summary });
    }
  } finally {
    const done = server.exitCode === null ? once(server, 'exit').catch(() => {}) : Promise.resolve();
    server.kill();
    await Promise.all([browser.close(), done]);
  }
}
const out = path.join('.cache', process.argv.includes('--cpu-only') ? 'search-cpu.json' : 'search-lab.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
