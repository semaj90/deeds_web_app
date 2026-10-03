import { defineConfig } from '@playwright/test';

/** Isolated browser-storage contract tests; deliberately no app setup or model/service startup. */
export default defineConfig({
	testDir: './tests',
	testMatch: '**/client-inference-store-v1.spec.ts',
	fullyParallel: false,
	workers: 1,
	reporter: 'list',
	timeout: 60_000,
	use: {
		browserName: 'chromium',
		launchOptions: { args: ['--disable-gpu', '--no-sandbox'] },
	},
});
