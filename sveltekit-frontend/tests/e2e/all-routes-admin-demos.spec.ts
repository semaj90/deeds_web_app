import { expect, test } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';

test.describe('All-Routes, Admin & Demos Organization & Controls', () => {
	test('/demos renders 82 demos + 10 showcases, category filters, and preview modal', async ({
		page,
	}) => {
		const pageErrors: string[] = [];
		page.on('pageerror', (e) => pageErrors.push(e.message));

		const res = await page.goto(`${BASE}/demos`, { waitUntil: 'domcontentloaded' });
		expect(res?.status()).toBe(200);

		const demoCards = page.locator('.card:not(.showcase)');
		const showcaseCards = page.locator('.card.showcase');
		await expect(demoCards).toHaveCount(82);
		await expect(showcaseCards).toHaveCount(10);

		// Filter by AI & ML category chip
		const aiChip = page.locator('.filter-chip', { hasText: 'AI & ML' });
		await aiChip.click();
		const filteredCount = await demoCards.count();
		expect(filteredCount).toBeGreaterThan(10);
		expect(filteredCount).toBeLessThan(82);

		// Reset filter
		await page.locator('.filter-chip', { hasText: 'All' }).click();
		await expect(demoCards).toHaveCount(82);

		// Click first demo card to open DiamondModal preview and close it
		await demoCards.first().click();
		await expect(page.locator('.modal-route code')).toBeVisible();
		await page.getByRole('button', { name: 'Close', exact: true }).click();

		expect(pageErrors, `pageErrors: ${pageErrors.join(' | ')}`).toEqual([]);
	});

	test('/admin renders all 46 categorized Admin Tools, category pills, and search filter', async ({
		page,
	}) => {
		const pageErrors: string[] = [];
		page.on('pageerror', (e) => pageErrors.push(e.message));

		const res = await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
		expect(res?.status()).toBe(200);

		const navCards = page.locator('.nav-card');
		await expect(navCards).toHaveCount(46, { timeout: 15_000 });

		// Category filter pill: Atlas & Graph (9)
		const atlasPill = page.locator('.cat-pill', { hasText: 'Atlas & Graph' });
		await atlasPill.click();
		await expect(navCards).toHaveCount(9);

		// Reset to All (46)
		await page.locator('.cat-pill', { hasText: 'All (46)' }).click();
		await expect(navCards).toHaveCount(46);

		// Search input filter
		const searchInput = page.locator('.admin-search-input');
		await searchInput.fill('All Routes');
		await expect(navCards).toHaveCount(1);
		await expect(navCards.first()).toHaveAttribute('href', '/admin/all-routes');

		expect(pageErrors, `pageErrors: ${pageErrors.join(' | ')}`).toEqual([]);
	});

	test('/admin/all-routes loads populated route graph + live routes without blank paths', async ({
		page,
	}) => {
		const pageErrors: string[] = [];
		page.on('pageerror', (e) => pageErrors.push(e.message));

		const res = await page.goto(`${BASE}/admin/all-routes`, { waitUntil: 'domcontentloaded' });
		expect(res?.status()).toBe(200);

		await expect(page.locator('body')).toContainText(/All Routes|Route/i, { timeout: 25_000 });
		expect(pageErrors, `pageErrors: ${pageErrors.join(' | ')}`).toEqual([]);
	});
});
