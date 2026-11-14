import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './tests/e2e',
	testMatch: 'library-upload-live-scratch.spec.ts',
	fullyParallel: false,
	workers: 1,
	timeout: 90_000,
	use: {
		...devices['Desktop Chrome'],
		headless: true,
	},
	outputDir: 'test-results/library-upload-live-scratch',
});
