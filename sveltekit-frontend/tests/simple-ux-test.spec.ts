import type { expect, test } from '@playwright/test';

/**
 * Simple UX Tests for Enhanced-Bits Components
 * Uses existing dev server instead of full test setup
 */

test.describe('Enhanced-Bits UX Tests (Dev Server)', () => {
  // Use existing dev server on port 5174
  const baseURL = 'http://localhost:5174';

  test('Case Scoring Dashboard - Layout and Mock Data', async ({ page }) => {
    await page.goto(`${baseURL}/demo/case-scoring`);

    // Wait for page to load
    await expect(page.locator('h1')).toContainText('Case Scoring Dashboard Demo');

    // Check demo features section
    const features = page.locator('.demo-features');
    await expect(features).toBeVisible();

    // Navigate to dashboard
    const dashboard = page.locator('.case-scoring-dashboard');
    await expect(dashboard).toBeVisible();

    // Check demo toggle is enabled
    const demoToggle = page.locator('.demo-toggle input[type="checkbox"]');
    await expect(demoToggle).toBeChecked();

    // Wait for loading to complete (up to 3 seconds)
    try {
      await page.waitForSelector('.loading-state', { state: 'hidden', timeout: 3000 });
    } catch {
      // Loading might complete before we check
    }

    // Should have case cards
    const caseCards = page.locator('.case-score-card');
    await expect(caseCards.first()).toBeVisible({ timeout: 5000 });

    console.log(`✅ Found ${await caseCards.count()} case cards`);
  });

  test('Case Scoring Dashboard - Modal Interaction', async ({ page }) => {
    await page.goto(`${baseURL}/demo/case-scoring`);

    // Wait for dashboard
    await page.waitForSelector('.case-scoring-dashboard', { timeout: 5000 });

    // Wait for loading to complete
    try {
      await page.waitForSelector('.loading-state', { state: 'hidden', timeout: 3000 });
    } catch {
      // Loading might complete before we check
    }

    // Click first "View Details" button
    const firstCard = page.locator('.case-score-card').first();
    await firstCard.waitFor({ timeout: 5000 });

    const viewDetailsBtn = firstCard.locator('button:has-text("View Details")');
    await viewDetailsBtn.click();

    // Modal should appear
    const modal = page.locator('.modal-overlay');
    await expect(modal).toBeVisible();

    // Check modal content
    const modalTitle = page.locator('.modal-title');
    await expect(modalTitle).toContainText('Case Score Analysis');

    // Close modal
    const closeBtn = page.locator('.modal-close');
    await closeBtn.click();

    await expect(modal).not.toBeVisible();
    console.log('✅ Modal interaction working');
  });

  test('LoadingButton - Variants and States', async ({ page }) => {
    await page.goto(`${baseURL}/demo/loading-button`);

    // Check page loads
    await expect(page.locator('h1')).toContainText('LoadingButton Component Demo');

    // Test basic button functionality
    const clickBtn = page.locator('button:has-text("Click me!")');
    await expect(clickBtn).toBeVisible();

    // Click and check loading state
    await clickBtn.click();

    // Should show loading state
    await expect(page.locator('button:has-text("Processing...")')).toBeVisible();

    // Wait for loading to complete
    await page.waitForSelector('button:has-text("Processing...")', {
      state: 'hidden',
      timeout: 3000,
    });

    console.log('✅ LoadingButton states working');
  });

  test('LoadingButton - All Variants Render', async ({ page }) => {
    await page.goto(`${baseURL}/demo/loading-button`);

    // Check all variant buttons exist
    const variants = ['Primary', 'Secondary', 'Destructive', 'Outline', 'Ghost'];

    for (const variant of variants) {
      const button = page.locator(`button:has-text("${variant}")`);
      await expect(button).toBeVisible();
    }

    // Check sizes
    const sizes = ['Small', 'Medium', 'Large'];
    for (const size of sizes) {
      const button = page.locator(`button:has-text("${size}")`);
      await expect(button).toBeVisible();
    }

    console.log('✅ All LoadingButton variants render correctly');
  });

  test('Responsive Design - Mobile Layout', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto(`${baseURL}/demo/case-scoring`);

    // Check mobile layout
    const dashboard = page.locator('.case-scoring-dashboard');
    await expect(dashboard).toBeVisible();

    // Header should stack on mobile
    const header = page.locator('.dashboard-header');
    await expect(header).toBeVisible();

    console.log('✅ Mobile layout working');
  });

  test('Accessibility - Basic Checks', async ({ page }) => {
    await page.goto(`${baseURL}/demo/case-scoring`);

    // Check for proper heading structure
    const h1 = page.locator('h1').first();
    await expect(h1).toBeVisible();

    // Check buttons have accessible text
    const buttons = page.locator('button');
    const buttonCount = Math.min(await buttons.count(), 5);

    for (let i = 0; i < buttonCount; i++) {
      const button = buttons.nth(i);
      const hasText = await button.textContent();
      const hasAriaLabel = await button.getAttribute('aria-label');

      expect(hasText || hasAriaLabel).toBeTruthy();
    }

    console.log('✅ Basic accessibility checks passed');
  });
});
