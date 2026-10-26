import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'bento-dashboard.spec.ts',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  timeout: 30000,
  expect: { timeout: 10000 },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5181 --strictPort --force',
    url: 'http://127.0.0.1:5181',
    reuseExistingServer: !process.env.CI,
    timeout: 120000
  },
  use: {
    baseURL: process.env.BENTO_BASE_URL ?? 'http://127.0.0.1:5181',
    ...devices['Desktop Chrome'],
    launchOptions: { args: ['--disable-gpu', '--no-sandbox'] },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  }
});
