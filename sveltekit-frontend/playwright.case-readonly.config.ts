import { defineConfig, devices } from '@playwright/test';

/** Isolated browser config: intentionally excludes the repository's data-seeding setup. */
export default defineConfig({
	testDir: './tests/e2e',
	testMatch: 'case-readonly-live.spec.ts',
	fullyParallel: false,
	workers: 1,
	retries: 0,
	reporter: 'list',
	timeout: 60_000,
	expect: { timeout: 10_000 },
	use: {
		...devices['Desktop Chrome'],
		baseURL: 'http://127.0.0.1:5173',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
	},
});
