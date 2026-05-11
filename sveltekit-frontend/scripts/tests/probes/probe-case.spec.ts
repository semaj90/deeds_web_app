import { test } from '@playwright/test';
import { loadAnyCaseId } from './route-forensic/_helpers';

test('probe case detail DOM (real UUID)', async ({ page }) => {
	const caseId = await loadAnyCaseId();
	console.log('USING CASE ID:', caseId);
	if (!caseId) test.skip();

	const errs: string[] = [];
	page.on('console', (m) => errs.push(`${m.type()}: ${m.text().slice(0, 200)}`));
	page.on('pageerror', (e) => errs.push(`PAGEERR: ${e.message}\n${e.stack?.slice(0, 400) ?? ''}`));

	await page.goto(`http://127.0.0.1:5173/cases/${caseId}`, {
		waitUntil: 'networkidle',
		timeout: 30000,
	}).catch(() => {});
	await page.waitForTimeout(3000);

	const counts = await page.evaluate(() => ({
		h1: document.querySelectorAll('h1').length,
		h2: document.querySelectorAll('h2').length,
		buttons: document.querySelectorAll('button').length,
		links: document.querySelectorAll('a').length,
		bodyLen: document.body.innerHTML.length,
		bodyHTMLPreview: document.body.innerHTML.slice(0, 200),
		hasSidebar: !!document.querySelector('.yorha-sidebar'),
		hasMain: !!document.querySelector('main, .min-h-screen'),
	}));
	console.log('COUNTS:', JSON.stringify(counts, null, 2));
	console.log('---ERRS (first 30)---');
	errs.slice(0, 30).forEach((e) => console.log(e));
});
