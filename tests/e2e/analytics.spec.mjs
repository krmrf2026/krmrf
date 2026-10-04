import { expect, test } from '@playwright/test';

const blockExternal = page => page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
const calls = page => page.evaluate(() => (window.ym?.a || []).map(args => Array.from(args)));
const goal = async (page, name) => (await calls(page)).find(call => call[1] === 'reachGoal' && call[2] === name) || null;

test('переход с главной фиксирует home_route', async ({ page }) => {
  await blockExternal(page); await page.goto('/?utm_source=telegram&utm_medium=messenger&utm_campaign=e2e');
  const link = page.locator('a[href="/map/"]').first();
  await link.evaluate(node => node.addEventListener('click', event => event.preventDefault(), { once: true }));
  await link.click();
  expect(await goal(page, 'home_route')).not.toBeNull();
});

test('второй материал фиксируется, якорь той же статьи — нет', async ({ page }) => {
  await blockExternal(page); await page.goto('/news/reference/bobp-2026-03-04/?utm_source=telegram&utm_medium=messenger&utm_campaign=e2e');
  const anchor = page.locator('article.article a[href^="#"]').first();
  if (await anchor.count()) {
    await anchor.evaluate(node => node.addEventListener('click', event => event.preventDefault(), { once: true }));
    await anchor.click();
    expect(await goal(page, 'content_continue')).toBeNull();
  }
  const link = page.locator('article.article a[href="/news/reference/egrn-2026-05-15/"]').first();
  await expect(link).toBeVisible();
  await link.evaluate(node => node.addEventListener('click', event => event.preventDefault(), { once: true }));
  await link.click();
  expect(await goal(page, 'content_continue')).not.toBeNull();
});

test('глубина чтения создаёт отдельные цели 50% и 90%', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await blockExternal(page);
  await page.goto('/news/reference/bobp-2026-03-04/');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(async () => Boolean(await goal(page, 'read_50'))).toBe(true);
  await expect.poll(async () => Boolean(await goal(page, 'read_90'))).toBe(true);
});

test('клик по источнику фиксирует только host, без полного URL', async ({ page }) => {
  await blockExternal(page); await page.goto('/news/reference/bobp-2026-03-04/');
  const link = page.locator('.source-list a[href^="http"]').first();
  await expect(link).toBeVisible();
  await link.evaluate(node => node.addEventListener('click', event => event.preventDefault(), { once: true }));
  await link.click();
  const call = await goal(page, 'source_click');
  expect(call).not.toBeNull();
  expect(call[3]?.host).toBeTruthy();
  expect(call[3]?.url).toBeUndefined();
});

test('поиск фиксирует отправку и открытие результата без текста запроса', async ({ page }) => {
  await blockExternal(page); await page.goto('/search/');
  await page.fill('#site-search-input', 'Кременная тест');
  await page.locator('#site-search-form button[type="submit"]').click();
  const submit = await goal(page, 'search_submit');
  expect(submit).not.toBeNull();
  expect(submit[3]?.length).toBeGreaterThan(0);
  expect(submit[3]?.words).toBe(2);
  expect(submit[3]?.query).toBeUndefined();
  expect(submit[3]?.text).toBeUndefined();

  await page.locator('#search-results').evaluate(node => { node.innerHTML = '<a href="/map/">Карта</a>'; });
  const link = page.locator('#search-results a[href="/map/"]');
  await link.evaluate(node => node.addEventListener('click', event => event.preventDefault(), { once: true }));
  await link.click();
  const result = await goal(page, 'search_result_click');
  expect(result).not.toBeNull();
  expect(result[3]?.target).toBe('/map/');
});

test('действие на карте фиксируется отдельной целью', async ({ page }) => {
  await blockExternal(page); await page.goto('/map/');
  await page.locator('#resetMapBtn').click();
  const call = await goal(page, 'map_action');
  expect(call).not.toBeNull();
  expect(call[3]?.action).toBe('fit_all');
});

test('переход в Telegram или MAX фиксируется как channel_click', async ({ page }) => {
  await blockExternal(page); await page.goto('/');
  const link = page.locator('.site-footer a[href="https://t.me/xykrm"]').first();
  await link.evaluate(node => node.addEventListener('click', event => event.preventDefault(), { once: true }));
  await link.click();
  const call = await goal(page, 'channel_click');
  expect(call).not.toBeNull();
  expect(call[3]?.channel).toBe('telegram');
  expect(call[3]?.placement).toBe('footer');
});
