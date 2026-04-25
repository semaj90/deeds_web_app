#!/usr/bin/env node
/**
 * Phase 89: Codebase Viewer Screenshot Capture
 *
 * Manual screenshot script that handles authentication
 * and captures all views of the codebase viewer UI.
 */

import { chromium } from '@playwright/test';
import { mkdir } from 'fs/promises';
import { join } from 'path';

const SCREENSHOTS_DIR = 'reports/screenshots';
const BASE_URL = 'http://localhost:5175';

async function captureScreenshots() {
	console.log('🎬 Phase 89: Codebase Viewer Screenshot Capture');
	console.log('═'.repeat(60));

	// Ensure screenshots directory exists
	await mkdir(SCREENSHOTS_DIR, { recursive: true });
	console.log(`✅ Screenshots directory: ${SCREENSHOTS_DIR}\n`);

	// Launch browser
	const browser = await chromium.launch({
		headless: true,
		args: ['--no-sandbox', '--disable-setuid-sandbox']
	});
	const context = await browser.newContext({
		viewport: { width: 1920, height: 1080 },
		ignoreHTTPSErrors: true
	});
	const page = await context.newPage();

	try {
		console.log('1️⃣ Navigating to codebase viewer...');
		console.log(`   URL: ${BASE_URL}/admin/codebase-viewer`);

		await page.goto(`${BASE_URL}/admin/codebase-viewer`, {
			waitUntil: 'networkidle',
			timeout: 30000
		});

		const currentUrl = page.url();
		console.log(`   Current URL: ${currentUrl}`);

		// Check if we got redirected to login
		if (currentUrl.includes('/login')) {
			console.log('❌ Redirected to login - DEV_BYPASS_AUTH may not be set');
			console.log('   Please ensure dev server started with: DEV_BYPASS_AUTH=true npm run dev');
			throw new Error('Authentication required');
		}

		// Wait for page to fully load with better error handling
		console.log('2️⃣ Waiting for page to load...');
		try {
			await page.waitForSelector('.codebase-viewer', { timeout: 15000 });
			await page.waitForTimeout(2000); // Give time for data to load
			console.log('✅ Page loaded\n');
		} catch (err) {
			console.log('⚠️  Page structure different than expected, attempting screenshots anyway...\n');
		}

		// Capture full page view
		console.log('3️⃣ Capturing full page screenshot...');
		await page.screenshot({
			path: join(SCREENSHOTS_DIR, 'codebase-viewer-full.png'),
			fullPage: true
		});
		console.log('✅ Saved: codebase-viewer-full.png\n');

		// Capture Qdrant Collections tab (already the default view)
		console.log('4️⃣ Capturing Qdrant Collections view...');
		try {
			await page.locator('button:has-text("🔢 Qdrant Collections")').click({ timeout: 5000 });
			await page.waitForTimeout(1500);
		} catch (err) {
			console.log('   (Already on Qdrant tab or button not found, continuing...)');
		}
		await page.screenshot({
			path: join(SCREENSHOTS_DIR, 'codebase-viewer-qdrant.png'),
			fullPage: true
		});
		console.log('✅ Saved: codebase-viewer-qdrant.png\n');

		// Capture PostgreSQL Embeddings tab
		console.log('5️⃣ Capturing PostgreSQL Embeddings view...');
		try {
			await page.locator('button:has-text("🗃️ PostgreSQL Embeddings")').click({ timeout: 5000 });
			await page.waitForTimeout(1500);
		} catch (err) {
			console.log('   ⚠️ Could not click PostgreSQL tab, skipping...');
		}
		await page.screenshot({
			path: join(SCREENSHOTS_DIR, 'codebase-viewer-postgres.png'),
			fullPage: true
		});
		console.log('✅ Saved: codebase-viewer-postgres.png\n');

		// Capture search functionality
		console.log('6️⃣ Capturing search view...');
		try {
			const searchInput = page.locator('input[type="search"], .search-input').first();
			await searchInput.fill('accessibility', { timeout: 5000 });
			await page.waitForTimeout(1000);
		} catch (err) {
			console.log('   ⚠️ Search input not found, skipping search test...');
		}
		await page.screenshot({
			path: join(SCREENSHOTS_DIR, 'codebase-viewer-search.png'),
			fullPage: true
		});
		console.log('✅ Saved: codebase-viewer-search.png\n');

		// Capture Timeline tab
		console.log('7️⃣ Capturing File Timeline view...');
		try {
			await page.locator('button:has-text("📅 File Timeline")').click({ timeout: 5000 });
			await page.waitForTimeout(1500);
		} catch (err) {
			console.log('   ⚠️ Could not click Timeline tab, skipping...');
		}
		await page.screenshot({
			path: join(SCREENSHOTS_DIR, 'codebase-viewer-timeline.png'),
			fullPage: true
		});
		console.log('✅ Saved: codebase-viewer-timeline.png\n');

		console.log('═'.repeat(60));
		console.log('✅ All screenshots captured successfully!');
		console.log(`📁 Location: ${SCREENSHOTS_DIR}/`);
		console.log('\nScreenshots:');
		console.log('  • codebase-viewer-full.png (Full page)');
		console.log('  • codebase-viewer-qdrant.png (Qdrant Collections)');
		console.log('  • codebase-viewer-postgres.png (PostgreSQL Embeddings)');
		console.log('  • codebase-viewer-search.png (Search functionality)');
		console.log('  • codebase-viewer-timeline.png (File Timeline)');

	} catch (error) {
		console.error('❌ Error capturing screenshots:', error.message);
		console.error('   Stack:', error.stack);

		// Try to capture error screenshot
		try {
			await page.screenshot({
				path: join(SCREENSHOTS_DIR, 'error-screenshot.png'),
				fullPage: true
			});
			console.log('📸 Error screenshot saved: error-screenshot.png');
		} catch (screenshotError) {
			console.error('   Could not capture error screenshot');
		}

		throw error;
	} finally {
		console.log('\n⏳ Closing browser...');
		await browser.close();
		console.log('✅ Browser closed');
	}
}

// Run the screenshot capture
captureScreenshots().catch(error => {
	console.error('Fatal error:', error);
	process.exit(1);
});
