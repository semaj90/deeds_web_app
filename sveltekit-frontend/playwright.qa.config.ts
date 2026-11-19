import { defineConfig } from '@playwright/test';

// QA sweep config. Runs only qa-*.spec.ts for now; the full route sweep stays on playwright.config.ts.
// Reuses a running :5173 server and verifies its identity in globalSetup before any test runs.
// Do not point webServer at run-detached.mjs: the wrapper exits before the server does.

const runId = process.env.QA_RUN_ID ?? new Date().toISOString().replace(/[:.]/g, '-');
const output = `logs/qa/${runId}`;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /qa-.*\.spec\.ts$/,
  timeout: 30_000,
  retries: 1,
  workers: 2,
  globalSetup: './scripts/qa/qa-global-setup.mjs',

  reporter: [
    ['list'],
    ['json', { outputFile: `${output}/results.json` }],
    ['html', { outputFolder: `${output}/html`, open: 'never' }],
  ],
  outputDir: `${output}/artifacts`,

  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  webServer: {
    command: 'npx vite dev --host 127.0.0.1 --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stderr: 'pipe',
  },
});
