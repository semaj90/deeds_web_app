import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	// This focused staging lane never seeds or cleans application data.
	globalSetup: './tests/e2e/set-the-scene-noop-global-setup.ts',
	testDir: './tests/e2e',
	testMatch: [
		'set-the-scene-workflow.spec.ts',
		'parent-atlas-v2-character-runtime.spec.ts',
		'crime-scene-comprehensive-v1.spec.ts'
	],
	fullyParallel: false,
	workers: 1,
	retries: 0,
	reporter: 'list',
	timeout: 90_000,
	expect: { timeout: 15_000 },
	use: {
		...devices['Desktop Chrome'],
		baseURL: process.env.PW_SCENE_BASE_URL ?? 'http://127.0.0.1:5173',
		...(process.env.PW_SCENE_STORAGE_STATE ? { storageState: process.env.PW_SCENE_STORAGE_STATE } : {}),
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	}
});
