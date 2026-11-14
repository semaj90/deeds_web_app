import { defineConfig, devices } from '@playwright/test';

/**
 * Explicitly opt-in, authenticated evidence review acceptance test.
 * No global setup, seeding, upload, or cleanup runs from this config.
 */
export default defineConfig({
	testDir: './tests/e2e',
	testMatch: 'evidence-findings-source-context.spec.ts',
	fullyParallel: false,
	workers: 1,
	retries: 0,
	reporter: 'list',
	timeout: 60_000,
	expect: { timeout: 10_000 },
	use: {
		...devices['Desktop Chrome'],
		baseURL: process.env.PW_EVIDENCE_BASE_URL ?? 'http://127.0.0.1:5173',
		...(process.env.PW_EVIDENCE_STORAGE_STATE
			? { storageState: process.env.PW_EVIDENCE_STORAGE_STATE }
			: {}),
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
	},
});
