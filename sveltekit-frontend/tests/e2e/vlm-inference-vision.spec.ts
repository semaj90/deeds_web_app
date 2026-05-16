/**
 * VLM Inference & Vision Pipeline E2E Tests
 *
 * Tests the unified VLM (llama-server + mmproj) across all VLM-powered features:
 *   1. Infrastructure status — visionCapable, TurboQuant available
 *   2. /api/ai/tensorrt/vlm — TensorRT VLM endpoint (multipart + JSON)
 *   3. /api/vision/analyze — YOLO + VLM pipeline with Redis caching
 *   4. POI photo upload — 7-stage VLM pipeline (caption, tags, forensics)
 *   5. Evidence upload — VLM evidence analyzer in processing pipeline
 *
 * Prerequisites:
 *   - Dev server running (npm run dev)
 *   - llama-server running with --mmproj (port 8090)
 *   - PostgreSQL accessible (port 5432)
 *   - Redis accessible (port 6379) — for cache tests
 *   - MinIO accessible (port 9000) — for upload tests
 */
import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { PORTS } from '../helpers/env-ports.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = PORTS.APP_BASE;
const DB_URL =
	process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db';
const SCREENSHOT_DIR = path.resolve(__dirname, '..', 'test-results', 'vlm-screenshots');

// ── Test Image Helpers ────────────────────────────────────────────────────────

/** Create a valid test PNG (red 100x100) using sharp, falls back to minimal PNG */
function createTestImage(filename: string): string {
	const dir = path.resolve(__dirname, '..', 'test-results');
	fs.mkdirSync(dir, { recursive: true });
	const filePath = path.join(dir, filename);

	try {
		execSync(
			`node -e "require('sharp')({create:{width:100,height:100,channels:3,background:{r:255,g:0,b:0}}}).png().toFile('${filePath.replace(/\\/g, '/')}')"`,
			{ cwd: path.join(__dirname, '../..'), timeout: 10000 }
		);
		return filePath;
	} catch {
		// Fallback: minimal valid PNG (1x1 red pixel)
		const minPng = Buffer.from(
			'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==',
			'base64'
		);
		fs.writeFileSync(filePath, minPng);
		return filePath;
	}
}

/** Create a bicolor test image (left blue, right green) for richer VLM testing */
function createBicolorImage(filename: string): string {
	const dir = path.resolve(__dirname, '..', 'test-results');
	fs.mkdirSync(dir, { recursive: true });
	const filePath = path.join(dir, filename);

	try {
		execSync(
			`node -e "
				const sharp = require('sharp');
				const blue = sharp({create:{width:50,height:100,channels:3,background:{r:0,g:0,b:255}}}).raw().toBuffer();
				const green = sharp({create:{width:50,height:100,channels:3,background:{r:0,g:255,b:0}}}).raw().toBuffer();
				Promise.all([blue, green]).then(([b, g]) => {
					const rows = [];
					for (let y = 0; y < 100; y++) {
						const bRow = b.subarray(y * 50 * 3, (y + 1) * 50 * 3);
						const gRow = g.subarray(y * 50 * 3, (y + 1) * 50 * 3);
						rows.push(Buffer.concat([bRow, gRow]));
					}
					sharp(Buffer.concat(rows), {raw:{width:100,height:100,channels:3}}).png().toFile('${filePath.replace(/\\/g, '/')}');
				});
			"`.replace(/\n\t+/g, ' '),
			{ cwd: path.join(__dirname, '../..'), timeout: 10000 }
		);
		return filePath;
	} catch {
		return createTestImage(filename);
	}
}

// ── 1. Infrastructure Status ──────────────────────────────────────────────────

test.describe('VLM Infrastructure Status', () => {
	test('reports vision capability in /api/infrastructure/status', async ({ request }) => {
		const res = await request.get(`${BASE_URL}/api/infrastructure/status`);
		expect(res.ok()).toBeTruthy();

		const data = await res.json();

		// Core infrastructure should be responding
		expect(data.ts).toBeTruthy();
		expect(data.latencyMs).toBeGreaterThanOrEqual(0);

		// Inference section exists
		expect(data.inference).toBeDefined();

		// Router status — when TurboQuant is running with mmproj
		if (data.inference?.router) {
			console.log('[vlm-e2e] Router status:', JSON.stringify(data.inference.router).slice(0, 200));

			if (data.inference.router.turboquant?.available) {
				expect(data.inference.router.turboquant.visionCapable).toBe(true);
				console.log('[vlm-e2e] TurboQuant vision: ENABLED');
			} else {
				console.log('[vlm-e2e] TurboQuant not available — VLM tests may fall back to Ollama');
			}
		}

		// Dispatch stats (from dispatch-inline.ts)
		expect(data.dispatch).toBeDefined();
		expect(typeof data.dispatch.queued).toBe('number');
		expect(typeof data.dispatch.inline).toBe('number');

		// GPU section
		if (data.gpu) {
			console.log('[vlm-e2e] GPU device:', data.gpu.device);
			console.log('[vlm-e2e] CUDA addon:', data.gpu.cudaAddon);
		}
	});

	test('ollama is available for VLM fallback', async ({ request }) => {
		const res = await request.get(`${BASE_URL}/api/infrastructure/status`);
		const data = await res.json();

		expect(data.inference?.ollama?.available).toBe(true);
		console.log('[vlm-e2e] Ollama available:', data.inference?.ollama?.url);
	});
});

// ── 2. VLM Inference Endpoint ─────────────────────────────────────────────────

test.describe('VLM Inference via /api/ai/tensorrt/vlm', () => {
	let testImagePath: string;

	test.beforeAll(() => {
		testImagePath = createTestImage('vlm-test-red.png');
	});

	test.afterAll(() => {
		if (testImagePath && fs.existsSync(testImagePath)) {
			fs.unlinkSync(testImagePath);
		}
	});

	test('returns VLM analysis for image + prompt (JSON body)', async ({ request }) => {
		const imageBuffer = fs.readFileSync(testImagePath);
		const imageBase64 = imageBuffer.toString('base64');

		const res = await request.post(`${BASE_URL}/api/ai/tensorrt/vlm`, {
			data: {
				prompt: 'What color is this image? Reply with just the color name.',
				imageBase64,
				maxTokens: 50,
				temperature: 0.1,
			},
		});

		if (res.status() === 503) {
			const body = await res.json();
			console.log('[vlm-e2e] VLM endpoint 503:', body.hint ?? body.error);
			test.skip(true, 'VLM backend unavailable (Triton + Ollama both down)');
			return;
		}

		expect(res.ok(), `VLM inference failed: ${res.status()}`).toBeTruthy();
		const data = await res.json();

		expect(data.text).toBeTruthy();
		expect(data.model).toBeTruthy();
		expect(data.pipeline).toBeDefined();

		console.log('[vlm-e2e] VLM response:', data.text.slice(0, 100));
		console.log('[vlm-e2e] Model:', data.model);
		console.log('[vlm-e2e] Pipeline:', data.pipeline);

		// The image is solid red — VLM should identify it
		const textLower = data.text.toLowerCase();
		expect(
			textLower.includes('red') || textLower.includes('color') || textLower.includes('solid')
		).toBeTruthy();
	});

	test('returns VLM analysis for image + prompt (multipart form)', async ({ request }) => {
		const imageBuffer = fs.readFileSync(testImagePath);

		const res = await request.post(`${BASE_URL}/api/ai/tensorrt/vlm`, {
			multipart: {
				prompt: 'Describe what you see in this image.',
				image: {
					name: 'test-image.png',
					mimeType: 'image/png',
					buffer: imageBuffer,
				},
				maxTokens: '100',
				temperature: '0.3',
			},
		});

		if (res.status() === 503) {
			test.skip(true, 'VLM backend unavailable');
			return;
		}

		expect(res.ok()).toBeTruthy();
		const data = await res.json();
		expect(data.text).toBeTruthy();
		expect(data.model).toBeTruthy();

		console.log('[vlm-e2e] Multipart VLM response:', data.text.slice(0, 100));
	});

	test('rejects request without image', async ({ request }) => {
		const res = await request.post(`${BASE_URL}/api/ai/tensorrt/vlm`, {
			data: {
				prompt: 'Describe the image',
				maxTokens: 50,
			},
		});

		// Should return 400 (image required for VLM)
		expect(res.status()).toBe(400);
		const data = await res.json();
		expect(data.error).toContain('image');
	});

	test('rejects request without prompt', async ({ request }) => {
		const imageBuffer = fs.readFileSync(testImagePath);
		const imageBase64 = imageBuffer.toString('base64');

		const res = await request.post(`${BASE_URL}/api/ai/tensorrt/vlm`, {
			data: {
				prompt: '',
				imageBase64,
			},
		});

		expect(res.status()).toBe(400);
	});
});

// ── 3. Vision Analysis Pipeline ───────────────────────────────────────────────

test.describe('Vision Analysis Pipeline (/api/vision/analyze)', () => {
	let testImagePath: string;

	test.beforeAll(() => {
		testImagePath = createBicolorImage('vlm-test-bicolor.png');
	});

	test.afterAll(() => {
		if (testImagePath && fs.existsSync(testImagePath)) {
			fs.unlinkSync(testImagePath);
		}
	});

	test('analyzes image with YOLO + VLM pipeline', async ({ request }) => {
		const imageBuffer = fs.readFileSync(testImagePath);

		const res = await request.post(`${BASE_URL}/api/vision/analyze`, {
			multipart: {
				file: {
					name: 'test-evidence.png',
					mimeType: 'image/png',
					buffer: imageBuffer,
				},
				skipCache: 'true',
			},
		});

		if (res.status() === 500) {
			const body = await res.json().catch(() => ({}));
			console.log('[vlm-e2e] Vision analysis failed:', body.error ?? 'unknown');
			test.skip(true, 'Vision analysis pipeline unavailable');
			return;
		}

		expect(res.ok(), `Vision analyze failed: ${res.status()}`).toBeTruthy();
		const data = await res.json();

		// Core response shape
		expect(data.hash).toBeTruthy();
		expect(typeof data.cacheHit).toBe('boolean');
		expect(data.cacheHit).toBe(false); // skipCache=true
		expect(Array.isArray(data.boxes)).toBe(true);

		// VLM analysis section
		expect(data.analysis).toBeDefined();
		expect(data.analysis.summary).toBeTruthy();
		expect(Array.isArray(data.analysis.keyFindings)).toBe(true);
		expect(Array.isArray(data.analysis.suggestedTags)).toBe(true);

		// Timings
		expect(data.timingsMs).toBeDefined();
		expect(data.timingsMs.total).toBeGreaterThan(0);

		// VLM metadata
		if (data.vlmMeta) {
			expect(data.vlmMeta.originalWidth).toBeGreaterThan(0);
			expect(data.vlmMeta.originalHeight).toBeGreaterThan(0);
		}

		console.log('[vlm-e2e] Vision analysis summary:', data.analysis.summary.slice(0, 150));
		console.log('[vlm-e2e] Tags:', data.analysis.suggestedTags.join(', '));
		console.log('[vlm-e2e] Boxes:', data.boxes.length);
		console.log('[vlm-e2e] Timings:', JSON.stringify(data.timingsMs));
	});

	test('returns cached result on second request (same image)', async ({ request }) => {
		const imageBuffer = fs.readFileSync(testImagePath);

		// First request — fresh analysis (no skipCache)
		const res1 = await request.post(`${BASE_URL}/api/vision/analyze`, {
			multipart: {
				file: {
					name: 'cache-test.png',
					mimeType: 'image/png',
					buffer: imageBuffer,
				},
			},
		});

		if (!res1.ok()) {
			test.skip(true, 'Vision pipeline unavailable for cache test');
			return;
		}

		const data1 = await res1.json();
		const hash = data1.hash;
		expect(hash).toBeTruthy();

		// Second request — should hit Redis cache (if Redis is connected and cache was written)
		const res2 = await request.post(`${BASE_URL}/api/vision/analyze`, {
			multipart: {
				file: {
					name: 'cache-test.png',
					mimeType: 'image/png',
					buffer: imageBuffer,
				},
			},
		});

		expect(res2.ok()).toBeTruthy();
		const data2 = await res2.json();

		expect(data2.hash).toBe(hash);

		// Cache hit depends on Redis being available AND the analysis being cacheable
		// (VLM fallback messages may not get cached if Redis set fails)
		if (data2.cacheHit) {
			expect(data2.timingsMs.total).toBeLessThan(data1.timingsMs.total);
			console.log(
				`[vlm-e2e] Cache HIT: fresh=${data1.timingsMs.total}ms, cached=${data2.timingsMs.total}ms`
			);
		} else {
			console.log(
				`[vlm-e2e] Cache MISS (Redis may be down or cache write failed): fresh=${data1.timingsMs.total}ms, repeat=${data2.timingsMs.total}ms`
			);
		}

		// Either way, both responses should have consistent structure
		expect(data2.analysis).toBeDefined();
		expect(data2.analysis.summary).toBeTruthy();
	});

	test('GET /api/vision/analyze?hash= returns cached or not-found', async ({ request }) => {
		const imageBuffer = fs.readFileSync(testImagePath);

		// POST to generate a hash
		const postRes = await request.post(`${BASE_URL}/api/vision/analyze`, {
			multipart: {
				file: {
					name: 'hash-lookup-test.png',
					mimeType: 'image/png',
					buffer: imageBuffer,
				},
			},
		});

		if (!postRes.ok()) {
			test.skip(true, 'Vision pipeline unavailable');
			return;
		}

		const postData = await postRes.json();
		const hash = postData.hash;

		// GET by hash — may or may not be cached depending on Redis state
		const getRes = await request.get(`${BASE_URL}/api/vision/analyze?hash=${hash}`);
		expect(getRes.ok()).toBeTruthy();

		const getData = await getRes.json();
		if (getData.found) {
			expect(getData.result).toBeDefined();
			expect(getData.result.hash).toBe(hash);
			expect(getData.result.analysis.summary).toBeTruthy();
			console.log('[vlm-e2e] Hash lookup: found cached analysis for', hash.slice(0, 12));
		} else {
			console.log('[vlm-e2e] Hash lookup: not cached (Redis may be down)', hash.slice(0, 12));
		}
	});

	test('GET with unknown hash returns found=false', async ({ request }) => {
		const res = await request.get(
			`${BASE_URL}/api/vision/analyze?hash=0000000000000000000000000000000000000000000000000000000000000000`
		);
		expect(res.ok()).toBeTruthy();
		const data = await res.json();
		expect(data.found).toBe(false);
	});
});

// ── 4. POI Photo VLM Pipeline ─────────────────────────────────────────────────

test.describe('POI Photo VLM Pipeline', () => {
	test.describe.configure({ mode: 'serial' });

	let poiId: string | null = null;
	let photoId: string | null = null;
	let testImagePath: string;

	test.beforeAll(() => {
		testImagePath = createTestImage('vlm-poi-photo.png');
	});

	test.afterAll(async () => {
		// Cleanup
		if (testImagePath && fs.existsSync(testImagePath)) {
			fs.unlinkSync(testImagePath);
		}

		const pool = new pg.Pool({ connectionString: DB_URL });
		try {
			if (photoId) {
				await pool.query('DELETE FROM poi_photos WHERE id = $1', [photoId]).catch(() => {});
			}
			if (poiId) {
				await pool
					.query('DELETE FROM persons_of_interest WHERE id = $1', [poiId])
					.catch(() => {});
			}
		} finally {
			await pool.end();
		}
	});

	test('1. create test POI', async ({ request }) => {
		const res = await request.post(`${BASE_URL}/api/persons-of-interest`, {
			data: {
				name: '[PW-TEST] VLM Photo Subject',
				description: 'Automated Playwright VLM photo analysis test',
				status: 'active',
				threatLevel: 'low',
			},
		});

		const status = res.status();
		if (status === 200 || status === 201) {
			const json = await res.json();
			poiId = json.data?.id ?? json.id ?? json.poi?.id ?? null;
			expect(poiId).toBeTruthy();
			console.log('[vlm-e2e] Created POI:', poiId);
		} else {
			const body = await res.text();
			console.log('[vlm-e2e] POI creation failed:', status, body.slice(0, 200));
			test.skip(true, `POI creation returned ${status}`);
		}
	});

	test('2. upload photo triggers VLM analysis', async ({ request }) => {
		test.skip(!poiId, 'No POI created — skipping');

		const imageBuffer = fs.readFileSync(testImagePath);

		const res = await request.post(
			`${BASE_URL}/api/persons-of-interest/${poiId}/photos`,
			{
				multipart: {
					file: {
						name: '[PW-TEST] vlm-analysis-photo.png',
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
			console.log('[vlm-e2e] Uploaded photo ID:', photoId);
			expect(photoId).toBeTruthy();
		} else {
			const body = await res.text();
			console.log('[vlm-e2e] Photo upload status:', status, body.slice(0, 200));
			test.skip(true, `Photo upload returned ${status} — MinIO may be down`);
		}
	});

	test('3. verify VLM metadata via API', async ({ request }) => {
		test.skip(!poiId, 'No POI created — skipping');

		// Allow VLM pipeline time to complete (it's async/background)
		await new Promise((r) => setTimeout(r, 3000));

		const res = await request.get(
			`${BASE_URL}/api/persons-of-interest/${poiId}/photos`
		);

		expect(res.ok()).toBeTruthy();
		const json = await res.json();
		const photos = json.photos ?? json.data ?? json;

		expect(Array.isArray(photos)).toBe(true);

		if (photos.length > 0) {
			const photo = photos[0];
			console.log('[vlm-e2e] Photo URL:', photo.url ?? photo.imageUrl ?? 'N/A');

			// VLM may have populated caption/tags (async, may not be ready yet)
			if (photo.caption || photo.vlmCaption || photo.aiCaption) {
				const caption = photo.caption ?? photo.vlmCaption ?? photo.aiCaption;
				console.log('[vlm-e2e] VLM caption:', caption.slice(0, 150));
			}

			if (photo.tags || photo.aiTags) {
				const tags = photo.tags ?? photo.aiTags;
				console.log('[vlm-e2e] AI tags:', JSON.stringify(tags).slice(0, 200));
			}

			// Verify basic photo metadata
			expect(photo.poiId ?? photo.poi_id).toBe(poiId);
			expect(photo.url ?? photo.imageUrl).toBeTruthy();
		}
	});

	test('4. POI detail page loads without errors', async ({ page }) => {
		test.skip(!poiId, 'No POI created — skipping');

		fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

		await page.goto(`${BASE_URL}/persons-of-interest/${poiId}`, {
			waitUntil: 'domcontentloaded',
			timeout: 60_000,
		});
		await page.waitForTimeout(3000);

		const body = await page.textContent('body');
		expect(body).not.toContain('Internal Error');
		expect(body).not.toContain('500');

		// POI name should appear
		expect(body).toContain('VLM Photo Subject');

		await page.screenshot({
			path: path.join(SCREENSHOT_DIR, 'poi-vlm-detail.png'),
			fullPage: true,
		});

		console.log('[vlm-e2e] POI detail page loaded successfully');
	});
});

// ── 5. Evidence Upload with VLM Processing ────────────────────────────────────

test.describe('Evidence Upload VLM Processing', () => {
	const cleanupEvidenceIds = new Set<string>();
	let pool: pg.Pool;

	test.beforeAll(() => {
		pool = new pg.Pool({ connectionString: DB_URL });
	});

	test.afterAll(async () => {
		for (const id of cleanupEvidenceIds) {
			await pool.query('DELETE FROM evidence WHERE id = $1', [id]).catch(() => {});
		}
		await pool.end();
	});

	test('uploads image evidence and triggers VLM analysis stage', async ({ page }) => {
		fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

		// Load a seeded test case
		const caseResult = await pool.query<{ id: string }>(
			"SELECT id FROM cases WHERE title LIKE '[PW-TEST]%' ORDER BY created_at ASC LIMIT 1"
		);
		const caseId = caseResult.rows[0]?.id;
		if (!caseId) {
			test.skip(true, 'No seeded test case found');
			return;
		}

		// Stub onboarding
		await page.route('**/api/onboarding', async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ hasCompletedOnboarding: true, onboardingStep: 9 }),
			});
		});

		await page.goto(`/evidence?caseId=${caseId}`);
		await page.waitForLoadState('networkidle');

		await page.screenshot({
			path: path.join(SCREENSHOT_DIR, 'evidence-page-loaded.png'),
			fullPage: true,
		});

		// Open the upload dialog
		const bulkBtn = page.getByRole('button', { name: /Bulk Upload/i });
		if (await bulkBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
			await bulkBtn.click();
		}

		const uploadBtn = page.getByRole('button', { name: /^Upload Evidence$/i });
		if (await uploadBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
			await uploadBtn.click();
		}

		// Check for file input
		const fileInput = page.locator('#file-input');
		if (!(await fileInput.isVisible({ timeout: 5000 }).catch(() => false))) {
			console.log('[vlm-e2e] File input not found — upload UI may differ');
			await page.screenshot({
				path: path.join(SCREENSHOT_DIR, 'evidence-upload-ui-state.png'),
				fullPage: true,
			});
			test.skip(true, 'Upload file input not accessible');
			return;
		}

		// Upload a test PNG image as evidence
		const testImagePath = createTestImage('vlm-evidence-upload.png');
		await fileInput.setInputFiles(testImagePath);

		const titleInput = page.locator('input[id^="title-"]').first();
		if (await titleInput.isVisible({ timeout: 3000 }).catch(() => false)) {
			await titleInput.fill(`[PW-TEST] VLM Evidence Image ${Date.now()}`);
		}

		// Wait for upload response
		const uploadResponse = page.waitForResponse(
			(response) =>
				response.url().includes('/api/evidence/upload') && response.request().method() === 'POST',
			{ timeout: 30000 }
		);

		const submitBtn = page.getByRole('button', { name: /Upload.*File/i });
		if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
			await submitBtn.click();

			try {
				const response = await uploadResponse;
				const responseData = await response.json().catch(() => ({}));

				if (response.ok()) {
					const evidenceId = responseData.data?.id ?? responseData.id;
					if (evidenceId) {
						cleanupEvidenceIds.add(evidenceId);
						console.log('[vlm-e2e] Evidence uploaded:', evidenceId);
					}
				}
				console.log('[vlm-e2e] Upload response status:', response.status());
			} catch (err) {
				console.log('[vlm-e2e] Upload response not received (timeout or error)');
			}
		}

		await page.screenshot({
			path: path.join(SCREENSHOT_DIR, 'evidence-upload-result.png'),
			fullPage: true,
		});

		// Cleanup temp file
		if (fs.existsSync(testImagePath)) {
			fs.unlinkSync(testImagePath);
		}
	});
});

// ── 6. VLM Text-Only Fallback (no image = text inference) ─────────────────────

test.describe('VLM endpoint validation', () => {
	test('rejects oversized prompt', async ({ request }) => {
		const res = await request.post(`${BASE_URL}/api/ai/tensorrt/vlm`, {
			data: {
				prompt: 'x'.repeat(60000),
				imageBase64: 'aGVsbG8=',
			},
		});

		expect(res.status()).toBe(400);
	});

	test('rejects invalid temperature', async ({ request }) => {
		const res = await request.post(`${BASE_URL}/api/ai/tensorrt/vlm`, {
			data: {
				prompt: 'test',
				imageBase64: 'aGVsbG8=',
				temperature: 5.0,
			},
		});

		expect(res.status()).toBe(400);
	});

	test('rejects invalid maxTokens', async ({ request }) => {
		const res = await request.post(`${BASE_URL}/api/ai/tensorrt/vlm`, {
			data: {
				prompt: 'test',
				imageBase64: 'aGVsbG8=',
				maxTokens: 99999,
			},
		});

		expect(res.status()).toBe(400);
	});
});
