import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PORTS } from './helpers/env-ports.js';

/**
 * Phase 96: MCP-Enhanced All Routes Test
 *
 * This test suite:
 * 1. Tests all routes against http://127.0.0.1:5173 (dev server)
 * 2. Takes full-page screenshots with error annotations
 * 3. Captures console errors, network failures, and exceptions
 * 4. Generates MCP-compatible JSON report for AI analysis
 * 5. Identifies broken routes and consolidation opportunities
 */

const BASE_URL = PORTS.APP_BASE;

interface RouteTestResult {
  route: string;
  status: number | null;
  success: boolean;
  consoleErrors: string[];
  networkErrors: string[];
  pageErrors: string[];
  screenshotPath: string;
  timestamp: string;
  loadTime: number;
}

const results: RouteTestResult[] = [];

// All routes discovered via ripgrep (Phase 89)
const routes = [
  '/',
  '/active-cases',
  '/admin/codebase-viewer',
  '/admin/component-analysis',
  '/admin/knowledge-search',
  '/admin/phase89',
  '/agentic-errors',
  '/agentic-errors/analysis',
  '/admin/all-routes',
  '/analysis-center',
  '/ast-topology',
  '/cases',
  '/cases/test-case-1',
  '/cases/test-case-1/ai',
  '/cases/test-case-1/board',
  '/cases/test-case-1/canvas',
  '/cases/test-case-1/chat',
  '/cases/test-case-1/evidence/upload',
  '/cases/test-case-1/overview',
  '/cases/test-case-1/persons',
  '/cases/create',
  '/cases/new',
  '/codebase-index',
  '/codebase-index/1',
  '/command-center',
  '/command-center/codebase',
  '/command-center/codebase/clusters/1',
  '/command-center/codebase/components/1',
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
  '/phase78/monitor',
  '/phase78/patches',
  '/phase78/routes/test-route',
  '/system-configuration',
  '/terminal',
  '/acp',
  '/admin/codebase-graph',
  '/admin/error-analysis',
  '/admin/explorer',
  '/admin/topology',
  '/chat',
  '/chat/test-chat-1',
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

// Move test.use to top level before describe
test.use({
  ignoreHTTPSErrors: true,
  navigationTimeout: 30000,
  screenshot: 'on',
  video: 'retain-on-failure',
});

test.describe('Phase 96: All Routes with MCP Integration', () => {
  test.beforeAll(async () => {
    // Ensure screenshot directory exists
    mkdirSync('test-results/phase96-screenshots', { recursive: true });
    mkdirSync('test-results/phase96-reports', { recursive: true });
  });

  for (const route of routes) {
    test(`Test route: ${route}`, async ({ page }) => {
      const consoleErrors: string[] = [];
      const networkErrors: string[] = [];
      const pageErrors: string[] = [];
      const startTime = Date.now();

      // Capture console errors
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });

      // Capture page errors (uncaught exceptions)
      page.on('pageerror', (error) => {
        pageErrors.push(error.message);
      });

      // Capture failed requests
      page.on('requestfailed', (request) => {
        networkErrors.push(
          `${request.method()} ${request.url()} - ${request.failure()?.errorText || 'Unknown error'}`
        );
      });

      let response;
      let success = true;
      try {
        // Navigate to route
        response = await page.goto(`${BASE_URL}${route}`, {
          waitUntil: 'networkidle',
          timeout: 30000,
        });

        // Wait for hydration
        await page.waitForTimeout(1500);

        // Verify route didn't 404
        const status = response?.status();
        if (status === 404) {
          success = false;
        }

        // Take screenshot
        const screenshotFileName = `${route === '/' ? 'index' : route.replace(/\//g, '-')}.png`;
        const screenshotPath = join('test-results/phase96-screenshots', screenshotFileName);

        await page.screenshot({
          path: screenshotPath,
          fullPage: true,
        });

        // Verify page has content
        const bodyText = await page.textContent('body');
        if (!bodyText || bodyText.length === 0) {
          success = false;
          consoleErrors.push('Page rendered with no content');
        }

        const loadTime = Date.now() - startTime;

        // Store result
        results.push({
          route,
          status: status || null,
          success: success && consoleErrors.length === 0 && pageErrors.length === 0,
          consoleErrors,
          networkErrors,
          pageErrors,
          screenshotPath,
          timestamp: new Date().toISOString(),
          loadTime,
        });

        // Log errors for immediate visibility
        if (consoleErrors.length > 0) {
          console.log(`\n⚠️  Console errors on ${route}:`);
          consoleErrors.forEach((err) => console.log(`  - ${err}`));
        }
        if (pageErrors.length > 0) {
          console.log(`\n❌ Page errors on ${route}:`);
          pageErrors.forEach((err) => console.log(`  - ${err}`));
        }
        if (networkErrors.length > 0) {
          console.log(`\n🌐 Network errors on ${route}:`);
          networkErrors.forEach((err) => console.log(`  - ${err}`));
        }

        // Don't fail test on errors (collect data)
        expect(response?.status()).toBeDefined();
      } catch (error) {
        success = false;
        const loadTime = Date.now() - startTime;
        results.push({
          route,
          status: null,
          success: false,
          consoleErrors: [...consoleErrors, `Navigation failed: ${error}`],
          networkErrors,
          pageErrors,
          screenshotPath: '',
          timestamp: new Date().toISOString(),
          loadTime,
        });
        console.log(`\n💥 Fatal error on ${route}: ${error}`);
      }
    });
  }

  test.afterAll(async () => {
    // Generate MCP-compatible JSON report
    const report = {
      timestamp: new Date().toISOString(),
      baseUrl: BASE_URL,
      totalRoutes: routes.length,
      successfulRoutes: results.filter((r) => r.success).length,
      failedRoutes: results.filter((r) => !r.success).length,
      routesWithErrors: results.filter((r) => r.consoleErrors.length > 0 || r.pageErrors.length > 0).length,
      results,
      summary: {
        brokenRoutes: results.filter((r) => r.status === 404 || r.status === 500).map((r) => r.route),
        routesWithConsoleErrors: results.filter((r) => r.consoleErrors.length > 0).map((r) => r.route),
        routesWithPageErrors: results.filter((r) => r.pageErrors.length > 0).map((r) => r.route),
        routesWithNetworkErrors: results.filter((r) => r.networkErrors.length > 0).map((r) => r.route),
      },
    };

    const reportPath = 'test-results/phase96-reports/mcp-route-analysis.json';
    writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');

    console.log('\n\n' + '═'.repeat(80));
    console.log('📊 PHASE 96: Route Testing Summary');
    console.log('═'.repeat(80));
    console.log(`✅ Successful: ${report.successfulRoutes}/${report.totalRoutes}`);
    console.log(`❌ Failed: ${report.failedRoutes}/${report.totalRoutes}`);
    console.log(`⚠️  With Errors: ${report.routesWithErrors}/${report.totalRoutes}`);
    console.log(`\n📁 MCP Report: ${reportPath}`);
    console.log('═'.repeat(80));

    if (report.summary.brokenRoutes.length > 0) {
      console.log('\n🔴 Broken Routes (404/500):');
      report.summary.brokenRoutes.forEach((r) => console.log(`  - ${r}`));
    }

    if (report.summary.routesWithPageErrors.length > 0) {
      console.log('\n💥 Routes with Page Errors:');
      report.summary.routesWithPageErrors.forEach((r) => console.log(`  - ${r}`));
    }

    if (report.summary.routesWithConsoleErrors.length > 0) {
      console.log('\n⚠️  Routes with Console Errors:');
      report.summary.routesWithConsoleErrors.slice(0, 10).forEach((r) => console.log(`  - ${r}`));
      if (report.summary.routesWithConsoleErrors.length > 10) {
        console.log(`  ... and ${report.summary.routesWithConsoleErrors.length - 10} more`);
      }
    }
  });
});

test.describe('Route Consolidation Analysis', () => {
  test('Generate consolidation recommendations', async () => {
    const consolidationOpportunities = {
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
      '/cases/*': ['/cases', '/cases/create', '/cases/new'],
      '/evidence/*': [
        '/evidence',
        '/evidence-library',
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

    const recommendations = {
      timestamp: new Date().toISOString(),
      duplicateCandidates: [
        { routes: ['/cases/create', '/cases/new'], reason: 'Same functionality - creating cases' },
        { routes: ['/evidence', '/evidence-library'], reason: 'Same functionality - browsing evidence' },
        { routes: ['/active-cases', '/cases'], reason: 'Overlapping functionality' },
      ],
      consolidationGroups: consolidationOpportunities,
    };

    writeFileSync(
      'test-results/phase96-reports/consolidation-recommendations.json',
      JSON.stringify(recommendations, null, 2),
      'utf-8'
    );

    console.log('\n\n' + '═'.repeat(80));
    console.log('🔄 Route Consolidation Recommendations');
    console.log('═'.repeat(80));

    for (const [pattern, routes] of Object.entries(consolidationOpportunities)) {
      console.log(`\n${pattern}: ${routes.length} routes`);
      routes.forEach((r) => console.log(`  - ${r}`));
    }

    console.log('\n⚠️  Potential Duplicates to Review:');
    recommendations.duplicateCandidates.forEach(({ routes, reason }) => {
      console.log(`  - ${routes.join(' vs ')} → ${reason}`);
    });

    expect(recommendations).toBeDefined();
  });
});
