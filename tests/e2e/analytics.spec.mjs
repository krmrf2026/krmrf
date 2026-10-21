import { expect, test } from '@playwright/test';

const blockExternal = page => page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
const calls = page => page.evaluate(() => (window.ym?.a || []).map(args => Array.from(args)));
const goal = async (page, name) => (await calls(page)).find(call => call[1] === 'reachGoal' && call[2] === name) || null;

test('UTM сохраняются до единственной инициализации правильного счётчика',async({page})=>{
 await blockExternal(page);await page.goto('/news/reference/egrn-2026-05-15/?utm_source=max&utm_medium=messenger&utm_campaign=e2e_first_view&utm_content=post');
 const init=(await calls(page)).filter(x=>x[1]==='init');expect(init).toHaveLength(1);expect(init[0][0]).toBe(110383043);expect(init[0][2].defer).not.toBe(true);
 expect(new URL(page.url()).searchParams.get('utm_campaign')).toBe('e2e_first_view');expect(await page.locator('link[rel="canonical"]').getAttribute('href')).toBe('https://krmrf.ru/news/reference/egrn-2026-05-15/');expect(await page.locator('a[href*="utm_"]').count()).toBe(0);
});

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

for (const [id, selector] of [
  ['chto-delat-pri-atake-bpla-lnr', '#sources + table a[href^="https://71.mchs.gov.ru"]'],
  ['rosreestr-lnr-kontakty-2026', 'article a[href^="https://rosreestr.gov.ru"]']
]) test(`источник в таблице или тексте: ${id}`, async ({ page }) => {
  await blockExternal(page); await page.goto(`/news/reference/${id}/`);
  const link = page.locator(selector).first();
  await link.evaluate(node => node.addEventListener('click', event => event.preventDefault(), { once: true }));
  await link.click();
  const call = await goal(page, 'source_click');
  expect(call?.[3]?.host).toBeTruthy(); expect(call?.[3]?.url).toBeUndefined();
});

test('ведомственный канал — источник; каналы KRM РФ — отдельная цель', async ({ page }) => {
  await blockExternal(page); await page.goto('/news/reference/rosreestr-lnr-kontakty-2026/');
  const source = page.locator('article a[href^="https://t.me/r81_rosreestr"]').first();
  await source.evaluate(node => node.addEventListener('click', event => event.preventDefault(), { once: true }));
  await source.click();
  expect(await goal(page, 'channel_click')).toBeNull(); expect(await goal(page, 'source_click')).not.toBeNull();
  for (const host of ['t.me', 'max.ru']) {
    await page.goto('/news/reference/rosreestr-lnr-kontakty-2026/');
    const channel = page.locator(`.site-footer a[href="https://${host}/xykrm"]`);
    await channel.evaluate(node => { node.dataset.source = ''; node.addEventListener('click', event => event.preventDefault(), { once: true }); });
    await channel.click();
    expect((await goal(page, 'channel_click'))?.[3]?.channel).toBe(host === 't.me' ? 'telegram' : 'max');
    expect(await goal(page, 'source_click')).toBeNull();
  }
});

test('кредит фотографии и телефон не считаются источником', async ({ page }) => {
  await blockExternal(page); await page.goto('/news/reference/nedvizhimost-lnr-gid/');
  const credit = page.locator('figcaption a[href^="https:"]').first();
  await expect(credit).toBeVisible();
  await credit.evaluate(node => node.addEventListener('click', event => event.preventDefault(), { once: true }));
  await credit.click(); expect(await goal(page, 'source_click')).toBeNull();
  await page.evaluate(() => {
    const link = document.createElement('a'); link.href = 'tel:112'; link.dataset.source = '';
    link.addEventListener('click', e => e.preventDefault()); document.querySelector('article').append(link); link.click();
  });
  expect(await goal(page, 'source_click')).toBeNull();
});
