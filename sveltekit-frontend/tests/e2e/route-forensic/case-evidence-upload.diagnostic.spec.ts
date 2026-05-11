import { test, expect } from '@playwright/test';
import { captureRouteLoad, summarise, hardErrorCount, loadAnyCaseId } from './_helpers';

test.describe.serial('Route forensic: /cases/[id]/evidence/upload', () => {
	let caseId: string | null = null;

	test.beforeAll(async () => {
		caseId = await loadAnyCaseId();
	});

	test('GET /cases/[id]/evidence/upload renders without uncaught exceptions', async ({ page }) => {
		if (!caseId) test.skip();
		const log = await captureRouteLoad(page, `/cases/${caseId}/evidence/upload`);
		summarise(log, `GET /cases/${caseId!.slice(0, 8)}.../evidence/upload`);
		expect(hardErrorCount(log)).toBeLessThan(5);
	});

	test('GET /cases/[id]/evidence/upload — file input or drop zone present', async ({ page }) => {
		if (!caseId) test.skip();
		const log = await captureRouteLoad(page, `/cases/${caseId}/evidence/upload`, { waitMs: 1500 });
		const fileInput = await page.locator('input[type="file"]').count();
		const dropZone = await page
			.locator('[data-testid*="drop"], [class*="drop-zone"], [class*="dropzone"], [class*="upload-zone"]')
			.count();
		const uploadBtn = await page.locator('button').filter({ hasText: /upload|attach|browse/i }).count();
		console.log(`file inputs: ${fileInput}, drop zones: ${dropZone}, upload btns: ${uploadBtn}`);
		summarise(log, 'upload affordances');
		expect(fileInput + dropZone + uploadBtn, 'no upload affordance present').toBeGreaterThan(0);
	});
});
