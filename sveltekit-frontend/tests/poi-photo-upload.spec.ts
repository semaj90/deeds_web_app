import { expect, test } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { PORTS } from './helpers/env-ports.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = PORTS.APP_BASE;

/**
 * Create a valid test PNG using Node.js sharp (already a project dependency).
 * Falls back to raw JPEG bytes if sharp isn't available.
 */
function createTestImage(dir: string): string {
	const filePath = path.join(dir, 'test-poi-photo.png');

	try {
		// Use sharp to create a valid 50x50 red PNG
		execSync(
			`node -e "const sharp = require('sharp'); sharp({ create: { width: 50, height: 50, channels: 3, background: { r: 255, g: 0, b: 0 } } }).png().toFile('${filePath.replace(/\\/g, '/')}').then(() => process.exit(0))"`,
			{ cwd: path.resolve(__dirname, '..'), timeout: 10000 }
		);
		return filePath;
	} catch {
		// Fallback: minimal valid JPEG (known-good bytes for a 1x1 white pixel)
		const jpegPath = path.join(dir, 'test-poi-photo.jpg');
		const jpeg = Buffer.from(
			'/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AKwA//9k=',
			'base64'
		);
		fs.writeFileSync(jpegPath, jpeg);
		return jpegPath;
	}
}

test.describe('POI Photo Upload & Display', () => {
	let testPoiId: string | null = null;
	let testImagePath: string;

	test.beforeAll(() => {
		const dir = path.resolve(__dirname, '..', 'test-results');
		fs.mkdirSync(dir, { recursive: true });
		testImagePath = createTestImage(dir);
	});

	test.afterAll(async ({ request }) => {
		if (testPoiId) {
			await request.delete(`${BASE_URL}/api/persons-of-interest/${testPoiId}`);
		}
		if (testImagePath && fs.existsSync(testImagePath)) {
			fs.unlinkSync(testImagePath);
		}
	});

	const SCREENSHOT_DIR = path.resolve(__dirname, '..', 'test-results', 'poi-photo-screenshots');

	test('can upload a photo to a POI and see it in the grid', async ({ page }) => {
		fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
		// 1. Create a POI via API
		const createRes = await page.request.post(`${BASE_URL}/api/persons-of-interest`, {
			data: {
				name: '[PW-TEST] Photo Upload Subject',
				status: 'surveillance',
				threatLevel: 'low',
				crimes: ['Test Crime'],
				description: 'Automated Playwright photo upload test',
			},
		});
		expect(createRes.ok()).toBeTruthy();
		const poi = await createRes.json();
		testPoiId = poi.id;
		expect(testPoiId).toBeTruthy();

		// 2. Navigate to POI detail page
		await page.goto(`${BASE_URL}/persons-of-interest/${testPoiId}`);
		await page.waitForLoadState('networkidle');
		await expect(page.locator('h1').filter({ hasText: 'Photo Upload Subject' })).toBeVisible({ timeout: 10000 });

		// 3. Click Photos tab
		await page.click('button:has-text("Photos")');
		await page.waitForTimeout(500);
		await expect(page.locator('text=No photos uploaded yet')).toBeVisible();
		await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01-empty-photos-tab.png'), fullPage: true });

		// 4. Upload via the hidden file input
		const fileInput = page.locator('input[type="file"][accept="image/*"]');

		// Listen for the upload API response
		const uploadPromise = page.waitForResponse(
			(res) => res.url().includes('/photos') && res.request().method() === 'POST',
			{ timeout: 30000 }
		);

		await fileInput.setInputFiles(testImagePath);

		// Wait for upload API response
		const uploadRes = await uploadPromise;
		expect(uploadRes.status()).toBe(201);

		// Wait for UI to update
		await page.waitForTimeout(1000);

		// 5. Verify photo appears in the grid
		await expect(page.locator('text=No photos uploaded yet')).not.toBeVisible({ timeout: 10000 });

		const photoImages = page.locator('img[alt^="POI photo"]');
		await expect(photoImages.first()).toBeVisible({ timeout: 10000 });

		// Photo count header shows 1
		await expect(page.locator('text=POI Photos (1)')).toBeVisible();
		await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02-photo-uploaded.png'), fullPage: true });

		// 6. Verify persisted in database via API
		const photosRes = await page.request.get(`${BASE_URL}/api/persons-of-interest/${testPoiId}/photos`);
		expect(photosRes.ok()).toBeTruthy();
		const photosData = await photosRes.json();
		expect(photosData.success).toBe(true);
		expect(photosData.photos.length).toBe(1);

		const dbPhoto = photosData.photos[0];
		expect(dbPhoto.poiId).toBe(testPoiId);
		expect(dbPhoto.url).toBeTruthy();
		expect(dbPhoto.mimeType).toMatch(/^image\//);
	});

	test('photo persists after page reload', async ({ page }) => {
		test.skip(!testPoiId, 'No POI created from previous test');

		await page.goto(`${BASE_URL}/persons-of-interest/${testPoiId}`);
		await page.waitForLoadState('networkidle');
		await page.click('button:has-text("Photos")');
		await page.waitForTimeout(500);

		// Photo still visible after fresh page load
		const photoImages = page.locator('img[alt^="POI photo"]');
		await expect(photoImages.first()).toBeVisible({ timeout: 10000 });
		await expect(page.locator('text=POI Photos (1)')).toBeVisible();
		await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03-photo-persisted.png'), fullPage: true });
	});

	test('can delete a photo from a POI', async ({ page }) => {
		test.skip(!testPoiId, 'No POI created from previous test');

		await page.goto(`${BASE_URL}/persons-of-interest/${testPoiId}`);
		await page.waitForLoadState('networkidle');
		await page.click('button:has-text("Photos")');
		await page.waitForTimeout(500);

		await expect(page.locator('img[alt^="POI photo"]').first()).toBeVisible({ timeout: 10000 });

		// Accept confirmation dialog
		page.on('dialog', async (dialog) => {
			await dialog.accept();
		});

		// Hover photo card to reveal delete button
		const photoCard = page.locator('.relative.group').first();
		await photoCard.hover();
		await page.waitForTimeout(300);

		// Click delete (trash icon button)
		const deleteBtn = photoCard.locator('button').filter({ has: page.locator('.i-lucide-trash-2') });
		await deleteBtn.click();
		await page.waitForTimeout(2000);

		// Empty state returns
		await expect(page.locator('text=No photos uploaded yet')).toBeVisible({ timeout: 10000 });
		await expect(page.locator('text=POI Photos (0)')).toBeVisible();
		await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04-photo-deleted.png'), fullPage: true });

		// Verify deletion via API
		const photosRes = await page.request.get(`${BASE_URL}/api/persons-of-interest/${testPoiId}/photos`);
		expect(photosRes.ok()).toBeTruthy();
		const photosData = await photosRes.json();
		expect(photosData.photos.length).toBe(0);
	});
});
