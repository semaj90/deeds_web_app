import { defineConfig, devices } from '@playwright/test';

/**
 * Lightweight Playwright config for running tests against an already-running dev server.
 * Usage: npx playwright test --config=playwright.dev.config.js tests/my-test.spec.ts
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: 0,
  workers: 2,
  reporter: [['line']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 30000,
    navigationTimeout: 60000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--enable-webgpu',
            '--enable-unsafe-webgpu',
            '--enable-features=WebAssemblySimd,WebGPU',
            '--disable-web-security',
            '--enable-accelerated-2d-canvas',
          ],
        },
      },
    },
  ],
  // No webServer — assumes dev server is already running
  timeout: 60000,
  expect: { timeout: 15000 },
  outputDir: 'test-results/',
});
