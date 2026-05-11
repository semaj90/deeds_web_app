import { test, expect } from '@playwright/test';
import { captureRouteLoad, summarise, hardErrorCount } from './_helpers';

test.describe.serial('Route forensic: /rag-search', () => {
	test('GET /rag-search renders without uncaught exceptions', async ({ page }) => {
		const log = await captureRouteLoad(page, '/rag-search');
		summarise(log, 'GET /rag-search');
		expect(hardErrorCount(log)).toBeLessThan(5);
	});

	test('GET /rag-search — search input + submit', async ({ page }) => {
		const log = await captureRouteLoad(page, '/rag-search', { waitMs: 1500 });
		const inputs = await page.locator('input, textarea').count();
		const submit = await page.locator('button').filter({ hasText: /search|ask|query/i }).or(page.locator('button[type="submit"]')).count();
		console.log(`inputs: ${inputs}, submit: ${submit}`);
		summarise(log, 'GET /rag-search (composer)');
		expect(inputs + submit).toBeGreaterThan(0);
	});
});
