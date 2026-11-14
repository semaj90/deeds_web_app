import { defineConfig, devices } from '@playwright/test';

/** Isolated BDD UI contract run; deliberately has no seeding, teardown, or server lifecycle hooks. */
export default defineConfig({
	testDir: './tests',
	testMatch: 'bdd/case-evidence-analysis.spec.ts',
	fullyParallel: false,
	workers: 1,
	retries: 0,
	reporter: 'list',
	timeout: 60_000,
	expect: { timeout: 10_000 },
	use: {
		...devices['Desktop Chrome'],
		baseURL: process.env.PW_EVIDENCE_BASE_URL ?? 'http://127.0.0.1:5173',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
	},
});
