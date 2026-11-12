import { defineConfig, devices } from '@playwright/test';

/** Isolated browser contract: no app server, DB hooks, or service startup. */
export default defineConfig({
	testDir: './tests/e2e',
	testMatch: '**/evidence-job-sse-native-browser.pw.ts',
	timeout: 15_000,
	expect: { timeout: 5_000 },
	fullyParallel: false,
	reporter: 'list',
	outputDir: '../.tmp/atlas/playwright-evidence-sse-contract',
	projects: [{ name: 'chromium-sse-contract', use: { ...devices['Desktop Chrome'] } }],
	use: { headless: true },
});
