import { test } from '@playwright/test';

test('probe /legal-corpus/[id] hydration', async ({ page }) => {
	const errs: string[] = [];
	page.on('console', (m) => errs.push(`${m.type()}: ${m.text().slice(0, 300)}`));
	page.on('pageerror', (e) => errs.push(`PAGEERR: ${e.message}\n${(e.stack ?? '').slice(0, 500)}`));

	await page.goto('http://127.0.0.1:5173/legal-corpus/00000000-0000-4000-8000-000000000001', {
		waitUntil: 'networkidle',
		timeout: 30000,
	}).catch(() => {});
	await page.waitForTimeout(3000);

	const counts = await page.evaluate(() => ({
		h1: document.querySelectorAll('h1').length,
		h2: document.querySelectorAll('h2').length,
		errorMsg: document.querySelectorAll('.error-msg').length,
		buttons: document.querySelectorAll('button').length,
		bodyLen: document.body.innerHTML.length,
		bodyTextPreview: document.body.innerText.slice(0, 400),
	}));
	console.log('COUNTS:', JSON.stringify(counts, null, 2));
	console.log('---ERRS (first 20)---');
	errs.slice(0, 20).forEach((e) => console.log(e));
});
