import { test, expect } from '@playwright/test';

async function blockAnalytics(page) {
  const analyticsPatterns = [
    '**/analytics.minutesmap.com/**',
    '**/www.google-analytics.com/**',
    '**/api.posthog.com/**',
  ];

  await Promise.all(
    analyticsPatterns.map((pattern) =>
      page.route(pattern, (route) => route.abort('blockedbyclient')),
    ),
  );
}

async function waitForAppReady(page) {
  await expect(page.locator('.topLevel')).toBeVisible();
  await expect(page.locator('input[type="date"]')).toBeVisible();
  await expect(page.locator('.scoreElement')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await blockAnalytics(page);
});

test.describe('MinutesMap Smoke', () => {
  test('date path and schedule selection keep URL in sync @smoke', async ({ page }) => {
    await page.goto('/?date=2025-01-15');
    await waitForAppReady(page);

    const datePicker = page.locator('input[type="date"]');
    await expect(datePicker).toHaveValue('2025-01-15');

    const firstGame = page.locator('.games .game').first();
    await expect(firstGame).toBeVisible();
    await firstGame.click();

    await expect(page).toHaveURL(/\/2025-01-15-[a-z0-9]+-[a-z0-9]+$/i);
  });

  test('app survives reload and resume-like events on live/non-final paths @smoke', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForAppReady(page);

    await page.reload();
    await waitForAppReady(page);

    await page.evaluate(() => {
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('online'));
      window.dispatchEvent(new Event('pageshow'));
    });

    await expect(page.locator('.playByPlaySection')).toBeVisible();
    await expect(page.locator('.box')).toBeVisible();
  });

  test('export preview opens and responds to option changes @smoke', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    const exportButton = page.getByRole('button', { name: 'Export image' });
    await expect(exportButton).toBeVisible();
    await exportButton.click();

    const previewDialog = page.getByRole('dialog', { name: 'Play-by-play image preview' });
    await expect(previewDialog).toBeVisible();
    await expect(page.getByAltText('Play-by-play export preview')).toBeVisible();

    const viewSelect = previewDialog.locator('select').first();
    await viewSelect.selectOption('player');
    await expect(viewSelect).toHaveValue('player');

    const playerSelect = previewDialog.locator('select').nth(1);
    await expect(playerSelect).toBeEnabled({ timeout: 10000 });
  });

  test('dark mode preference persists after reload @smoke', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    const toggle = page.locator('.dark-mode-toggle');
    await expect(toggle).toBeVisible();

    const initialTheme = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme'),
    );
    await toggle.click();

    const toggledTheme = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme'),
    );
    expect(toggledTheme).not.toBe(initialTheme);

    await page.reload();
    await waitForAppReady(page);

    await expect
      .poll(async () => page.evaluate(() => document.documentElement.getAttribute('data-theme')), {
        timeout: 5000,
      })
      .toBe(toggledTheme);

    await expect
      .poll(async () => page.evaluate(() => localStorage.getItem('darkMode')))
      .not.toBeNull();
  });
});
