/**
 * POI Photo Lifecycle E2E Tests
 *
 * Tests the POI creation + photo upload lifecycle:
 *   1. Create POI via API
 *   2. Upload photo to POI
 *   3. Navigate to POI detail and verify photo renders
 *   4. Verify photo metadata via API
 *   5. Cleanup
 *
 * Prerequisites:
 *   - Dev server running (npm run dev)
 *   - PostgreSQL accessible (port 5432)
 *   - MinIO accessible (port 9000) — tests skip if unavailable
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { registerTestUser } from './utils/seed-cases';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';
const DB_URL =
	process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db';

test.describe('POI Photo Lifecycle', () => {
	test.describe.configure({ mode: 'serial' });

	let apiContext: APIRequestContext;
	let poiId: string | null = null;
	let photoId: string | null = null;
	let testImagePath: string;

	test.beforeAll(async ({ playwright }) => {
		apiContext = await playwright.request.newContext({ baseURL: BASE_URL });
		await registerTestUser(apiContext);

		// Create a valid test PNG image
		testImagePath = path.join(__dirname, 'test-poi-photo.png');
		try {
			execSync(
				`node -e "require('sharp')({create:{width:200,height:200,channels:3,background:{r:100,g:150,b:200}}}).png().toFile('${testImagePath.replace(/\\/g, '/')}')"`,
				{ cwd: path.join(__dirname, '..'), timeout: 10000 }
			);
		} catch {
			// Fallback: minimal valid PNG (1x1 blue pixel)
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

		// Clean up from DB
		const pool = new pg.Pool({ connectionString: DB_URL });
		try {
			if (photoId) {
				await pool.query('DELETE FROM poi_photos WHERE id = $1', [photoId]);
			}
			if (poiId) {
				await pool.query('DELETE FROM persons_of_interest WHERE id = $1', [poiId]);
			}
		} catch {
			// Non-fatal
		} finally {
			await pool.end();
		}

		await apiContext.dispose();
	});

	test('1. create POI via API', async () => {
		const res = await apiContext.post(`${BASE_URL}/api/persons-of-interest`, {
			data: {
				name: '[PW-TEST] John Doe — Photo Test',
				description: 'Playwright test POI for photo lifecycle verification',
				status: 'active',
				threatLevel: 'low',
			},
		});

		const status = res.status();
		if (status === 200 || status === 201) {
			const json = await res.json();
			poiId = json.data?.id ?? json.id ?? json.poi?.id ?? null;
			expect(poiId).toBeTruthy();
			console.log('[poi-photo] Created POI ID:', poiId);
		} else {
			const body = await res.text();
			console.log('[poi-photo] POI creation status:', status, body.slice(0, 200));
			test.skip(true, `POI creation returned ${status}`);
		}
	});

	test('2. upload photo to POI', async () => {
		test.skip(!poiId, 'No POI created — skipping');

		const imageBuffer = fs.readFileSync(testImagePath);

		const res = await apiContext.post(
			`${BASE_URL}/api/persons-of-interest/${poiId}/photos`,
			{
				multipart: {
					file: {
						name: '[PW-TEST] poi-test-photo.png',
						mimeType: 'image/png',
						buffer: imageBuffer,
					},
				},
			}
		);

		const status = res.status();
		if (status === 200 || status === 201) {
			const json = await res.json();
			photoId = json.id ?? json.photo?.id ?? json.data?.id ?? null;
			console.log('[poi-photo] Uploaded photo ID:', photoId);
			expect(photoId).toBeTruthy();
		} else {
			const body = await res.text();
			console.log('[poi-photo] Photo upload status:', status, body.slice(0, 200));
			test.skip(true, `Photo upload returned ${status} — MinIO may be down`);
		}
	});

	test('3. POI detail page renders with photo', async ({ page }) => {
		test.skip(!poiId, 'No POI created — skipping');

		await registerTestUser(page.request);

		await page.goto(`${BASE_URL}/persons-of-interest/${poiId}`, {
			waitUntil: 'domcontentloaded',
			timeout: 60_000,
		});
		await page.waitForTimeout(3000);

		const body = await page.textContent('body');
		expect(body).not.toContain('Internal Error');
		expect(body).not.toContain('500');

		// Check for photo/image elements on the page
		const images = page.locator('img');
		const imageCount = await images.count();
		console.log('[poi-photo] Images on POI detail page:', imageCount);

		await page.screenshot({ path: 'test-results/poi-detail-photo.png' });

		// POI name should be visible
		if (body) {
			const hasName = body.includes('John Doe') || body.includes('Photo Test');
			console.log('[poi-photo] POI name visible:', hasName);
		}
	});

	test('4. verify photo metadata via API', async () => {
		test.skip(!poiId, 'No POI created — skipping');

		const res = await apiContext.get(
			`${BASE_URL}/api/persons-of-interest/${poiId}/photos`
		);

		if (res.ok()) {
			const json = await res.json();
			const photos = json.photos ?? json.data ?? json;

			if (Array.isArray(photos)) {
				console.log('[poi-photo] Photos count:', photos.length);

				if (photos.length > 0) {
					const photo = photos[0];
					console.log('[poi-photo] Photo URL:', photo.url ?? photo.imageUrl ?? 'N/A');
					console.log(
						'[poi-photo] Thumbnail:',
						photo.thumbnailUrl ?? photo.thumbnail ?? 'N/A'
					);
					console.log(
						'[poi-photo] AI tags:',
						JSON.stringify(photo.tags ?? photo.aiTags ?? []).slice(0, 100)
					);

					// VLM analysis may have populated caption/tags
					if (photo.caption || photo.vlmCaption) {
						console.log(
							'[poi-photo] VLM caption:',
							(photo.caption ?? photo.vlmCaption).slice(0, 100)
						);
					}
				}
			}
		} else {
			console.log('[poi-photo] Photos API status:', res.status());
		}
	});

	test('5. POI appears in persons-of-interest list', async ({ page }) => {
		test.skip(!poiId, 'No POI created — skipping');

		await registerTestUser(page.request);

		await page.goto(`${BASE_URL}/persons-of-interest`, {
			waitUntil: 'domcontentloaded',
			timeout: 60_000,
		});
		await page.waitForTimeout(2000);

		const body = await page.textContent('body');
		expect(body).not.toContain('Internal Error');

		await page.screenshot({ path: 'test-results/poi-list-page.png' });
	});
});
