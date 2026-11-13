import { defineConfig, devices } from '@playwright/test';

/** Isolated browser contract: no app server, global setup, or live service access. */
export default defineConfig({
	testDir: './tests/e2e',
	testMatch: 'library-upload-span-contract.spec.ts',
	workers: 1,
	retries: 0,
	timeout: 30_000,
	reporter: 'list',
	use: {
		...devices['Desktop Chrome'],
		browserName: 'chromium',
		trace: 'off',
	},
});
