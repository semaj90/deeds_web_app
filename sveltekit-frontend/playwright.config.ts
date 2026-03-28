import { defineConfig, devices } from '@playwright/test';

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

  // Ignore vitest-based spec files that conflict with Playwright's expect (use vi.fn/vi.mock)
  testIgnore: [
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
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173',

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
      testMatch: '**/client-inference*',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--enable-features=WebAssemblySimd',
            '--enable-unsafe-webgpu',
            '--no-sandbox',
          ],
        },
      },
    },
  ],

  // Web server: auto-start in CI, reuse existing locally
  webServer: {
    command: 'npm run build && npm run preview -- --port 5173',
    url: 'http://127.0.0.1:5173',
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
