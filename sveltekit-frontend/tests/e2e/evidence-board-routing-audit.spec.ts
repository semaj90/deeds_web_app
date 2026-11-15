import { test, expect } from '@playwright/test';

/**
 * Evidence Board Interactive Routing & Lex AI Dossier NeoUI Brutal Audit E2E Test
 * Case: 3ac1c56f-8812-4f3b-9a10-20261106a1b2 (State v. Johnson & Arulian Corp)
 * Route: /cases/3ac1c56f-8812-4f3b-9a10-20261106a1b2/board
 */

const CASE_ID = '3ac1c56f-8812-4f3b-9a10-20261106a1b2';
const BOARD_URL = `/cases/${CASE_ID}/board`;

test.describe('Evidence Board Interactive Routing & Lex AI Dossier Audit', () => {
	test.beforeEach(async ({ page }) => {
		// Authenticate as demo admin
		await page.goto('/');
		await page.request.post('/api/auth/demo-login', {
			data: { email: 'admin@yorha.dev', role: 'admin' }
		});
	});

	test('validates all evidence board interactive buttons, modals, and route destinations', async ({ page }) => {
		await page.goto(BOARD_URL, { waitUntil: 'networkidle' });

		// Verify page loaded cleanly and displays case docket
		await expect(page.locator('#main-content')).toBeVisible({ timeout: 20_000 });
		const pageContent = await page.content();
		expect(pageContent).toContain('3AC1C56F');

		// 1. Switch Case [⌘K] Popover Trigger & Escape Dismissal
		const switchCaseBtn = page.locator('.case-switcher button.action-btn:has-text("Switch Case")');
		if (await switchCaseBtn.isVisible()) {
			await switchCaseBtn.click();
			const switcherDropdown = page.locator('.case-switcher-dropdown');
			await expect(switcherDropdown).toBeVisible({ timeout: 5_000 });
			await page.keyboard.press('Escape');
			await expect(switcherDropdown).not.toBeVisible({ timeout: 5_000 });
		}

		// 2. Chat Sidebar Toggle
		const chatBtn = page.locator('button.action-btn:has-text("Chat")');
		if (await chatBtn.isVisible()) {
			await chatBtn.click();
			await expect(chatBtn).toHaveClass(/active/);
			await chatBtn.click();
		}

		// 3. Courtroom Evidentiary Brief Modal Trigger & Dismissal
		const briefBtn = page.locator('button.brief-action-btn:has-text("AI Counsel")');
		if (await briefBtn.isVisible()) {
			await briefBtn.click();
			const briefOverlay = page.locator('.brief-modal-backdrop');
			await expect(briefOverlay).toBeVisible({ timeout: 5_000 });
			const closeBriefBtn = page.locator('button.btn-brief-close');
			await closeBriefBtn.click();
			await expect(briefOverlay).not.toBeVisible({ timeout: 5_000 });
		}

		// 4. Add Evidence Modal Trigger & Dismissal
		const addEvidenceBtn = page.locator('.header-actions button.btn-primary:has-text("Add Evidence")');
		if (await addEvidenceBtn.isVisible()) {
			await addEvidenceBtn.click();
			const uploadModal = page.locator('[role="dialog"], .evidence-upload-modal, .modal-light-content');
			await expect(uploadModal.first()).toBeVisible({ timeout: 5_000 });
			await page.keyboard.press('Escape');
		}

		// 5. Chain of Custody / Evidence View Modal
		const chainBtn = page.locator('button:has-text("View (3 entries) >")');
		if (await chainBtn.isVisible()) {
			await chainBtn.click();
			const viewModal = page.locator('[role="dialog"], .evidence-view-modal, .modal-backdrop');
			await expect(viewModal.first()).toBeVisible({ timeout: 5_000 });
			await page.keyboard.press('Escape');
		}

		// 6. 3D Relief Demo Navigation Link
		const reliefLink = page.locator('a[data-testid="relief-demo-link"]');
		await expect(reliefLink).toBeVisible({ timeout: 10_000 });
		await reliefLink.click();
		await page.waitForURL(`**/cases/${CASE_ID}/board/relief`, { timeout: 15_000 });

		// Verify 3D relief page loaded with Lex AI Dossier styling
		const reliefHeader = page.locator('h1:has-text("Relief demo")');
		await expect(reliefHeader).toBeVisible();

		// Navigate back to the board
		await page.goto(BOARD_URL, { waitUntil: 'networkidle' });

		// 7. Case Subnav Navigation Routes Verification
		const subnavTargets = [
			{ label: 'DOSSIER HUB', path: `/cases/${CASE_ID}` },
			{ label: '✦ AI COUNSEL CHAT', path: `/cases/${CASE_ID}/chat` },
			{ label: 'OVERVIEW', path: `/cases/${CASE_ID}/overview` },
			{ label: 'NOTES', path: `/cases/${CASE_ID}/notes` },
			{ label: 'EVIDENCE CANVAS', path: `/cases/${CASE_ID}/canvas` },
			{ label: 'REPORTS', path: `/cases/${CASE_ID}/reports` }
		];

		for (const target of subnavTargets) {
			const link = page.locator(`a:has-text("${target.label}")`);
			if (await link.count() > 0) {
				const href = await link.first().getAttribute('href');
				expect(href).toBe(target.path);
			}
		}

		// 8. View Switcher Mode Buttons Verification
		const viewModes = ['INVESTIGATIVE', 'FORENSIC CANVAS', 'DETECTIVE', 'WALL', 'LINE', 'FILE', 'LIST'];
		for (const mode of viewModes) {
			const modeBtn = page.locator(`button:has-text("${mode}")`);
			if (await modeBtn.count() > 0 && await modeBtn.first().isVisible()) {
				await modeBtn.first().click();
				await expect(modeBtn.first()).toHaveClass(/active/);
			}
		}
	});
});
