import { test, expect } from '@playwright/test';
import fs from 'node:fs';
const data = JSON.parse(fs.readFileSync('data/map-statistics.json', 'utf8'));
const area = (value, signed = false) => {
  if (!Number.isFinite(value)) return 'нет данных';
  const abs = Math.abs(value), prefix = signed && value > 0 ? '+' : value < 0 ? '−' : '';
  return prefix + (abs > 1e-7 && abs < 0.05 ? '<0,1' : abs.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })) + ' км²';
};
const blockExternal = page => page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
const ready = async page => { await blockExternal(page); await page.goto('/map/'); await expect(page.locator('#mapStatsPeriod')).toBeEnabled(); };
const figures = async (page, summary) => {
  for (const [i, key] of ['addedKm2', 'removedKm2', 'netKm2'].entries()) await expect(page.locator('#mapStatsValue' + i)).toHaveText(area(summary.status === 'ok' || summary.status === 'updated' ? summary[key] : null, i === 2));
};
test('статистика: компактная сводка без CSV, журнала и лишних периодов', async ({ page }) => {
  await ready(page); await figures(page, data.periods.latest);
  expect(await page.locator('#mapStatsPeriod option').evaluateAll(options => options.map(o => o.value))).toEqual(['latest', 'day', 'month']);
  await expect(page.locator('#mapStatsDayControl')).toBeHidden(); await expect(page.locator('#mapStatsMonthControl')).toBeHidden();
  await expect(page.locator('#mapStatistics details[open]')).toHaveCount(0);
  await expect(page.locator('#mapStatistics details #mapStatsCopy')).toHaveCount(0);
  await expect(page.locator('#mapStatistics a[download], #mapStatsCustom, #mapStatsFrom, #mapStatsTo')).toHaveCount(0);
  await expect(page.locator('#mapStatistics')).not.toContainText('Полнота истории');
  await expect(page.locator('#mapStatistics')).not.toContainText('Что именно рассчитано');
});
test('выбор дня показывает все опубликованные в нём обновления и согласованный текст', async ({ page }) => {
  await ready(page); await page.locator('#mapStatsPeriod').selectOption('day');
  await expect(page.locator('#mapStatsDayControl')).toBeVisible(); await expect(page.locator('#mapStatsMonthControl')).toBeHidden();
  const value = await page.locator('#mapStatsDay').inputValue(), selected = data.daily.find(d => d.date === value);
  await figures(page, selected); await expect(page.locator('#mapStatsPost')).toHaveValue(/обновления за/);
  const baseline = data.daily.find(d => d.status === 'baseline');
  const options = await page.locator('#mapStatsDay option').evaluateAll(items => items.map(o => o.value));
  if (baseline && options.includes(baseline.date)) {
    await page.locator('#mapStatsDay').selectOption(baseline.date); await figures(page, {});
    await expect(page.locator('#mapStatsPost')).toHaveValue(/Недостаточно/);
  }
});
test('выбор месяца меняет числа и короткие оговорки в посте', async ({ page }) => {
  await ready(page); await page.locator('#mapStatsPeriod').selectOption('month');
  await expect(page.locator('#mapStatsMonthControl')).toBeVisible(); await expect(page.locator('#mapStatsDayControl')).toBeHidden();
  await figures(page, data.periods.month);
  if (data.periods.month.crossesMonthBoundary) {
    await expect(page.locator('#mapStatsCoverage')).toContainText('предыдущем месяце');
    await expect(page.locator('#mapStatsPost')).toHaveValue(/разделить его по месяцам нельзя/);
  }
  const first = await page.locator('#mapStatsMonth option').last().getAttribute('value');
  await page.locator('#mapStatsMonth').selectOption(first); await figures(page, data.monthly.find(m => m.month === first));
});
test('копирование без раскрытия текста получает ровно выбранный пост', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']); await ready(page);
  const expected = await page.locator('#mapStatsPost').inputValue();
  await page.locator('#mapStatsCopy').click(); await expect(page.locator('#mapStatsStatus')).toHaveText('Текст скопирован.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(expected);
  await expect(page.locator('#mapStatsPostPreview')).not.toHaveAttribute('open', '');
});
test('отказ буфера раскрывает текст и выделяет его целиком', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('denied'); } } }));
  await ready(page); await page.locator('#mapStatsCopy').click();
  await expect(page.locator('#mapStatsPostPreview')).toHaveAttribute('open', '');
  await expect(page.locator('#mapStatsStatus')).toContainText('вручную');
  expect(await page.locator('#mapStatsPost').evaluate(el => [el.selectionStart, el.selectionEnd])).toEqual([0, (await page.locator('#mapStatsPost').inputValue()).length]);
});
for (const failure of ['http', 'version']) {
  test('сбой ' + failure + ' сохраняет статичную сводку и копирование', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']); await blockExternal(page);
    await page.route('**/data/map-statistics.json*', route => route.fulfill(failure === 'http' ? { status: 503, body: '{}' } : { contentType: 'application/json', body: JSON.stringify({ ...data, fingerprint: 'wrong' }) }));
    await page.goto('/map/'); await figures(page, data.periods.latest);
    await expect(page.locator('#mapStatsPeriod')).toBeDisabled(); await expect(page.locator('#mapStatsStatus')).toContainText('Сохранённая сводка');
    const expected = await page.locator('#mapStatsPost').inputValue(); await page.locator('#mapStatsCopy').click();
    await expect(page.locator('#mapStatsStatus')).toHaveText('Текст скопирован.'); expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(expected);
  });
}
test('потерянное обновление при совпадающем ключе сохраняет проверенные статичные данные', async ({ page }) => {
  await blockExternal(page);
  const incomplete = structuredClone(data); incomplete.intervals.splice(1, 1);
  await page.route('**/data/map-statistics.json*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(incomplete) }));
  await page.goto('/map/'); await figures(page, data.periods.latest);
  await expect(page.locator('#mapStatsPeriod')).toBeDisabled(); await expect(page.locator('#mapStatsStatus')).toContainText('Сохранённая сводка');
});
test('сентябрь: весь месяц и ранние дни доступны; отрицательный район сохранён в посте', async ({ page }) => {
  const september = data.monthly.find(m => m.month === '2026-09');
  test.skip(!september?.sectors?.length, 'В этом архиве нет сентябрьской региональной сводки.');
  await ready(page); await page.locator('#mapStatsPeriod').selectOption('month'); await page.locator('#mapStatsMonth').selectOption('2026-09');
  await figures(page, september); await expect(page.locator('#mapStatsSectors')).toBeVisible();
  await page.locator('#mapStatsSectors summary').click();
  for (const row of september.sectors.filter(r => r.addedKm2 > 1e-7 || r.removedKm2 > 1e-7)) {
    await expect(page.locator(`#mapStatsSectorsBody tr[data-sector="${row.id}"] td`).last()).toHaveText(area(row.netKm2, true).replace(' км²', ''));
    await expect(page.locator('#mapStatsPost')).toHaveValue(new RegExp(row.label));
  }
  await page.locator('#mapStatsPeriod').selectOption('day'); await page.locator('#mapStatsDay').selectOption('2026-09-03');
  await figures(page, data.daily.find(d => d.date === '2026-09-03'));
});
for (const width of [320, 360, 390, 430]) {
  test(`мобильная статистика ${width} px: все режимы и раскрытые таблицы помещаются`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 }); await ready(page);
    for (const id of ['mapStatsPostPreview', 'mapStatsDays', 'mapStatsMonths']) await page.locator('#' + id + ' summary').click();
    for (const mode of ['latest', 'day', 'month']) {
      await page.locator('#mapStatsPeriod').selectOption(mode);
      if (mode === 'month' && data.monthly.some(m => m.month === '2026-09' && m.sectors?.length)) {
        await page.locator('#mapStatsMonth').selectOption('2026-09');
        if (await page.locator('#mapStatsSectors').isVisible()) await page.locator('#mapStatsSectors summary').click();
      }
      const sizes = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
      expect(sizes.scroll - sizes.client).toBeLessThanOrEqual(1);
      const overflow = await page.locator('#mapStatistics').evaluate(root => {
        const bounds = root.getBoundingClientRect();
        return [...root.querySelectorAll('select, textarea, button, table, dd')].filter(el => el.getClientRects().length).map(el => ({ id: el.id || el.tagName, box: el.getBoundingClientRect() })).filter(item => item.box.right > bounds.right + 1 || item.box.left < bounds.left - 1).map(item => item.id);
      });
      expect(overflow).toEqual([]);
    }
    expect(await page.locator('#mapStatsCopy').evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(48);
    const monthSize = await page.locator('#mapStatsMonth').evaluate(el => ({ height: el.getBoundingClientRect().height, font: parseFloat(getComputedStyle(el).fontSize) }));
    expect(monthSize.height).toBeGreaterThanOrEqual(46); expect(monthSize.font).toBe(16);
    await page.locator('#mapStatistics').screenshot({ path: testInfo.outputPath(`statistics-${width}.png`) });
  });
}
test('статичная сводка и текст доступны без JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false, viewport: { width: 320, height: 844 } });
  try {
    const page = await context.newPage(); await blockExternal(page); await page.goto('/map/');
    await figures(page, data.periods.latest); await expect(page.locator('#mapStatsPeriod')).toBeDisabled();
    await page.locator('#mapStatsPostPreview summary').click(); await expect(page.locator('#mapStatsPost')).toBeVisible();
    await expect(page.locator('#mapStatsPost')).toHaveValue(/Карта KRM РФ/);
  } finally { await context.close(); }
});
