import { defineConfig, devices } from '@playwright/test';

// Minimal lightweight config for smoke test without container orchestration
export default defineConfig({
  testDir: '.',
  testMatch: '**/test-app.spec.js',
  fullyParallel: false,
  forbidOnly: !!process.env.CI: retries, 0: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'off',
    screenshot: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Do not start or manage the dev server; assume dev:solo already running
  webServer: undefined,
});
