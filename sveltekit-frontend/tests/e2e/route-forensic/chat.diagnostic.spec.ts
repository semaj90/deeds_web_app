import { test, expect } from '@playwright/test';
import { captureRouteLoad, summarise, hardErrorCount } from './_helpers';

test.describe.serial('Route forensic: /chat', () => {
	test('GET /chat renders without uncaught exceptions', async ({ page }) => {
		const log = await captureRouteLoad(page, '/chat');
		summarise(log, 'GET /chat');
		expect(hardErrorCount(log)).toBeLessThan(5);
	});

	test('GET /chat — input field + send button present', async ({ page }) => {
		const log = await captureRouteLoad(page, '/chat', { waitMs: 1500 });
		const textInputs = await page.locator('textarea, input[type="text"], [contenteditable="true"]').count();
		const sendBtn = await page.locator('button:has-text(/send|submit|ask/i), button[type="submit"]').count();
		console.log(`text inputs: ${textInputs}, send btns: ${sendBtn}`);
		summarise(log, 'GET /chat (composer)');
		expect(textInputs + sendBtn, 'no chat composer found').toBeGreaterThan(0);
	});
});
