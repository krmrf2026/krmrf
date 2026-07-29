import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { listPublicFiles } from '../../tools/lib/project.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const pages = JSON.parse(fs.readFileSync(new URL('../../data/pages.json', import.meta.url), 'utf8'));
const fileToRoute = file => {
  if (file === 'index.html') return '/';
  if (file.endsWith('/index.html')) return `/${file.slice(0, -'index.html'.length)}`;
  return `/${file}`;
};
const routes = listPublicFiles(ROOT)
  .filter(file => file.endsWith('.html'))
  .filter(file => !/^(?:google|yandex_)[a-z0-9]+\.html$/i.test(path.basename(file)))
  .filter(file => /<html\b/i.test(fs.readFileSync(path.join(ROOT, file), 'utf8')))
  .map(fileToRoute)
  .sort((a, b) => a.localeCompare(b, 'ru'));

const blockExternalRequests = page => page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());

test('браузерный контракт охватывает весь публичный HTML, а не выборочные страницы', () => {
  expect(routes.length).toBeGreaterThan(70);
  expect(new Set(routes).size).toBe(routes.length);
  expect(routes).toContain('/');
  expect(routes).toContain('/404.html');
  expect(routes).toContain('/map/');
  expect(routes).toContain('/privacy/');
});

for (const viewport of [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 1000 }
]) {
  test.describe(`${viewport.name}: все канонические страницы`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const route of routes) {
      test(`${route} открывается без поломки макета`, async ({ page }) => {
        const pageErrors = [];
        const localFailures = [];
        const cspErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message));
        page.on('console', message => {
          if (message.type() === 'error' && /content security policy|refused to/i.test(message.text())) {
            cspErrors.push(message.text());
          }
        });
        page.on('requestfailed', request => {
          if (new URL(request.url()).hostname === '127.0.0.1') {
            localFailures.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText || 'ошибка'}`);
          }
        });
        await blockExternalRequests(page);

        const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
        expect(response?.status(), `${route}: HTTP`).toBe(200);
        await expect(page.locator('main#main-content')).toBeVisible();
        await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);

        const overflow = await page.evaluate(() => ({
          viewport: document.documentElement.clientWidth,
          content: document.documentElement.scrollWidth
        }));
        expect(
          overflow.content - overflow.viewport,
          `${route}: горизонтальный выход за экран ${overflow.content - overflow.viewport}px`
        ).toBeLessThanOrEqual(1);
        expect(pageErrors, `${route}: необработанные ошибки JavaScript`).toEqual([]);
        expect(localFailures, `${route}: локальные ресурсы не загрузились`).toEqual([]);
        expect(cspErrors, `${route}: ресурсы нарушают meta CSP`).toEqual([]);
      });
    }
  });
}

test('мобильное меню открывается, закрывается по Escape и возвращает фокус', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await blockExternalRequests(page);
  await page.goto('/');

  const button = page.getByRole('button', { name: 'Разделы' });
  const navigation = page.locator('#site-navigation');
  await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await expect(navigation).toHaveClass(/is-open/);

  await page.keyboard.press('Escape');
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await expect(navigation).not.toHaveClass(/is-open/);
  await expect(button).toBeFocused();
});

test('архив фильтрует материалы, сохраняет параметры и сбрасывается', async ({ page }) => {
  await blockExternalRequests(page);
  await page.goto('/archive/?type=guide&q=ЕГРН');

  const guideFilter = page.locator('[data-filter-group="type"][data-filter-value="guide"]');
  await expect(guideFilter).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Поиск внутри архива')).toHaveValue('ЕГРН');
  await expect(page.locator('#archive-status')).toContainText('Показано материалов:');

  const visibleRows = page.locator('#archive-list li:not([hidden])');
  await expect(visibleRows.first()).toBeVisible();
  expect(await visibleRows.count()).toBeGreaterThan(0);
  for (const type of await visibleRows.evaluateAll(rows => rows.map(row => row.dataset.type))) {
    expect(type).toBe('guide');
  }

  await page.getByRole('button', { name: 'Сбросить поиск и фильтры' }).click();
  await expect(page).toHaveURL(/\/archive\/$/);
  await expect(page.getByLabel('Поиск внутри архива')).toHaveValue('');
  await expect(page.locator('#archive-list li:not([hidden])')).toHaveCount(pages.length);
});

test('карта запускается и корректно входит в полноэкранный режим', async ({ page }) => {
  await blockExternalRequests(page);
  await page.goto('/map/');

  await expect(page.locator('#map.leaflet-container')).toBeVisible();
  await expect(page.locator('#map .leaflet-map-pane')).toHaveCount(1);
  await expect(page.locator('#mapUpdated')).not.toHaveText('');

  await page.getByRole('button', { name: 'Развернуть карту' }).click();
  await expect(page.locator('#mapWrapper')).toHaveClass(/fullscreen/);
  await page.getByRole('button', { name: 'Свернуть карту' }).click();
  await expect(page.locator('#mapWrapper')).not.toHaveClass(/fullscreen/);
  await expect(page.getByRole('button', { name: 'Развернуть карту' })).toBeFocused();
});

test('главная не повторяет публикации между продуктовыми блоками', async ({ page }) => {
  await blockExternalRequests(page);
  await page.goto('/');

  const urls = await page.locator('main .material-card h2 a').evaluateAll(links => links.map(link => link.getAttribute('href')));
  expect(urls.length).toBeGreaterThan(0);
  expect(new Set(urls).size).toBe(urls.length);
});

test('страница старого адреса переносит query и hash на канонический URL', async ({ page }) => {
  await blockExternalRequests(page);
  await page.goto('/news/bobp-2026-03-04?utm_source=e2e&utm_medium=test#legacy');

  await expect(page).toHaveURL(
    /\/news\/reference\/bobp-2026-03-04\/\?utm_source=e2e&utm_medium=test#legacy$/
  );
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
});

test('без JavaScript мгновенный meta refresh сохраняет старый адрес карты', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
  const page = await context.newPage();

  await page.goto(new URL('/map/archive/', baseURL).href);
  await expect(page).toHaveURL(new URL('/map/', baseURL).href);
  await expect(page.getByRole('heading', { level: 1, name: 'Карта СВО' })).toBeVisible();

  await context.close();
});
