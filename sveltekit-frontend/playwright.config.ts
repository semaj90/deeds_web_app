import { defineConfig, devices } from '@playwright/test';
import { PORTS } from './tests/helpers/env-ports.js';

/**
 * Playwright Configuration for E2E Testing
 *
 * This configuration supports the Svelte5 Comprehensive Testing & Remediation spec.
 * Key features:
 * - Screenshot capture on test steps for visual verification
 * - Sequential test execution for user flow tests
 * - Video recording on failure for debugging
 * - Configurable base URL for different environments
 *
 * @see design.md - Testing Strategy section
 * @validates Requirements 2.7, 3.1
 */
export default defineConfig({
  // Test directory - includes both general tests and e2e subdirectory
  testDir: './tests',

  // Only match .spec.ts files (exclude vitest .test.ts files)
  testMatch: '**/*.spec.ts',

  testIgnore: [
    // Vitest-based specs (use vi.fn/vi.mock, conflict with Playwright expect)
    '**/vector-routes.spec.ts',
    '**/evidence-view-modal.spec.ts',
    '**/rag-search-ace-route.spec.ts',
    '**/sse-chat-glossary-metadata.spec.ts',
    '**/sse-chat-attachment-metadata.spec.ts',
    '**/chat-session-attachment-handoff.spec.ts',
    '**/ace-ingest-route.spec.ts',
    '**/ace-status-route.spec.ts',
    '**/ace-summarize-route.spec.ts',
    '**/ace-context-glossary.spec.ts',
    '**/ace-pipeline-wiring.spec.ts',
    '**/ace-policy.spec.ts',
    '**/ai-canon-routes.spec.ts',
    '**/ai-routes-comprehensive.spec.ts',
    '**/analytics-tags-nlp-prefs-routes.spec.ts',
    '**/cache-recommendations-ml-sys-routes.spec.ts',
    '**/cases-auth-evidence-routes.spec.ts',
    '**/cases-sub-routes.spec.ts',
    '**/contextual-knowledge-web-routes.spec.ts',
    '**/docs-sync-cartridge-system-routes.spec.ts',
    '**/error-brain-routes.spec.ts',
    '**/errors-feedback-fictional-routes.spec.ts',
    '**/glossary-health-routes.spec.ts',
    '**/graph-detective-search-routes.spec.ts',
    '**/infra-ollama-cache-routes.spec.ts',
    '**/poi-citations-conversations-routes.spec.ts',
    '**/reports-embed-chat-routes.spec.ts',
    '**/retrieval-path-wiring.spec.ts',
    '**/runtime-connection-contract.spec.ts',
    '**/vision-gpu-tools-topology-routes.spec.ts',
    '**/yorha-v1-routes.spec.ts',
    // Tests targeting non-existent routes or wrong ports
    '**/ux-layout-tests.spec.ts', // port 5174 + /demo/* routes don't exist
    '**/simple-ux-test.spec.ts', // port 5174 + /demo/* routes don't exist
    '**/integrated-system.spec.ts', // port 5178 (QUIC proxy) not running
    '**/redis-gpu-pipeline.spec.ts', // /upload route doesn't exist
    '**/poi-manager-integration.spec.ts', // /poi-manager route doesn't exist
    '**/barrel-store.spec.ts', // hardcoded selectors don't match DOM
    '**/phase99-production.spec.ts', // stale data-testid/class selectors
    '**/nes-architecture.spec.ts', // /admin/redis route doesn't exist
    '**/architecture-demo.spec.ts', // stale .msg.user/.loading selectors, no dev auth
    '**/user-migration.spec.ts', // /test-user-store route doesn't exist
    '**/minio-upload.spec.ts', // /api/minio/upload route doesn't exist
    // Stale routes/selectors — need full rewrite
    '**/legal-workflow.spec.ts', // 8/13 routes invalid, deprecated :has-text selectors
    '**/legal-ai.spec.ts', // stale .msg.user/.loading/.chat-window selectors
    '**/yorha-bw-theme.spec.ts', // old 4-theme selector, --yorha-* CSS vars (now 7 themes + --t-*)
    '**/phase96-all-routes-mcp.spec.ts', // 97-route suite, timeouts in dev
  ],

  // Sequential execution for user flow tests (login → case creation → evidence upload)
  fullyParallel: false,

  // Retry failed tests on CI
  retries: process.env.CI ? 2 : 0,

  // Single worker for sequential user flow testing
  workers: 1,

  // Reporter configuration with HTML report for visual review
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/e2e-results.json' }],
  ],

  // Global test timeout (2 minutes for complex flows)
  timeout: 120000,

  // Expect timeout for assertions
  expect: { timeout: 15000 },

  // Shared settings for all projects
  use: {
    // Base URL for the SvelteKit dev server
    baseURL: PORTS.APP_BASE,

    // Collect trace on first retry for debugging
    trace: 'on-first-retry',

    // Screenshot configuration - capture on each test step for verification
    // This enables the captureStepScreenshot utility in test flows
    screenshot: 'on',

    // Video recording - retain on failure for debugging
    video: 'retain-on-failure',

    // Action timeout for individual actions (clicks, fills, etc.)
    actionTimeout: 30000,

    // Navigation timeout for page loads
    navigationTimeout: 60000,

    // Viewport size for consistent screenshots
    viewport: { width: 1280, height: 720 },
  },

  // Browser projects - only chromium to reduce memory usage
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Enable features needed for the legal AI platform
        launchOptions: {
          args: [
            '--enable-features=WebAssemblySimd',
            '--disable-web-security',
            '--allow-running-insecure-content',
            '--disable-gpu', // Reduce GPU memory usage during tests
            '--no-sandbox',
          ],
        },
      },
    },
    {
      name: 'chromium-webgpu',
      testMatch: ['**/client-inference*', '**/e2b-client-inference*'],
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--enable-features=WebAssemblySimd', '--enable-unsafe-webgpu', '--no-sandbox'],
        },
      },
    },
  ],

  // Web server: auto-start in CI, reuse existing locally
  webServer: {
    command: 'npm run dev',
    url: PORTS.APP_BASE,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },

  // Output directory for test artifacts (screenshots, videos, traces)
  outputDir: 'test-results/',

  // Preserve output on failure for debugging
  preserveOutput: 'failures-only',

  // Global setup/teardown: seed test case data before suite, clean up after
  globalSetup: './tests/global-setup.ts',
  globalTeardown: './tests/global-teardown.ts',
});
