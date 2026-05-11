import { test } from '@playwright/test';

test('probe /evidence DOM', async ({ page }) => {
	const errs: string[] = [];
	page.on('console', (m) => errs.push(`${m.type()}: ${m.text().slice(0, 300)}`));
	page.on('pageerror', (e) => errs.push(`PAGEERR: ${e.message}\n${(e.stack ?? '').slice(0, 500)}`));

	await page.goto('http://127.0.0.1:5173/evidence', {
		waitUntil: 'domcontentloaded',
		timeout: 30000,
	}).catch(() => {});
	await page.waitForTimeout(1500);

	const counts = await page.evaluate(() => ({
		h1: document.querySelectorAll('h1').length,
		h2: document.querySelectorAll('h2').length,
		buttons: document.querySelectorAll('button').length,
		links: document.querySelectorAll('a').length,
		rows: document.querySelectorAll('[data-testid*="evidence"], li, table tr').length,
		uploadCTA: document.querySelectorAll('a[href*="upload"]').length,
		bodyLen: document.body.innerHTML.length,
		hasSidebar: !!document.querySelector('.yorha-sidebar'),
		hasMain: !!document.querySelector('main'),
	}));
	console.log('URL:', page.url());
	console.log('COUNTS:', JSON.stringify(counts, null, 2));
	console.log('---ERRS (first 30)---');
	errs.slice(0, 30).forEach((e) => console.log(e));
});