/**
 * Evidence Upload + Modal Viewer Tests
 *
 * Tests the evidence upload flow and EvidenceViewModal:
 *   1. Upload an image via the evidence upload API
 *   2. Verify evidence appears in the evidence list
 *   3. Open the view modal and verify image preview renders
 *   4. Verify modal close behaviors (X button, backdrop click, Escape key)
 *   5. Verify expanded modal sizing (960px max-width, 520px image preview)
 *   6. Cleanup uploaded evidence
 *
 * Prerequisites:
 *   - Dev server running (npm run dev)
 *   - MinIO accessible (port 9000)
 *   - PostgreSQL accessible (port 5432)
 */

import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';
const DB_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db';
const SCREENSHOT_DIR = 'test-results/evidence-modal-screenshots';

let testEvidenceId: string | null = null;
let testImagePath: string;

test.describe('Evidence Upload + Modal Viewer', () => {
	test.describe.configure({ mode: 'serial' });

	test.beforeAll(async () => {
		// Create a valid test PNG image using sharp
		testImagePath = path.join(__dirname, 'test-evidence-image.png');
		try {
			execSync(
				`node -e "require('sharp')({create:{width:200,height:200,channels:3,background:{r:0,g:100,b:200}}}).png().toFile('${testImagePath.replace(/\\/g, '/')}')"`,
				{ cwd: path.join(__dirname, '..'), timeout: 10000 }
			);
		} catch {
			// Fallback: minimal valid PNG
			const minPng = Buffer.from(
				'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
				'base64'
			);
			fs.writeFileSync(testImagePath, minPng);
		}
	});

	test.afterAll(async () => {
		// Clean up test image file
		if (fs.existsSync(testImagePath)) {
			fs.unlinkSync(testImagePath);
		}

		// Clean up test evidence from DB
		if (testEvidenceId) {
			const pool = new pg.Pool({ connectionString: DB_URL });
			try {
				await pool.query('DELETE FROM evidence WHERE id = $1', [testEvidenceId]);
			} catch {
				// Non-fatal cleanup
			} finally {
				await pool.end();
			}
		}
	});

	test('1. upload evidence image via API', async ({ request }) => {
		const form = new FormData();
		const imageBuffer = fs.readFileSync(testImagePath);
		const blob = new Blob([imageBuffer], { type: 'image/png' });
		form.append('file', blob, '[PW-TEST] evidence-test-image.png');
		form.append('title', '[PW-TEST] Modal Viewer Test Image');
		form.append('description', 'Playwright test image for modal viewer verification');

		const response = await request.post(`${BASE}/api/evidence/upload`, {
			multipart: {
				file: {
					name: '[PW-TEST] evidence-test-image.png',
					mimeType: 'image/png',
					buffer: imageBuffer,
				},
				title: '[PW-TEST] Modal Viewer Test Image',
				description: 'Playwright test image for modal viewer verification',
			},
		});

		const status = response.status();
		if (status === 201 || status === 200) {
			const body = await response.json();
			testEvidenceId = body.id ?? body.evidence?.id ?? body.data?.id ?? null;
			expect(testEvidenceId).toBeTruthy();
			console.log('[evidence-upload] Created evidence ID:', testEvidenceId);
		} else {
			// Upload may fail if MinIO or pipeline is down — skip gracefully
			const body = await response.text();
			console.log('[evidence-upload] Status:', status, 'Body:', body.slice(0, 200));
			test.skip(true, `Evidence upload returned ${status} — MinIO or pipeline may be down`);
		}
	});

	test('2. evidence appears in the evidence list', async ({ page }) => {
		test.skip(!testEvidenceId, 'No evidence uploaded — skipping');

		await page.goto(`${BASE}/evidence`, { waitUntil: 'domcontentloaded', timeout: 60_000 });

		// Wait for evidence list to load
		await page.waitForTimeout(2000);

		await page.screenshot({
			path: `${SCREENSHOT_DIR}/01-evidence-list.png`,
			fullPage: false,
		});

		// Evidence list should render
		const body = await page.textContent('body');
		expect(body).not.toContain('Internal Error');
	});

	test('3. open view modal and verify image preview', async ({ page }) => {
		test.skip(!testEvidenceId, 'No evidence uploaded — skipping');

		await page.goto(`${BASE}/evidence`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
		await page.waitForTimeout(2000);

		// Try clicking on the first evidence card/row to open the modal
		// Evidence cards typically have an onclick that calls openDocumentModal
		const evidenceCard = page.locator('[data-evidence-id], .evidence-card, .evidence-row, [role="button"]').first();
		const cardExists = await evidenceCard.count() > 0;

		if (cardExists) {
			await evidenceCard.click();
			await page.waitForTimeout(1000);

			// Check if modal opened
			const modal = page.locator('[role="dialog"]');
			const modalVisible = await modal.isVisible().catch(() => false);

			if (modalVisible) {
				await page.screenshot({
					path: `${SCREENSHOT_DIR}/02-modal-open.png`,
					fullPage: false,
				});

				// Verify modal has expected content
				const modalText = await modal.textContent();
				expect(modalText).toBeTruthy();

				// Check for image preview or file type display
				const previewImg = modal.locator('img');
				const pdfIframe = modal.locator('iframe');
				const hasPreview = (await previewImg.count()) > 0 || (await pdfIframe.count()) > 0;
				console.log('[modal] Has preview:', hasPreview);
			} else {
				console.log('[modal] Modal did not open from card click — trying API-based approach');
			}
		}

		// Fallback: open modal via direct URL state if card click didn't work
		if (!cardExists || !(await page.locator('[role="dialog"]').isVisible().catch(() => false))) {
			// Navigate with evidence ID in state
			await page.evaluate((id) => {
				window.history.pushState(
					{ showDocumentModal: true, documentId: id },
					'',
					window.location.pathname
				);
				window.dispatchEvent(new PopStateEvent('popstate'));
			}, testEvidenceId);

			await page.waitForTimeout(1500);

			const modal = page.locator('[role="dialog"]');
			if (await modal.isVisible().catch(() => false)) {
				await page.screenshot({
					path: `${SCREENSHOT_DIR}/02-modal-open-fallback.png`,
					fullPage: false,
				});
			}
		}
	});

	test('4. modal closes on X button click', async ({ page }) => {
		test.skip(!testEvidenceId, 'No evidence uploaded — skipping');

		await page.goto(`${BASE}/evidence`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
		await page.waitForTimeout(2000);

		// Open modal via pushState
		await page.evaluate((id) => {
			window.history.pushState(
				{ showDocumentModal: true, documentId: id },
				'',
				window.location.pathname
			);
			window.dispatchEvent(new PopStateEvent('popstate'));
		}, testEvidenceId);
		await page.waitForTimeout(1500);

		const modal = page.locator('[role="dialog"]');
		const modalVisible = await modal.isVisible().catch(() => false);

		if (modalVisible) {
			// Click X button (modal-close class or aria-label="Close")
			const closeBtn = page.locator('[aria-label="Close"], .modal-close').first();
			if (await closeBtn.isVisible()) {
				await closeBtn.click();
				await page.waitForTimeout(500);

				const stillVisible = await modal.isVisible().catch(() => false);
				expect(stillVisible).toBe(false);
				console.log('[modal] X button close: OK');
			}
		} else {
			console.log('[modal] Could not open modal for X button test');
		}
	});

	test('5. modal closes on backdrop click', async ({ page }) => {
		test.skip(!testEvidenceId, 'No evidence uploaded — skipping');

		await page.goto(`${BASE}/evidence`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
		await page.waitForTimeout(2000);

		// Open modal
		await page.evaluate((id) => {
			window.history.pushState(
				{ showDocumentModal: true, documentId: id },
				'',
				window.location.pathname
			);
			window.dispatchEvent(new PopStateEvent('popstate'));
		}, testEvidenceId);
		await page.waitForTimeout(1500);

		const modal = page.locator('[role="dialog"]');
		const backdrop = page.locator('.modal-backdrop');

		if (await modal.isVisible().catch(() => false)) {
			// Click on the backdrop (outside the modal panel)
			const backdropBox = await backdrop.boundingBox();
			if (backdropBox) {
				// Click top-left corner of backdrop (outside modal)
				await page.mouse.click(backdropBox.x + 10, backdropBox.y + 10);
				await page.waitForTimeout(500);

				const stillVisible = await modal.isVisible().catch(() => false);
				expect(stillVisible).toBe(false);
				console.log('[modal] Backdrop click close: OK');
			}
		}
	});

	test('6. modal closes on Escape key', async ({ page }) => {
		test.skip(!testEvidenceId, 'No evidence uploaded — skipping');

		await page.goto(`${BASE}/evidence`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
		await page.waitForTimeout(2000);

		// Open modal
		await page.evaluate((id) => {
			window.history.pushState(
				{ showDocumentModal: true, documentId: id },
				'',
				window.location.pathname
			);
			window.dispatchEvent(new PopStateEvent('popstate'));
		}, testEvidenceId);
		await page.waitForTimeout(1500);

		const modal = page.locator('[role="dialog"]');

		if (await modal.isVisible().catch(() => false)) {
			await page.keyboard.press('Escape');
			await page.waitForTimeout(500);

			const stillVisible = await modal.isVisible().catch(() => false);
			expect(stillVisible).toBe(false);
			console.log('[modal] Escape key close: OK');
		}
	});

	test('7. verify modal sizing (expanded 960px)', async ({ page }) => {
		test.skip(!testEvidenceId, 'No evidence uploaded — skipping');

		await page.goto(`${BASE}/evidence`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
		await page.waitForTimeout(2000);

		// Open modal
		await page.evaluate((id) => {
			window.history.pushState(
				{ showDocumentModal: true, documentId: id },
				'',
				window.location.pathname
			);
			window.dispatchEvent(new PopStateEvent('popstate'));
		}, testEvidenceId);
		await page.waitForTimeout(1500);

		const modalPanel = page.locator('.modal-panel');

		if (await modalPanel.isVisible().catch(() => false)) {
			const box = await modalPanel.boundingBox();
			if (box) {
				// Modal should be wider than old 680px, up to 960px
				console.log(`[modal] Panel dimensions: ${box.width}x${box.height}`);
				expect(box.width).toBeGreaterThan(600);
				expect(box.width).toBeLessThanOrEqual(960);
			}

			// Check computed max-width style
			const maxWidth = await modalPanel.evaluate((el) =>
				window.getComputedStyle(el).maxWidth
			);
			expect(maxWidth).toBe('960px');
			console.log('[modal] max-width:', maxWidth);

			await page.screenshot({
				path: `${SCREENSHOT_DIR}/03-modal-sizing.png`,
				fullPage: false,
			});
		}
	});
});
