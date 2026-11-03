import { test, expect } from '@playwright/test';

/**
 * Diagnostic for /cases/:id/board/relief (demo beside the evidence board).
 * The board header link must reach it; the page must show exactly one honest state: image list (with depth/no-depth
 * badges), an empty-case message, or a load error. A no-depth image must never render a relief.
 */
const KNOWN = /ERR_UNKNOWN_URL_SCHEME @ minio:\/\/|\[board-persistence\] IndexedDB save failed/;

test('board header link opens the relief demo and it shows an honest state', async ({ page }, info) => {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
	page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()} @ ${m.location().url}`); });

	await page.goto('/cases');
	const link = page.locator('a[href^="/cases/"]').filter({ hasNot: page.locator('[href$="/new"]') }).first();
	await expect(link).toBeVisible({ timeout: 30_000 });
	const id = ((await link.getAttribute('href')) ?? '').split('/').filter(Boolean)[1];

	await page.goto(`/cases/${id}/board`);
	const demo = page.getByTestId('relief-demo-link');
	await expect(demo).toBeVisible({ timeout: 30_000 });
	await demo.click();
	await expect(page).toHaveURL(new RegExp(`/cases/${id}/board/relief$`));

	const items = page.getByTestId('relief-item');
	const empty = page.getByTestId('relief-empty');
	const loadErr = page.getByTestId('relief-load-error');
	await expect(items.first().or(empty).or(loadErr)).toBeVisible({ timeout: 30_000 });
	expect(await loadErr.count(), 'relief page reported a load error').toBe(0);

	const n = await items.count();
	console.log('RELIEF ITEMS:', n, 'EMPTY:', await empty.count());
	if (n > 0) {
		// Whichever item is selected must be either a rendered viewer (has depth) or an explicit no-depth notice.
		const viewer = page.getByTestId('depth-relief');
		const noDepth = page.getByTestId('relief-no-depth');
		await expect(viewer.or(noDepth)).toBeVisible({ timeout: 30_000 });
		if (await viewer.count()) {
			await expect(viewer).not.toHaveAttribute('data-backend', 'none', { timeout: 30_000 });
			const box = await viewer.boundingBox();
			expect(box?.width ?? 0).toBeGreaterThan(300);
		}
		// Clicking each item keeps the page in a valid state.
		for (let i = 0; i < Math.min(n, 3); i++) {
			await items.nth(i).click();
			await expect(page.getByTestId('depth-relief').or(page.getByTestId('relief-no-depth'))).toBeVisible({ timeout: 30_000 });
		}
	}
	await page.screenshot({ path: process.env.RELIEF_SHOT ?? info.outputPath('relief.png') });
	const unexpected = errors.filter((e) => !KNOWN.test(e) && !/^\s+at /.test(e));
	expect(unexpected, unexpected.join('\n')).toEqual([]);
});
