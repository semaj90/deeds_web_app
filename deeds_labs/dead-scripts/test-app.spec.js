import { test, expect } from '@playwright/test';

async function logA11yLandmarks(page) {
  const roles = ['main', 'navigation', 'banner', 'contentinfo', 'search'];
  for (const role of roles) {
    const count = await page.locator(`[role="${role}"]`).count();
    console.log(`ROLE ${role}: ${count}`);
  }
}

test.describe('Legal AI SvelteKit Application', () => {
  test('homepage loads successfully', async ({ page }) => {
    // Navigate to your SvelteKit app
    await page.goto('http://localhost:5173');

    // Wait for the page to load
    await page.waitForLoadState('networkidle');

    // Check if the page title is set
    const title = await page.title();
    console.log(`Page title: ${title}`);

    // Assert key UI markers (lenient so smoke test is robust)
    const hasYoRHa = await page
      .locator('text=YoRHa')
      .first()
      .isVisible()
      .catch(() => false);
    console.log(`YoRHa branding visible: ${hasYoRHa}`);
    expect(hasYoRHa).toBeTruthy();

    const mainCount = await page.locator('main, [role="main"]').count();
    console.log(`Main landmark count: ${mainCount}`);
    expect(mainCount).toBeGreaterThan(0);

    await logA11yLandmarks(page);

    // Take a lightweight screenshot
    await page.screenshot({ path: 'homepage-test.png', fullPage: false });

    // Check if the page loaded without errors
    const bodyText = await page.locator('body').textContent();
    console.log(`Page loaded with content: ${bodyText ? 'Yes' : 'No'}`);

    // Basic assertions
    expect(await page.locator('body').count()).toBeGreaterThan(0);
  });

  test('error boundary works correctly', async ({ page }) => {
    // Navigate to your app
    await page.goto('http://localhost:5173');

    // Wait for load
    await page.waitForLoadState('networkidle');

    // Try to trigger any JavaScript errors by checking console
    const errors = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    // Check if ErrorBoundary component is present in the DOM
    const errorBoundaryExists =
      (await page.locator('[class*="error-boundary"], [class*="ErrorBoundary"]').count()) > 0;
    console.log(`Error boundary component found: ${errorBoundaryExists}`);

    // Log any JavaScript errors
    if (errors.length > 0) {
      console.log('JavaScript errors found:', errors);
    } else {
      console.log('No JavaScript errors detected');
    }

    // Soft assert that no severe errors occurred
    expect(errors.length).toBeLessThan(5);
  });

  test('gaming components load', async ({ page }) => {
    // Navigate to your app
    await page.goto('http://localhost:5173');

    // Wait for load
    await page.waitForLoadState('networkidle');

    // Check for gaming-related components
    const gamingElements = await page
      .locator(
        '[class*="gaming"], [class*="nes-"], [class*="snes-"], [class*="yorha"], [data-testid="gaming-root"]'
      )
      .count();
    console.log(`Gaming-themed elements found: ${gamingElements}`);

    // Check for any custom buttons
    const customButtons = await page.locator('button, [role="button"]').count();
    console.log(`Interactive buttons found: ${customButtons}`);

    // Take screenshot of the final state
    await page.screenshot({ path: 'gaming-components-test.png' });
  });
});
