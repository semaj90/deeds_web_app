import { defineConfig } from '@playwright/test';

const storageState = process.env.RELIEF_LIVE_STORAGE_STATE;

export default defineConfig({
	testDir: './tests/e2e',
	testMatch: 'evidence-relief-live-e2e.spec.ts',
	fullyParallel: false,
	workers: 1,
	timeout: 60_000,
	outputDir: './test-results/evidence-relief-live',
	preserveOutput: 'always',
	reporter: 'list',
	use: {
		baseURL: process.env.RELIEF_LIVE_BASE_URL ?? 'http://127.0.0.1:5173',
		...(storageState ? { storageState } : {}),
		browserName: 'chromium',
		headless: true,
		trace: 'on',
		screenshot: 'on',
		viewport: { width: 1440, height: 1000 },
	},
});
