import { expect, test, type Page } from '@playwright/test';

// Runs against a read-only copy of the scanner database (see playwright.config.ts): no scans, no tracking.
const DISCLAIMER = 'Educational screener based on a class method, not financial advice. Verify every quote in your broker before trading.';
const RANK: Record<string, number> = { 'AT ENTRY': 0, READY: 1, WATCH: 2, WAIT: 3 };

/** Load a page the way the webapp-testing skill recommends: wait for network idle, collect console errors. */
async function open(page: Page, path: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  return errors;
}

async function shot(page: Page, name: string, project: string) {
  await page.screenshot({ path: `e2e/screenshots/${project}/${name}.png`, fullPage: true });
}

test.describe('every page', () => {
  for (const [name, path] of [['signals', '/#/'], ['history', '/#/history'], ['settings', '/#/settings']] as const) {
    test(`${name}: disclaimer, navigation, no console errors`, async ({ page }, info) => {
      const errors = await open(page, path);
      await expect(page.getByRole('note')).toHaveText(DISCLAIMER);
      await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
      await shot(page, name, info.project.name);
      expect(errors).toEqual([]);
    });
  }
});

test('signals: grouped by ticker, AT ENTRY/READY first, option prices labeled indicative', async ({ page }) => {
  await open(page, '/#/');
  const status = await (await page.request.get('/api/status')).json();
  if (status.market === 'closed') await expect(page.getByText('Market closed.')).toBeVisible();

  const bands = page.locator('section[aria-labelledby^="t-"]');
  if ((await bands.count()) === 0) {
    await expect(page.getByText(/No scan yet|No setup right now/)).toBeVisible();
    return;
  }
  // one band per ticker
  const tickers = await bands.locator('a.ticker').allTextContents();
  expect(new Set(tickers).size).toBe(tickers.length);
  // best status per band never gets better further down the page
  const best = await bands.evaluateAll((els) => els.map((el) => el.querySelector('article span[title]')?.textContent ?? ''));
  const ranks = best.map((s) => RANK[s] ?? 9);
  expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  // every contract shown carries the indicative label; patterns without one say why
  const contracts = await page.getByText('indicative (modeled), 15-min delayed').count();
  const asks = await page.locator('section[aria-labelledby^="t-"] >> text=/^Ask/').count();
  expect(contracts).toBe(asks);
  // every pattern has a path strip
  expect(await page.getByRole('img', { name: /^Price path:/ }).count()).toBe(await bands.locator('article').count());
});

const ETFS = new Set(['SPY', 'QQQ', 'IWM', 'DIA']);

test('signals: each ticker card has its logo (or letter badge), Open chart, and a right panel per contract group', async ({ page }) => {
  const errors = await open(page, '/#/');
  const cards = page.locator('section[aria-labelledby^="t-"]');
  test.skip((await cards.count()) === 0, 'no setups in this database');

  for (const card of await cards.all()) {
    const ticker = (await card.locator('a.ticker').textContent())!.trim();
    const logo = card.getByTestId('logo');
    await expect(logo).not.toHaveAttribute('data-kind', 'loading');
    // ETFs have no logo on Finnhub: rounded letter badge with the first letter
    if (ETFS.has(ticker)) {
      await expect(logo).toHaveAttribute('data-kind', 'letter');
      await expect(logo).toHaveText(ticker.charAt(0));
    } else {
      await expect(logo).toHaveAttribute('data-kind', 'image');
      await expect(logo).toHaveAttribute('src', `/api/logo/${ticker}`);
    }
    await expect(card.getByRole('link', { name: 'Open chart →' })).toBeVisible();

    const panels = card.locator('aside');
    expect(await panels.count()).toBeGreaterThan(0);
    for (const panel of await panels.all()) {
      await expect(panel.getByText(/indicative \(modeled\), 15-min delayed|No contract fits/).first()).toBeVisible();
    }
  }

  // "Every reason" opens the full list
  const every = page.getByText('Every reason').first();
  if (await every.count()) {
    await every.click();
    await expect(page.locator('details[open] li').first()).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('detail: chart with EMAs and the pattern, last-3 candle labels, EMA table, contract card', async ({ page }, info) => {
  await open(page, '/#/');
  const first = page.locator('section[aria-labelledby^="t-"] a.ticker').first();
  test.skip((await first.count()) === 0, 'no setups in this database');
  const ticker = (await first.textContent())!;
  const errors = await open(page, `/#/t/${ticker}`);

  await expect(page.getByRole('heading', { level: 1, name: ticker })).toBeVisible();
  const chart = page.getByTestId('price-chart');
  await expect(chart.locator('canvas').first()).toBeVisible();
  // TradingView attribution (lightweight-charts license)
  await expect(chart.locator('a[href^="https://www.tradingview.com/"]')).toBeVisible();
  await expect(page.getByText('EMA 55')).toBeVisible();
  await expect(page.getByText(/Last 3 candles on/)).toBeVisible();
  await expect(page.locator('table caption', { hasText: 'EMA levels' })).toBeVisible();
  await expect(page.locator('tbody tr th[scope="row"]')).toHaveText(['15m', '30m', '1h', 'Daily']);
  await expect(page.getByLabel('Contract and exit plan').or(page.getByText('No contract fits').first())).toBeVisible();

  // switching time frames redraws without errors
  await page.getByRole('button', { name: 'Daily' }).click();
  await page.waitForLoadState('networkidle');
  await expect(chart.locator('canvas').first()).toBeVisible();
  await page.getByRole('button', { name: 'Daily' }).click();
  await shot(page, `detail-${ticker}`, info.project.name);
  expect(errors).toEqual([]);
});

test('history: both hit rates, versions, and the log or an empty state', async ({ page }, info) => {
  await open(page, '/#/history');
  await expect(page.getByRole('heading', { name: 'Pattern hit rate' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tradeable hit rate' })).toBeVisible();
  await expect(page.getByText(/Settings versions \(\d+\)/)).toBeVisible();
  const rows = page.locator('tbody tr');
  if ((await rows.count()) === 0) {
    await expect(page.getByText(/No signals logged yet|No signals match/)).toBeVisible();
  } else {
    await expect(page.getByRole('columnheader', { name: 'Gain (indicative)' })).toBeVisible();
    await rows.first().click();
    await expect(page.locator('tbody ol li').first()).toBeVisible();
  }
  await page.getByRole('button', { name: 'All time' }).click();
  await shot(page, 'history-all-time', info.project.name);
});

test('settings: invalid input is explained, a save makes a new version, reset restores the defaults', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-light', 'writes settings; run once');
  await open(page, '/#/settings');
  const budget = page.getByLabel('Budget per trade');

  await budget.fill('10');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByRole('status')).toContainText('contracts.budget: must be between 50 and 100000');

  await budget.fill('750');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByRole('status')).toContainText(/Saved as version \d+\. Applies from the next scan\./);
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.getByLabel('Budget per trade')).toHaveValue('750');

  await page.getByRole('button', { name: 'Reset to defaults' }).click();
  await expect(page.getByRole('alert')).toContainText('Replace every setting with the CLAUDE.md defaults?');
  await page.getByRole('alert').getByRole('button', { name: 'Reset to defaults' }).click();
  await expect(page.getByRole('status')).toContainText(/Reset to the defaults as version \d+/);
  await expect(page.getByLabel('Budget per trade')).toHaveValue('500');
});
