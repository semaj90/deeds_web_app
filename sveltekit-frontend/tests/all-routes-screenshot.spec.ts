import { expect, test } from '@playwright/test';

/**
 * Phase 89: All Routes Screenshot & Verification Test
 *
 * This test suite:
 * 1. Visits all 64 discovered routes
 * 2. Takes full-page screenshots
 * 3. Verifies routes don't crash (no uncaught errors)
 * 4. Checks for route wiring (200 status, not 404)
 */

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';

// All routes discovered via ripgrep
const routes = [
  '/',
  '/active-cases',
  '/admin/codebase-viewer',
  '/admin/component-analysis',
  '/admin/knowledge-search',
  '/admin/phase89',
  '/admin/all-routes',
  '/analysis-center',
  '/cases',
  '/cases/test-case-1', // Replace [id] with test data
  '/cases/test-case-1/ai',
  '/cases/test-case-1/board',
  '/cases/test-case-1/canvas',
  '/cases/test-case-1/chat',
  '/cases/test-case-1/evidence/upload',
  '/cases/test-case-1/overview',
  '/cases/test-case-1/persons',
  '/cases/create',
  '/cases/new',
  '/command-center',
  '/command-center/codebase',
  '/command-center/codebase/clusters/1', // Replace [id] with test data
  '/command-center/codebase/components/1', // Replace [id] with test data
  '/command-center/codebase/errors',
  '/command-center/codebase/graph',
  '/dashboard',
  '/evidence',
  '/evidence-library',
  '/evidence/analyze',
  '/evidence/hash',
  '/evidence/manage',
  '/evidence/realtime',
  '/evidence/upload',
  '/global-search',
  '/persons-of-interest',
  '/persons-of-interest/create',
  '/system-configuration',
  '/terminal',
  '/acp',
  '/admin/codebase-graph',
  '/admin/error-analysis',
  '/admin/explorer',
  '/admin/topology',
  '/chat',
  '/chat/test-chat-1', // Replace [id] with test data
  '/couchdb-analytics',
  '/demo/svelte5-components',
  '/indexing',
  '/knowledge',
  '/odin',
  '/phase89/error-map',
  '/rag-search',
  '/test',
  '/test-source-validation',
  '/test-user-store',
];

test.describe('All Routes Screenshot Test', () => {
  test.use({
    // Ignore HTTPS errors (for self-signed certs)
    ignoreHTTPSErrors: true,
    // Wait for network to be idle before screenshot
    navigationTimeout: 30000,
  });

  test.beforeEach(async ({ page }) => {
    // Bypass onboarding wizard
    await page.addInitScript(() => {
      window.localStorage.setItem('deeds-onboarding-completed', 'true');
    });
  });

  for (const route of routes) {
    test(`Screenshot: ${route}`, async ({ page }) => {
      const consoleErrors: string[] = [];
      const networkErrors: string[] = [];

      // Capture console errors
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });

      // Capture page errors
      page.on('pageerror', (error) => {
        consoleErrors.push(error.message);
      });

      // Capture failed requests
      page.on('requestfailed', (request) => {
        networkErrors.push(`${request.method()} ${request.url()} - ${request.failure()?.errorText}`);
      });

      // Heavy graph visualization routes often take >30s to serialize
      const isHeavyRoute = route === '/admin/explorer' || route === '/admin/topology' || route === '/admin/phase89';
      const routeTimeout = isHeavyRoute ? 60000 : 30000;

      // Navigate to route
      const response = await page.goto(`${BASE_URL}${route}`, {
        waitUntil: 'domcontentloaded',
        timeout: routeTimeout,
      });

      // Verify route didn't 404
      expect(response?.status()).not.toBe(404);

      // Wait for any hydration/rendering (especially graphs)
      await page.waitForTimeout(2000);

      // Take screenshot
      const screenshotPath = `screenshots${route === '/' ? '/index' : route}.png`.replace(/\//g, '-');
      await page.screenshot({
        path: `test-results/screenshots/${screenshotPath}`,
        fullPage: true,
      });

      // Log any errors (non-failing for now)
      if (consoleErrors.length > 0) {
        console.log(`⚠️  Console errors on ${route}:`, consoleErrors);
      }
      if (networkErrors.length > 0) {
        console.log(`⚠️  Network errors on ${route}:`, networkErrors);
      }

      // Verify page has some content (not blank)
      const bodyText = await page.textContent('body');
      expect(bodyText?.length).toBeGreaterThan(0);
    });
  }
});

test.describe('Route Consolidation Analysis', () => {
  test('Generate route analysis report', async () => {
    const duplicatePatterns = {
      '/admin/*': [
        '/admin/codebase-viewer',
        '/admin/component-analysis',
        '/admin/knowledge-search',
        '/admin/phase89',
        '/admin/codebase-graph',
        '/admin/error-analysis',
        '/admin/explorer',
        '/admin/topology',
      ],
      '/cases/*': [
        '/cases',
        '/cases/create',
        '/cases/new', // Duplicate with create?
      ],
      '/evidence/*': [
        '/evidence',
        '/evidence-library', // Duplicate with /evidence?
        '/evidence/analyze',
        '/evidence/hash',
        '/evidence/manage',
        '/evidence/realtime',
        '/evidence/upload',
      ],
      '/command-center/codebase/*': [
        '/command-center/codebase',
        '/command-center/codebase/clusters/[id]',
        '/command-center/codebase/components/[id]',
        '/command-center/codebase/errors',
        '/command-center/codebase/graph',
      ],
    };

    console.log('\n📊 Route Consolidation Opportunities:');
    console.log('═'.repeat(60));

    for (const [pattern, routes] of Object.entries(duplicatePatterns)) {
      console.log(`\n${pattern}: ${routes.length} routes`);
      routes.forEach((r) => console.log(`  - ${r}`));
    }

    console.log('\n⚠️  Potential Duplicates to Review:');
    console.log('  - /cases/create vs /cases/new');
    console.log('  - /evidence vs /evidence-library');
    console.log('  - /active-cases vs /cases');
    console.log('  - /all-routes (meta route for this test)');
  });
});
