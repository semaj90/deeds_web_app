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
  '/cases/new',
  '/active-cases',
  '/evidence',
  '/evidence/upload',
  '/evidence-library',
  '/citations',
  '/persons-of-interest',
  '/admin/ai-dashboard',
  '/global-search',
  '/terminal',
  '/system-configuration',
  '/analysis-center',
  '/admin/all-routes',
  '/admin/dev-tools',
  '/admin/cache',
  '/command-center',
  '/reports',
  '/admin/gpu-evidence-graph',
  '/admin/error-brain',
  '/demos/investigate',
  '/demos/bits-ui',
];

test.describe('Quick Routes Test', () => {
  test.use({
    ignoreHTTPSErrors: true,
    navigationTimeout: 30000,
  });

  test.beforeEach(async ({ page }) => {
    // Bypass onboarding wizard
    await page.addInitScript(() => {
      window.localStorage.setItem('deeds-onboarding-completed', 'true');
    });
  });

  for (const route of coreRoutes) {
    test(`Test route: ${route}`, async ({ page }) => {
      const consoleErrors: string[] = [];
      const networkErrors: string[] = [];
      const isIgnorableFailure = (_url: string, errorText?: string | null) =>
        (errorText ?? '').includes('ERR_ABORTED');

      // Capture console errors
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });

      // Capture network failures
      page.on('requestfailed', (request) => {
        const errorText = request.failure()?.errorText;
        if (isIgnorableFailure(request.url(), errorText)) return;
        networkErrors.push(`${request.url()} - ${errorText}`);
      });

      // Navigate to route — use domcontentloaded (networkidle hangs on SSE routes)
      const response = await page.goto(`${BASE_URL}${route}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      // Wait for rendering
      await page.waitForTimeout(2000);

      // Take screenshot
      await page.screenshot({
        path: `test-results/screenshots/${route.replace(/\//g, '_') || 'home'}.png`,
        fullPage: true,
      });

      // Verify response status
      expect(response?.status()).toBeLessThan(500);

      // Log errors for debugging
      if (consoleErrors.length > 0) {
        console.log(`Console errors on ${route}:`);
        consoleErrors.forEach((err) => console.log(`  - ${err}`));
      }

      if (networkErrors.length > 0) {
        console.log(`Network errors on ${route}:`);
        networkErrors.forEach((err) => console.log(`  - ${err}`));
      }

      // Check page loaded (handle client-side navigations that destroy context)
      try {
        const title = await page.title();
        expect(title).toBeTruthy();
      } catch {
        // Context destroyed by client-side navigation — page loaded and redirected, which is OK
        await page.waitForLoadState('domcontentloaded');
        const title = await page.title();
        expect(title).toBeTruthy();
      }
    });
  }
});
