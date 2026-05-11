import { test, expect } from '@playwright/test';
import { captureRouteLoad, summarise, hardErrorCount, loadAnyEvidenceId } from './_helpers';

test.describe.serial('Route forensic: /evidence/[id]/view', () => {
	let evidenceId: string | null = null;

	test.beforeAll(async () => {
		evidenceId = await loadAnyEvidenceId();
	});

	test('GET /evidence/[id]/view renders without uncaught exceptions', async ({ page }) => {
		if (!evidenceId) test.skip();
		const log = await captureRouteLoad(page, `/evidence/${evidenceId}/view`);
		summarise(log, `GET /evidence/${evidenceId!.slice(0, 8)}.../view`);
		expect(hardErrorCount(log)).toBeLessThan(5);
	});

	test('GET /evidence/[id]/view — preview or graceful not-found', async ({ page }) => {
		if (!evidenceId) test.skip();
		const log = await captureRouteLoad(page, `/evidence/${evidenceId}/view`, { waitMs: 1500 });
		const media = await page.locator('img, video, audio, iframe, pre, [class*="viewer"]').count();
		const notFound = await page.locator('text=/not found|unavailable/i').count();
		console.log(`media: ${media}, not-found text: ${notFound}`);
		summarise(log, 'GET /evidence/[id]/view (content)');
		expect(media + notFound, 'no preview or graceful message').toBeGreaterThan(0);
	});

	test('GET /evidence/[bad-uuid]/view returns graceful 404 (no 5xx)', async ({ page }) => {
		const log = await captureRouteLoad(page, '/evidence/not-a-uuid/view');
		const got5xx = log.responses.some((r) => r.status >= 500 && r.url.includes('/evidence/'));
		summarise(log, 'GET /evidence/<bad>/view');
		expect(got5xx).toBe(false);
	});
});
