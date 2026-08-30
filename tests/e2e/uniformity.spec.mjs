import fs from 'node:fs';
import vm from 'node:vm';
import { expect, test } from '@playwright/test';

const pages = JSON.parse(fs.readFileSync('data/pages.json', 'utf8'));
const assessments = pages.filter(item => item.type === 'assessment').sort((a, b) => a.datePublished.localeCompare(b.datePublished));
const latest = assessments.at(-1);
const searchContext = { window: {} };
vm.runInNewContext(fs.readFileSync('assets/js/search-core.js', 'utf8'), searchContext);
const searchIndex = JSON.parse(fs.readFileSync('data/search-index.json', 'utf8'));
const expectedSearchCount = searchContext.window.KRMSearchIndex.create(searchIndex)
  .find('2026', { limit: searchIndex.documents.length }).length;

test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
});

test('короткий запрос архива после длинного совпадает с прямым открытием', async ({ page }) => {
  await page.goto('/archive/?utm_source=regression#archive-list');
  const input = page.getByLabel('Поиск внутри архива');
  const loaded = page.waitForResponse('**/data/search-index.json');
  await input.fill('контратаки');
  await loaded;
  await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('контратаки');
  await input.fill('ъ');
  await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('ъ');
  const visible = () => page.locator('#archive-list li:not([hidden])').evaluateAll(rows => rows.map(row => row.dataset.url));
  const afterEdit = await visible();
  expect(new URL(page.url()).searchParams.get('utm_source')).toBe('regression');
  expect(new URL(page.url()).hash).toBe('#archive-list');
  await page.goto('/archive/?q=ъ');
  expect(await visible()).toEqual(afterEdit);
});

test('поиск не скрывает совпадения после первых пятидесяти', async ({ page }) => {
  await page.goto('/search/?q=2026');
  expect(expectedSearchCount).toBeGreaterThan(50);
  await expect(page.locator('#search-status')).toHaveText(`Найдено материалов: ${expectedSearchCount}`);
  await expect(page.locator('#search-results .search-result')).toHaveCount(expectedSearchCount);
  await expect(page.locator('#search-results time').first()).toContainText('года');
});

test('архив сообщает о недоступном полнотекстовом индексе', async ({ page }) => {
  await page.route('**/data/search-index.json', route => route.fulfill({ status: 503, body: '{}', contentType: 'application/json' }));
  await page.goto('/archive/?q=Кременная');
  await expect(page.locator('#archive-status')).toContainText('Полнотекстовый поиск недоступен');
  await expect(page.locator('#archive-list li:not([hidden])').first()).toBeVisible();
});

for (const width of [390, 800, 1440]) {
  test(`общий каркас и нижняя навигация оценки при ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(latest.url);
    await expect(page.locator('article.article > header.article-header')).toHaveCount(1);
    await expect(page.locator('article.article > nav.series-nav')).toHaveCount(1);
    await expect(page.locator('article.article nav.article-nav')).toHaveCount(0);
    await expect(page.locator('.series-nav [data-series-kind="previous"]')).toHaveAttribute('href', assessments.at(-2).url);
    const geometry = await page.locator('article.article').evaluate(article => {
      const nav = article.querySelector('.series-nav');
      return { width: article.getBoundingClientRect().width, columns: getComputedStyle(nav).gridTemplateColumns.split(' ').length,
        overflow: document.documentElement.scrollWidth - innerWidth };
    });
    expect(geometry.width).toBeLessThanOrEqual(760.1);
    expect(geometry.columns).toBe(width <= 700 ? 1 : 2);
    expect(geometry.overflow).toBeLessThanOrEqual(1);
  });

  test(`контейнер Кременной и внешние крошки при ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/news/kremennaya/krm-2026-08-14/');
    await expect(page.locator('.breadcrumbs-wrap .breadcrumbs')).toHaveCount(1);
    await expect(page.locator('main .breadcrumbs')).toHaveCount(0);
    const size = await page.locator('article.article').boundingBox();
    expect(size.width).toBeLessThanOrEqual(760.1);
  });
}

test('статус памятки следует за dl-метаданными и использует свои отступы', async ({ page }) => {
  await page.goto('/news/reference/powrlnr-2026-05-13/');
  const state = await page.locator('.article-header').evaluate(header => {
    const meta = header.querySelector('.article-meta');
    const status = header.querySelector('.guide-status');
    return { after: Boolean(meta.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING),
      metaBottom: getComputedStyle(meta).marginBottom, paragraphTop: getComputedStyle(status.querySelector('p')).marginTop };
  });
  expect(state).toEqual({ after: true, metaBottom: '24px', paragraphTop: '3.2px' });
  await expect(page.locator('article.article .breadcrumbs')).toHaveCount(0);
});
