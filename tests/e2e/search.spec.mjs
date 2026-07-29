import { expect, test } from '@playwright/test';

const status = page => page.locator('#search-status');
const results = page => page.locator('#search-results .search-result');
const queryValue = page => new URL(page.url()).searchParams.get('q');

test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
});

test('форма показывает результаты и открывает найденный материал', async ({ page }) => {
  await page.goto('/search/');
  await expect(page.getByRole('heading', { level: 1, name: 'Поиск по архиву' })).toBeVisible();
  await expect(status(page)).toContainText('В индексе');

  await page.getByLabel('Запрос').fill('Кременная');
  await page.getByRole('button', { name: 'Найти' }).click();

  await expect.poll(() => queryValue(page)).toBe('Кременная');
  await expect(status(page)).toContainText('Найдено материалов:');
  await expect(results(page).first()).toBeVisible();

  const link = results(page).first().getByRole('link');
  const href = await link.getAttribute('href');
  expect(href).toBeTruthy();
  const destination = new URL(href, page.url()).href;
  await link.click();
  await expect(page).toHaveURL(destination);
});

test('прямой URL и Back/Forward восстанавливают запрос и результаты', async ({ page }) => {
  await page.goto('/search/?q=выплаты');
  await expect(page.getByLabel('Запрос')).toHaveValue('выплаты');
  await expect(results(page).first()).toBeVisible();

  await page.getByLabel('Запрос').fill('Красный Лиман');
  await page.getByRole('button', { name: 'Найти' }).click();
  await expect.poll(() => queryValue(page)).toBe('Красный Лиман');
  await expect(results(page).first()).toBeVisible();

  await page.goBack();
  await expect.poll(() => queryValue(page)).toBe('выплаты');
  await expect(page.getByLabel('Запрос')).toHaveValue('выплаты');
  await expect(results(page).first()).toBeVisible();

  await page.goForward();
  await expect.poll(() => queryValue(page)).toBe('Красный Лиман');
  await expect(page.getByLabel('Запрос')).toHaveValue('Красный Лиман');
  await expect(results(page).first()).toBeVisible();
});

test('нечёткий запрос предлагает подходящие материалы', async ({ page }) => {
  await page.goto('/search/?q=кременая');

  await expect(status(page)).toContainText('Точных совпадений нет');
  await expect(results(page).first()).toBeVisible();
  await expect(results(page).first()).toContainText('Возможное совпадение');
});

test('ошибка загрузки индекса показана пользователю', async ({ page }) => {
  await page.route('**/data/search-index.json', route => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: '{}'
  }));

  await page.goto('/search/');

  await expect(status(page)).toHaveText('Поисковый индекс недоступен. Используйте полный архив.');
  await expect(results(page)).toHaveCount(0);
});

test('без JavaScript доступна понятная ссылка на полный архив', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
  const page = await context.newPage();

  await page.goto(new URL('/search/', baseURL).href);
  await expect(page.locator('noscript .notice')).toBeVisible();
  await expect(page.locator('#site-search-form')).toHaveAttribute('action', '/search/');
  await expect(page.locator('#site-search-form')).toHaveAttribute('method', 'get');

  await page.getByLabel('Запрос').fill('Кременная');
  await page.getByRole('button', { name: 'Найти' }).click();
  await expect.poll(() => queryValue(page)).toBe('Кременная');
  await expect(page.locator('noscript .notice')).toBeVisible();

  await page.getByRole('link', { name: 'полный архив' }).click();
  await expect(page).toHaveURL(new URL('/archive/', baseURL).href);

  await context.close();
});
