import { test, expect } from '@playwright/test';

/**
 * Fixture proofs for the loader. These run against the public demo routes, which use simulated progress.
 * They do not prove that real indexing progress drives the loader. That needs a live job feed.
 */
test.describe('SnesBookLoader demo routes (simulated fixture proof)', () => {
	test('indexing loader demo renders its stage and progressbar without page errors', async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (err) => errors.push(err.message));
		await page.goto('/demos/indexing-loader');
		await expect(page.getByRole('progressbar')).toBeVisible();
		await expect(page.getByText('SIMULATED PROGRESS')).toBeVisible();
		expect(errors).toEqual([]);
	});

	test('search demo shows the query glyph and an LOD texture class', async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (err) => errors.push(err.message));
		await page.goto('/demos/snes-book-loader');
		await expect(page.getByText('negligence duty of care')).toBeVisible();
		const className = await page.getByRole('progressbar').evaluate((el) => el.className);
		expect(/lod-[012]/.test(className)).toBe(true);
		expect(errors).toEqual([]);
	});

	test('reduced motion stops the frame timer; the bar still renders', async ({ browser }) => {
		const context = await browser.newContext({ reducedMotion: 'reduce' });
		const page = await context.newPage();
		await page.goto('/demos/indexing-loader');
		await expect(page.getByRole('progressbar')).toBeVisible();
		await expect(page.getByText('REDUCED MOTION')).toBeVisible();
		await context.close();
	});
});
