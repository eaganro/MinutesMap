import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const SMOKE_GAME_ID = '2025-01-15-phi-gsw';
const ALT_SMOKE_GAME_ID = '2025-01-15-lal-bos';

const SMOKE_INIT_STATE = {
  date: '2025-01-15',
  autoSelectGameId: SMOKE_GAME_ID,
};

const SMOKE_SCHEDULE = [
  {
    id: SMOKE_GAME_ID,
    awayteam: 'PHI',
    hometeam: 'GSW',
    status: 'Final',
    starttime: '2025-01-15T03:00:00Z',
    awayscore: 102,
    homescore: 98,
  },
  {
    id: ALT_SMOKE_GAME_ID,
    awayteam: 'LAL',
    hometeam: 'BOS',
    status: 'Final',
    starttime: '2025-01-15T04:00:00Z',
    awayscore: 110,
    homescore: 107,
  },
];

const SMOKE_GAMEPACK = {
  nbaGameId: '0022400001',
  box: {
    id: SMOKE_GAME_ID,
    start: '2025-01-15T03:00:00Z',
    teams: {
      away: {
        id: 1610612755,
        abbr: 'PHI',
        name: 'Philadelphia 76ers',
        players: [{ first: 'Joel', last: 'Embiid' }],
      },
      home: {
        id: 1610612744,
        abbr: 'GSW',
        name: 'Golden State Warriors',
        players: [{ first: 'Stephen', last: 'Curry' }],
      },
    },
  },
  flow: {
    v: 2,
    periods: 4,
    last: {
      quarter: 4,
      time: '00:00',
      awayScore: 102,
      homeScore: 98,
    },
    score: [
      { quarter: 1, time: '12:00', awayScore: 0, homeScore: 0 },
      { quarter: 1, time: '11:30', awayScore: 2, homeScore: 0 },
      { quarter: 1, time: '11:00', awayScore: 2, homeScore: 2 },
      { quarter: 4, time: '00:00', awayScore: 102, homeScore: 98 },
    ],
    players: {
      away: {
        'Joel Embiid': [
          {
            quarter: 1,
            time: '11:30',
            type: '2PT',
            text: 'Joel Embiid makes 2-pt shot',
            result: 'make',
            seq: 1,
            awayScore: 2,
            homeScore: 0,
          },
        ],
      },
      home: {
        'Stephen Curry': [
          {
            quarter: 1,
            time: '11:00',
            type: '2PT',
            text: 'Stephen Curry makes 2-pt shot',
            result: 'make',
            seq: 2,
            awayScore: 2,
            homeScore: 2,
          },
        ],
      },
    },
    segments: {
      away: {
        'Joel Embiid': [{ quarter: 1, start: '12:00', end: '00:00' }],
      },
      home: {
        'Stephen Curry': [{ quarter: 1, start: '12:00', end: '00:00' }],
      },
    },
  },
};

async function blockAnalytics(page) {
  const analyticsPatterns = [
    '**/analytics.minutesmap.com/**',
    '**/www.google-analytics.com/**',
    '**/api.posthog.com/**',
    '**/minutesmap.com/ph/**',
  ];

  await Promise.all(
    analyticsPatterns.map((pattern) =>
      page.route(pattern, (route) => route.abort('blockedbyclient')),
    ),
  );
}

async function mockGameData(page) {
  await page.route('**/data/init.json*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(SMOKE_INIT_STATE),
    }),
  );

  await page.route('**/schedule/*.json.gz*', (route) => {
    const requestUrl = new URL(route.request().url());
    const match = requestUrl.pathname.match(/\/schedule\/(\d{4}-\d{2}-\d{2})\.json\.gz$/);
    const date = match ? match[1] : null;
    const payload = date === '2025-01-15' ? SMOKE_SCHEDULE : [];
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    });
  });

  await page.route('**/data/gamepack/*.json.gz*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(SMOKE_GAMEPACK),
    }),
  );
}

async function waitForAppReady(page) {
  await expect(page.locator('.topLevel')).toBeVisible();
  await expect(page.locator('input[type="date"]')).toBeVisible();
  await expect(page.locator('.scoreElement')).toBeVisible();
  await expect(page.getByRole('button', { name: /Show schedule for/ })).toBeEnabled();
}

async function expectNoSeriousAccessibilityViolations(page) {
  const results = await new AxeBuilder({ page }).analyze();
  const blockingViolations = results.violations.filter(
    ({ impact }) => impact === 'serious' || impact === 'critical',
  );
  expect(blockingViolations, JSON.stringify(blockingViolations, null, 2)).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await blockAnalytics(page);
  await mockGameData(page);
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

  test('browser back restores the previous selected game @smoke', async ({ page }) => {
    await page.goto(`/${SMOKE_GAME_ID}`);
    await waitForAppReady(page);

    const firstGame = page.locator('.games .game', { hasText: 'PHI - GSW' });
    const secondGame = page.locator('.games .game', { hasText: 'LAL - BOS' });
    await expect(firstGame).toHaveClass(/selected/);

    await secondGame.click();
    await expect(page).toHaveURL(new RegExp(`/${ALT_SMOKE_GAME_ID}$`));
    await expect(secondGame).toHaveClass(/selected/);

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/${SMOKE_GAME_ID}$`));
    await expect(firstGame).toHaveClass(/selected/);
  });

  test('primary controls support keyboard-only operation @smoke', async ({ page }) => {
    await page.goto(`/${SMOKE_GAME_ID}`);
    await waitForAppReady(page);

    const secondGame = page.getByRole('button', { name: /LAL 110, BOS 107, Final/i });
    await secondGame.focus();
    await expect(secondGame).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/${ALT_SMOKE_GAME_ID}$`));
    await expect(secondGame).toHaveAttribute('aria-pressed', 'true');

    const pointToggle = page.getByRole('button', { name: 'Point' });
    const missToggle = page.getByRole('button', { name: 'Miss' });
    await pointToggle.focus();
    await page.keyboard.press('Space');
    await expect(pointToggle).toHaveAttribute('aria-pressed', 'false');

    await page.keyboard.press('Tab');
    await expect(missToggle).toBeFocused();
    await expect(missToggle).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Enter');
    await expect(missToggle).toHaveAttribute('aria-pressed', 'true');

    const datePicker = page.getByLabel('Select game date');
    const nextDateButton = page.getByRole('button', { name: 'Next date' });
    await nextDateButton.focus();
    await page.keyboard.press('Enter');
    await expect(datePicker).toHaveValue('2025-01-16');

    const scoreDateButton = page.getByRole('button', { name: /Show schedule for/ });
    await expect(scoreDateButton).toBeEnabled();
    await scoreDateButton.focus();
    await page.keyboard.press('Space');
    await expect(datePicker).toHaveValue('2025-01-15');
  });

  test('mobile browser back closes player detail @smoke', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/${SMOKE_GAME_ID}`);
    await waitForAppReady(page);

    await page.getByRole('button', { name: /open player detail for joel embiid/i }).click();
    await expect(page.getByTestId('mobile-player-sheet')).toBeVisible();

    await page.goBack();
    await expect(page.getByTestId('mobile-player-sheet')).toBeHidden();
    await expect(
      page.getByRole('button', { name: /open player detail for joel embiid/i }),
    ).toBeVisible();
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

    const exportButton = page.getByRole('button', {
      name: /^(Export image|Share image)$/i,
    });
    await expect(exportButton).toBeVisible();
    await exportButton.click();

    const previewDialog = page.getByRole('dialog', { name: 'Play-by-play image preview' });
    await expect(previewDialog).toBeVisible();
    const closePreviewButton = previewDialog.getByRole('button', {
      name: 'Close image preview',
    });
    await expect(closePreviewButton).toBeFocused();
    await expect(previewDialog).toHaveAttribute('aria-modal', 'true');
    await expect(page.getByAltText('Play-by-play export preview')).toBeVisible();

    const viewSelect = previewDialog.locator('select').first();
    await viewSelect.selectOption('player');
    await expect(viewSelect).toHaveValue('player');

    const playerSelect = previewDialog.locator('select').nth(1);
    await expect(playerSelect).toBeEnabled({ timeout: 10000 });

    await closePreviewButton.focus();
    await page.keyboard.press('Shift+Tab');
    await expect(previewDialog.getByRole('button', { name: 'Download image' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(closePreviewButton).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(previewDialog).toBeHidden();
    await expect(exportButton).toBeFocused();
  });

  test('chart events and box-score sorting support keyboard access @smoke', async ({ page }) => {
    await page.goto(`/${SMOKE_GAME_ID}`);
    await waitForAppReady(page);

    const chart = page.getByRole('region', { name: 'Play-by-play chart' });
    await chart.focus();
    await expect(chart).toBeFocused();
    await expect(chart.getByRole('status')).toContainText('Joel Embiid makes 2-pt shot');

    await page.keyboard.press('ArrowRight');
    await expect(chart.getByRole('status')).toContainText('Stephen Curry makes 2-pt shot');
    const videoLink = page.getByRole('link', { name: /open video on nba\.com/i });
    for (let index = 0; index < 3; index += 1) {
      if (await videoLink.evaluate((element) => document.activeElement === element)) break;
      await page.keyboard.press('Tab');
    }
    await expect(videoLink).toBeFocused();

    const awayTable = page.getByRole('table', { name: 'Philadelphia 76ers box score' });
    const minuteHeader = awayTable.getByRole('columnheader', { name: /MIN/i });
    await expect(minuteHeader).toHaveAttribute('aria-sort', 'descending');
    await awayTable.getByRole('button', { name: /PTS.*Sort descending/i }).click();
    await expect(awayTable.getByRole('columnheader', { name: /PTS/i })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
  });

  test('desktop and mobile main flows have no serious axe violations @smoke', async ({ page }) => {
    for (const viewport of [
      { width: 1280, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(`/${SMOKE_GAME_ID}`);
      await waitForAppReady(page);
      await expectNoSeriousAccessibilityViolations(page);
    }
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
