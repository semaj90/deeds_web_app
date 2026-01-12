import { expect, test } from '@playwright/test';

/**
 * Quick Routes Screenshot & Verification Test
 * Tests core routes to identify runtime errors
 */

const BASE_URL = 'http://localhost:5173';

const coreRoutes = [
  '/',
  '/dashboard',
  '/cases',
  '/cases/create',
  '/evidence/upload',
  '/chat',
  '/admin/phase89',
  '/command-center',
  '/knowledge',
  '/rag-search',
];

test.describe('Quick Routes Test', () => {
  test.use({
    ignoreHTTPSErrors: true,
    navigationTimeout: 30000,
  });

  for (const route of coreRoutes) {
    test(`Test route: ${route}`, async ({ page }) => {
      const consoleErrors: string[] = [];
      const networkErrors: string[] = [];

      // Capture console errors
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });

      // Capture network failures
      page.on('requestfailed', (request) => {
        networkErrors.push(`${request.url()} - ${request.failure()?.errorText}`);
      });

      // Navigate to route
      const response = await page.goto(`${BASE_URL}${route}`, {
        waitUntil: 'networkidle',
        timeout: 30000,
      });

      // Take screenshot
      await page.screenshot({
        path: `test-results/screenshots/${route.replace(/\//g, '_') || 'home'}.png`,
        fullPage: true,
      });

      // Verify response status
      expect(response?.status()).toBeLessThan(500);

      // Log errors for debugging
      if (consoleErrors.length > 0) {
        console.log(`❌ Console errors on ${route}:`);
        consoleErrors.forEach((err) => console.log(`  - ${err}`));
      }

      if (networkErrors.length > 0) {
        console.log(`⚠️ Network errors on ${route}:`);
        networkErrors.forEach((err) => console.log(`  - ${err}`));
      }

      // Check page loaded
      const title = await page.title();
      expect(title).toBeTruthy();
    });
  }
});
