/**
 * Cases — Real Data Playwright Tests
 *
 * Uses test cases seeded by global-setup.ts (via POST /api/cases with DEV_BYPASS_AUTH).
 * All 3 seed cases have a '[PW-TEST]' title prefix for easy identification and cleanup.
 *
 * Preconditions:
 * - Dev server running at PLAYWRIGHT_BASE_URL (default: http://127.0.0.1:5173)
 * - DEV_BYPASS_AUTH=true in .env (auto-auth as dev user 00000000-0000-0000-0000-000000000001)
 * - global-setup.ts has seeded the 3 test cases
 */

import { test, expect } from '@playwright/test';
import { TEST_CASE_SEED, TEST_CASE_PREFIX } from '../fixtures/test-cases.js';

// Navigate with status=open to avoid seeing archived cases from previous runs
const CASES_URL = '/cases?status=open';

test.describe('Cases — Real Seeded Data', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(CASES_URL);
		await page.waitForLoadState('networkidle');
	});

	test('should display all 3 seeded test cases on the cases page', async ({ page }) => {
		for (const seedCase of TEST_CASE_SEED) {
			await expect(page.getByText(seedCase.title, { exact: false })).toBeVisible();
		}
	});

	test('should find seeded cases when searching by prefix', async ({ page }) => {
		// Use partial placeholder match (.first() to avoid strict mode violation)
		const searchInput = page.getByPlaceholder(/search cases/i).first();
		await searchInput.fill(TEST_CASE_PREFIX);
		await page.keyboard.press('Enter');
		await page.waitForLoadState('networkidle');

		for (const seedCase of TEST_CASE_SEED) {
			await expect(page.getByText(seedCase.title, { exact: false })).toBeVisible();
		}
	});

	test('should show all 3 seeded cases with open status active', async ({ page }) => {
		// Already navigated to /cases?status=open
		for (const seedCase of TEST_CASE_SEED) {
			await expect(page.getByText(seedCase.title, { exact: false })).toBeVisible();
		}
	});

	test('should filter high priority cases via URL (only Yorha case is high)', async ({ page }) => {
		// Navigate directly to filtered URL for reliable server-side filtering
		await page.goto('/cases?status=open&priority=high');
		await page.waitForLoadState('networkidle');

		// Yorha (high) should appear
		await expect(page.getByText(TEST_CASE_SEED[0].title, { exact: false })).toBeVisible();

		// Goliath Corp (medium) and Unit 9S (low) should not appear
		await expect(page.getByText(TEST_CASE_SEED[1].title, { exact: false })).not.toBeVisible();
		await expect(page.getByText(TEST_CASE_SEED[2].title, { exact: false })).not.toBeVisible();
	});

	test('should show status badge "open" on seeded cases', async ({ page }) => {
		const firstTitle = TEST_CASE_SEED[0].title;
		const caseCard = page.locator('.cs-card').filter({ hasText: firstTitle }).first();
		await expect(caseCard.getByText('open', { exact: false })).toBeVisible();
	});

	test('should open case detail when clicking a seeded case', async ({ page }) => {
		const firstTitle = TEST_CASE_SEED[0].title;
		const caseCard = page.locator('.cs-card').filter({ hasText: firstTitle }).first();
		// Click the card body button (opens detail modal, not URL navigation)
		await caseCard.locator('.cs-card-body').click();
		// Either a modal opens or the URL changes — accept both
		const modalOrNav = await Promise.race([
			page.waitForURL(/\/cases\/[a-z0-9-]+/, { timeout: 5000 }).then(() => 'nav' as const),
			page.locator('[role="dialog"], .modal, .case-detail-modal').first().waitFor({ timeout: 5000 }).then(() => 'modal' as const),
		]).catch(() => 'timeout' as const);
		expect(['nav', 'modal']).toContain(modalOrNav);
	});

	test('should show case detail content after clicking a seeded case', async ({ page }) => {
		const firstCase = TEST_CASE_SEED[0];
		const caseCard = page.locator('.cs-card').filter({ hasText: firstCase.title }).first();
		await caseCard.locator('.cs-card-body').click();
		// Verify the case title appears in the detail modal (use .first() for strict mode)
		await expect(page.getByText(firstCase.title, { exact: false }).first()).toBeVisible({ timeout: 10000 });
	});

	test('should show all 3 seeded cases in the cases grid', async ({ page }) => {
		for (const seedCase of TEST_CASE_SEED) {
			const card = page.locator('.cs-card').filter({ hasText: seedCase.title });
			await expect(card.first()).toBeVisible();
		}
	});
});
