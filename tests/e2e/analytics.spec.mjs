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
