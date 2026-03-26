#!/usr/bin/env node
/**
 * Test POI photo upload end-to-end
 * Verifies: file input → POST /api/persons-of-interest/[id]/photos → photo appears in grid
 */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
const SCREENSHOTS = path.join(__dirname, 'screenshots', 'cases-ui');

// Ensure screenshot dir
fs.mkdirSync(SCREENSHOTS, { recursive: true });

// Create a small valid PNG for testing (a 10x10 blue square)
function createTestPng() {
	// Minimal valid PNG (1x1 red pixel)
	const png = Buffer.from(
		'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFklEQVQYV2P8z8BQz0AEYBxV' +
		'OHIUAgBGWAkFdPLKQAAAAABJRU5ErkJggg==',
		'base64'
	);
	const tmpPath = path.join(__dirname, 'test-upload-image.png');
	fs.writeFileSync(tmpPath, png);
	return tmpPath;
}

async function main() {
	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	const results = [];

	try {
		// Step 1: Go to POI list, find a POI ID
		console.log('\n  Step 1: Finding a POI...');
		await page.goto(`${BASE}/persons-of-interest`, { waitUntil: 'networkidle', timeout: 30000 });
		const poiLinks = await page.evaluate(() => {
			const anchors = document.querySelectorAll('a[href*="/persons-of-interest/"]');
			return Array.from(anchors)
				.map(a => ({ href: a.getAttribute('href'), text: a.textContent?.trim() }))
				.filter(l => l.href && l.href.split('/').length > 2 && l.href !== '/persons-of-interest');
		});

		if (poiLinks.length === 0) {
			console.log('  No POIs found. Skipping upload test.');
			await browser.close();
			return;
		}

		const poiUrl = `${BASE}${poiLinks[0].href}`;
		console.log(`  Found: ${poiLinks[0].text} → ${poiLinks[0].href}`);

		// Step 2: Navigate to POI detail
		console.log('\n  Step 2: Loading POI detail page...');
		await page.goto(poiUrl, { waitUntil: 'networkidle', timeout: 30000 });
		await page.waitForTimeout(1000);

		// Step 3: Click Photos tab
		console.log('\n  Step 3: Clicking Photos tab...');
		const photosTab = page.locator('button:text("Photos")').first();
		if (await photosTab.isVisible()) {
			await photosTab.click();
			await page.waitForTimeout(500);
		} else {
			console.log('  Photos tab not visible!');
			results.push({ test: 'Photos tab visible', pass: false });
			return;
		}

		// Check initial state
		const beforeState = await page.evaluate(() => {
			const text = document.body.innerText;
			const match = text.match(/POI Photos \((\d+)\)/);
			return {
				photoCount: match ? parseInt(match[1]) : -1,
				hasNoPhotos: text.includes('No photos uploaded'),
				hasUploadBtn: !!document.querySelector('button') &&
					Array.from(document.querySelectorAll('button')).some(b => b.textContent?.includes('Upload Photo')),
				hasFileInput: !!document.querySelector('input[type="file"]'),
			};
		});
		console.log(`  Before upload: ${beforeState.photoCount} photos, upload btn: ${beforeState.hasUploadBtn}, file input: ${beforeState.hasFileInput}`);
		results.push({ test: 'Upload button exists', pass: beforeState.hasUploadBtn });
		results.push({ test: 'File input exists', pass: beforeState.hasFileInput });

		await page.screenshot({ path: path.join(SCREENSHOTS, 'poi-before-upload.png') });

		// Step 4: Upload a test image
		console.log('\n  Step 4: Uploading test image...');
		const testImagePath = createTestPng();
		console.log(`  Test image: ${testImagePath} (${fs.statSync(testImagePath).size} bytes)`);

		// Capture API response
		let uploadResponse = null;
		page.on('response', async (res) => {
			if (res.url().includes('/photos') && res.request().method() === 'POST') {
				try {
					uploadResponse = { status: res.status(), body: await res.json() };
				} catch {
					uploadResponse = { status: res.status(), body: null };
				}
			}
		});

		const fileInput = page.locator('input[type="file"]');
		await fileInput.setInputFiles(testImagePath);

		// Wait for upload to complete (API call + UI update)
		console.log('  Waiting for upload response...');
		await page.waitForTimeout(8000);

		// Step 5: Check results
		console.log('\n  Step 5: Checking results...');
		if (uploadResponse) {
			console.log(`  API response: ${uploadResponse.status}`);
			if (uploadResponse.body) {
				console.log(`  Response body keys: ${Object.keys(uploadResponse.body).join(', ')}`);
				if (uploadResponse.body.photo) {
					console.log(`  Photo ID: ${uploadResponse.body.photo.id}`);
					console.log(`  Photo URL: ${uploadResponse.body.photo.url}`);
				}
				if (uploadResponse.body.error) {
					console.log(`  Error: ${uploadResponse.body.error}`);
				}
			}
			results.push({ test: 'Upload API returns 201', pass: uploadResponse.status === 201 });
			results.push({ test: 'Upload API returns photo object', pass: !!uploadResponse.body?.photo });
		} else {
			console.log('  No API response captured (upload may not have fired)');
			results.push({ test: 'Upload API called', pass: false });
		}

		// Check UI after upload
		const afterState = await page.evaluate(() => {
			const text = document.body.innerText;
			const match = text.match(/POI Photos \((\d+)\)/);
			const imgs = document.querySelectorAll('img');
			const photoImgs = Array.from(imgs).filter(img => {
				const src = img.getAttribute('src') || '';
				return src.includes('minio') || src.includes('poi') || src.includes('photo');
			});
			const errorEls = Array.from(document.querySelectorAll('[class*="error"], [class*="Error"]'));
			const errorTexts = errorEls.map(e => e.textContent?.trim()).filter(Boolean);
			return {
				photoCount: match ? parseInt(match[1]) : -1,
				hasNoPhotos: text.includes('No photos uploaded'),
				imgCount: photoImgs.length,
				imgSrcs: photoImgs.map(i => i.getAttribute('src')?.slice(0, 80)),
				errors: errorTexts.slice(0, 3),
			};
		});
		console.log(`  After upload: ${afterState.photoCount} photos, ${afterState.imgCount} images in DOM`);
		if (afterState.imgSrcs.length > 0) console.log(`  Image sources: ${afterState.imgSrcs.join(', ')}`);
		if (afterState.errors.length > 0) console.log(`  Errors: ${afterState.errors.join('; ')}`);

		results.push({ test: 'Photo count incremented', pass: afterState.photoCount > beforeState.photoCount });
		results.push({ test: 'Photo image visible in DOM', pass: afterState.imgCount > 0 });
		results.push({ test: 'No error messages', pass: afterState.errors.length === 0 });

		await page.screenshot({ path: path.join(SCREENSHOTS, 'poi-after-upload.png') });

		// Cleanup test image
		fs.unlinkSync(testImagePath);

	} catch (err) {
		console.error('  Test error:', err.message);
		results.push({ test: 'No crash', pass: false, error: err.message });
	} finally {
		await browser.close();
	}

	// Report
	console.log('\n  ╔══════════════════════════════════════════════╗');
	console.log('  ║   POI Photo Upload Test Results               ║');
	console.log('  ╚══════════════════════════════════════════════╝\n');
	let passed = 0, failed = 0;
	for (const r of results) {
		const icon = r.pass ? '✓' : '✗';
		const color = r.pass ? '\x1b[32m' : '\x1b[31m';
		console.log(`  ${color}${icon}\x1b[0m ${r.test}${r.error ? ` — ${r.error}` : ''}`);
		if (r.pass) passed++; else failed++;
	}
	console.log(`\n  ${passed}/${passed + failed} passed`);
	console.log(`  Screenshots: ${SCREENSHOTS}`);
}

main().catch(console.error);
