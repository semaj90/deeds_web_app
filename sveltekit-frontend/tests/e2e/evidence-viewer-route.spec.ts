import { test, expect } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';

test.describe('EvidenceMediaViewer route — /evidence/[id]/view', () => {
	test('renders not-found state for unknown UUID', async ({ page }) => {
		// DEV_BYPASS_AUTH auto-authenticates as dev user
		await page.goto(`${BASE}/evidence/00000000-0000-0000-0000-000000000999/view`);
		await page.waitForLoadState('domcontentloaded');
		const text = await page.textContent('body');
		expect(text).toMatch(/Cannot display|Evidence not found|database unavailable/i);
	});

	test('rejects invalid UUID format', async ({ page }) => {
		await page.goto(`${BASE}/evidence/not-a-uuid/view`);
		await page.waitForLoadState('domcontentloaded');
		const text = await page.textContent('body');
		expect(text).toMatch(/Invalid evidence ID format/i);
	});

	test('renders without JS errors', async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (err) => errors.push(err.message));
		await page.goto(`${BASE}/evidence/00000000-0000-0000-0000-000000000999/view`);
		await page.waitForLoadState('domcontentloaded');
		expect(errors).toEqual([]);
	});
});
