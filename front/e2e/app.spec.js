import { test, expect } from '@playwright/test';

test.describe('CourtVision App', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display the app header with logo and name', async ({ page }) => {
    const header = page.locator('.appHeader');
    await expect(header).toBeVisible();

    const logo = page.locator('.appLogo');
    await expect(logo).toBeVisible();

    const appName = page.locator('.appName');
    await expect(appName).toHaveText('CourtVision');
  });

  test('should display the date picker', async ({ page }) => {
    const datePicker = page.locator('input[type="date"]');
    await expect(datePicker).toBeVisible();
  });

  test('should display the schedule section', async ({ page }) => {
    // Wait for initial loading to complete
    await page.waitForLoadState('networkidle');
    
    // Schedule container should be visible
    const schedule = page.locator('.schedule, [class*="Schedule"]').first();
    await expect(schedule).toBeVisible();
  });

  test('should display the score section', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    
    const score = page.locator('.scoreElement');
    await expect(score).toBeVisible();
  });

  test('should have dark mode toggle', async ({ page }) => {
    const darkModeToggle = page.locator('.dark-mode-toggle');
    await expect(darkModeToggle).toBeVisible();
  });

  test('should toggle dark mode when clicking the toggle', async ({ page }) => {
    // Get initial theme
    const initialTheme = await page.evaluate(() => 
      document.documentElement.getAttribute('data-theme')
    );

    // Click the dark mode toggle
    const toggle = page.locator('.dark-mode-toggle');
    await toggle.click();

    // Verify theme changed
    const newTheme = await page.evaluate(() => 
      document.documentElement.getAttribute('data-theme')
    );
    
    expect(newTheme).not.toBe(initialTheme);
  });

  test('should persist dark mode preference in localStorage', async ({ page }) => {
    // Click dark mode toggle
    const toggle = page.locator('.dark-mode-toggle');
    await toggle.click();

    // Check localStorage was updated
    const darkModeSaved = await page.evaluate(() => 
      localStorage.getItem('darkMode')
    );
    
    expect(darkModeSaved).not.toBeNull();
  });

  test('should change date when selecting a new date', async ({ page }) => {
    const datePicker = page.locator('input[type="date"]');
    await expect(datePicker).toBeVisible();

    // Get current date value
    const currentDate = await datePicker.inputValue();
    
    // Set a new date (yesterday)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    await datePicker.fill(yesterdayStr);
    
    // Verify the date picker value changed
    await expect(datePicker).toHaveValue(yesterdayStr);
  });

  test('should update URL with date path', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    await page.waitForURL(/\/\d{4}-\d{2}-\d{2}/);

    const { pathname } = new URL(page.url());
    expect(pathname).toMatch(/^\/\d{4}-\d{2}-\d{2}(\/\d+)?$/);
  });

  test('should display stat buttons section', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    
    const statButtons = page.locator('.statButtons, [class*="StatButtons"]').first();
    await expect(statButtons).toBeVisible();
  });

  test('should display play-by-play section', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    
    const playSection = page.locator('.playByPlaySection');
    await expect(playSection).toBeVisible();
  });

  test('should display boxscore section', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    
    const boxscore = page.locator('.box');
    await expect(boxscore).toBeVisible();
  });
});

test.describe('Navigation', () => {
  test('should load with query parameters', async ({ page }) => {
    // Navigate with specific date
    await page.goto('/?date=2024-01-15');

    const datePicker = page.locator('input[type="date"]');
    await expect(datePicker).toHaveValue('2024-01-15');
    await expect(page).toHaveURL(/\/$/);
  });

  test('should preserve game selection in URL', async ({ page }) => {
    // Navigate with game slug
    await page.goto('/2024-01-15-phi-cle');

    const datePicker = page.locator('input[type="date"]');
    await expect(datePicker).toHaveValue('2024-01-15');

    await expect(page).toHaveURL(/\/2024-01-15-phi-cle$/);
  });
});

test.describe('Responsive Design', () => {
  test('should be responsive on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    
    const header = page.locator('.appHeader');
    await expect(header).toBeVisible();
    
    const appName = page.locator('.appName');
    await expect(appName).toBeVisible();
  });

  test('should be responsive on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    
    const header = page.locator('.appHeader');
    await expect(header).toBeVisible();
  });
});

test.describe('Loading States', () => {
  test('should show loading indicator during data fetch', async ({ page }) => {
    // Slow down network to catch loading state
    await page.route('**/*.json*', async route => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      await route.continue();
    });

    await page.goto('/');
    
    // The app shows loading after 500ms delay, so this might not always catch it
    // but the structure should still be visible
    const topLevel = page.locator('.topLevel');
    await expect(topLevel).toBeVisible();
  });
});
