import { test, expect } from '@playwright/test';

/**
 * YoRHa Black & White Theme Test
 *
 * Verifies the black & white theme toggle functionality:
 * 1. Navigate to system-configuration
 * 2. Click the YoRHa B/W theme button
 * 3. Verify theme changes via data-theme attribute
 * 4. Take screenshots before/after for visual comparison
 */

test.describe('YoRHa Black & White Theme', () => {
  test.beforeEach(async ({ page }) => {
    // Bypass onboarding wizard
    await page.addInitScript(() => {
      window.localStorage.setItem('deeds-onboarding-completed', 'true');
    });
  });

  test('should toggle to black & white theme and persist', async ({ page }) => {
    // Navigate to system configuration
    await page.goto('/system-configuration');
    await page.waitForLoadState('networkidle');

    // Take screenshot of default theme
    await page.screenshot({
      path: 'test-results/theme-default.png',
      fullPage: true
    });

    // Verify we're on the General tab (default)
    const generalTab = page.locator('button.nav-item.active').filter({ hasText: 'GENERAL' });
    await expect(generalTab).toBeVisible();

    // Find the theme selector section
    const themeSelector = page.locator('.theme-selector');
    await expect(themeSelector).toBeVisible();

    // Verify all 4 theme buttons exist
    await expect(themeSelector.locator('button').filter({ hasText: 'Light' })).toBeVisible();
    await expect(themeSelector.locator('button').filter({ hasText: 'Dark' })).toBeVisible();
    await expect(themeSelector.locator('button').filter({ hasText: 'System' })).toBeVisible();
    await expect(themeSelector.locator('button').filter({ hasText: 'YoRHa B/W' })).toBeVisible();

    // Click the YoRHa B/W button
    const bwButton = themeSelector.locator('button').filter({ hasText: 'YoRHa B/W' });
    await bwButton.click();

    // Wait for theme to apply
    await page.waitForTimeout(500);

    // Verify data-theme attribute changed
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'yorha-bw');

    // Verify button has aria-pressed="true"
    await expect(bwButton).toHaveAttribute('aria-pressed', 'true');

    // Take screenshot of B/W theme
    await page.screenshot({
      path: 'test-results/theme-yorha-bw.png',
      fullPage: true
    });

    // Verify localStorage persistence
    const storedTheme = await page.evaluate(() => localStorage.getItem('theme'));
    expect(storedTheme).toBe('yorha-bw');

    // Navigate to a different page to verify theme persists
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Verify theme is still applied
    await expect(html).toHaveAttribute('data-theme', 'yorha-bw');

    // Take screenshot of dashboard with B/W theme
    await page.screenshot({
      path: 'test-results/dashboard-yorha-bw.png',
      fullPage: true
    });

    // Navigate to command-center to test on different layout
    await page.goto('/command-center');
    await page.waitForLoadState('networkidle');

    // Take screenshot of command-center with B/W theme
    await page.screenshot({
      path: 'test-results/command-center-yorha-bw.png',
      fullPage: true
    });

    // Verify theme is still applied
    await expect(html).toHaveAttribute('data-theme', 'yorha-bw');
  });

  test('should verify CSS variable changes', async ({ page }) => {
    await page.goto('/system-configuration');
    await page.waitForLoadState('networkidle');

    // Click YoRHa B/W theme
    const bwButton = page.locator('.theme-selector button').filter({ hasText: 'YoRHa B/W' });
    await bwButton.click();
    await page.waitForTimeout(500);

    // Verify CSS variables are applied
    const bgPrimary = await page.evaluate(() => {
      const html = document.documentElement;
      return window.getComputedStyle(html).getPropertyValue('--yorha-bg-primary').trim();
    });

    const textPrimary = await page.evaluate(() => {
      const html = document.documentElement;
      return window.getComputedStyle(html).getPropertyValue('--yorha-text-primary').trim();
    });

    const accent = await page.evaluate(() => {
      const html = document.documentElement;
      return window.getComputedStyle(html).getPropertyValue('--yorha-accent').trim();
    });

    // Verify B/W theme colors
    expect(bgPrimary).toBe('#000000'); // Pure black
    expect(textPrimary).toBe('#ffffff'); // Pure white
    expect(accent).toBe('#ffffff'); // White accent (not gold)

    console.log('✓ CSS Variables verified:');
    console.log(`  --yorha-bg-primary: ${bgPrimary}`);
    console.log(`  --yorha-text-primary: ${textPrimary}`);
    console.log(`  --yorha-accent: ${accent}`);
  });

  test('should switch between themes', async ({ page }) => {
    await page.goto('/system-configuration');
    await page.waitForLoadState('networkidle');

    const themeSelector = page.locator('.theme-selector');
    const html = page.locator('html');

    // Start with default theme (system)
    const systemButton = themeSelector.locator('button').filter({ hasText: 'System' });
    await expect(systemButton).toHaveAttribute('aria-pressed', 'true');

    // Switch to Light
    const lightButton = themeSelector.locator('button').filter({ hasText: 'Light' });
    await lightButton.click();
    await page.waitForTimeout(300);
    await expect(html).toHaveAttribute('data-theme', 'light');
    await expect(lightButton).toHaveAttribute('aria-pressed', 'true');

    // Switch to Dark
    const darkButton = themeSelector.locator('button').filter({ hasText: 'Dark' });
    await darkButton.click();
    await page.waitForTimeout(300);
    await expect(html).toHaveAttribute('data-theme', 'dark');
    await expect(darkButton).toHaveAttribute('aria-pressed', 'true');

    // Switch to YoRHa B/W
    const bwButton = themeSelector.locator('button').filter({ hasText: 'YoRHa B/W' });
    await bwButton.click();
    await page.waitForTimeout(300);
    await expect(html).toHaveAttribute('data-theme', 'yorha-bw');
    await expect(bwButton).toHaveAttribute('aria-pressed', 'true');

    // Take final screenshot
    await page.screenshot({
      path: 'test-results/theme-switcher-final.png',
      fullPage: false
    });
  });
});
