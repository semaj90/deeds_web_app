#!/usr/bin/env node

/**
 * Screenshot Evidence Chunks UI
 *
 * Captures the expandable chunks interface from EvidenceUploadResults component
 * Demonstrates ARTICLE/SECTION/SUBSECTION chunk types with click-to-expand functionality
 */

import { chromium } from 'playwright';
import { seedEvidence } from './seed-evidence-with-chunks.mjs';

const BASE_URL = 'http://localhost:5173';
const SCREENSHOT_DIR = 'scripts/tests/screenshots/evidence-chunks';

async function screenshotChunksUI() {
	let browser;
	let evidenceId;

	try {
		console.log('🌱 Step 1: Seeding evidence with chunks...\n');
		evidenceId = await seedEvidence();
		console.log(`✅ Evidence created: ${evidenceId}\n`);

		console.log('🚀 Step 2: Launching browser...\n');
		browser = await chromium.launch({ headless: false });
		const context = await browser.newContext({
			viewport: { width: 1920, height: 1080 }
		});
		const page = await context.newPage();

		// Navigate to evidence page
		const evidenceUrl = `${BASE_URL}/evidence/${evidenceId}`;
		console.log(`📍 Navigating to: ${evidenceUrl}`);

		await page.goto(evidenceUrl);
		await page.waitForLoadState('networkidle');
		await page.waitForTimeout(2000); // Wait for any animations

		// Check if chunks are visible
		console.log('\n📸 Capturing screenshots...\n');

		// Screenshot 1: Collapsed chunks view
		console.log('1️⃣  Collapsed chunks view...');
		await page.screenshot({
			path: `${SCREENSHOT_DIR}/01-chunks-collapsed.png`,
			fullPage: true
		});
		console.log(`   ✅ Saved: ${SCREENSHOT_DIR}/01-chunks-collapsed.png`);

		// Find chunk expand buttons
		const chunkButtons = page.locator('button.chunk-expand-btn').or(
			page.locator('button:has-text("chevron")').or(page.locator('[aria-label*="Expand"]'))
		);

		const buttonCount = await chunkButtons.count();
		console.log(`   Found ${buttonCount} expandable chunks\n`);

		if (buttonCount > 0) {
			// Screenshot 2: First chunk expanded (ARTICLE)
			console.log('2️⃣  Expanding first chunk (should be ARTICLE)...');
			await chunkButtons.first().click();
			await page.waitForTimeout(500); // Wait for expand animation

			await page.screenshot({
				path: `${SCREENSHOT_DIR}/02-first-chunk-expanded.png`,
				fullPage: true
			});
			console.log(`   ✅ Saved: ${SCREENSHOT_DIR}/02-first-chunk-expanded.png`);

			// Screenshot 3: Multiple chunks expanded
			if (buttonCount >= 3) {
				console.log('\n3️⃣  Expanding third chunk (should be SECTION)...');
				await chunkButtons.nth(2).click();
				await page.waitForTimeout(500);

				await page.screenshot({
					path: `${SCREENSHOT_DIR}/03-multiple-chunks-expanded.png`,
					fullPage: true
				});
				console.log(`   ✅ Saved: ${SCREENSHOT_DIR}/03-multiple-chunks-expanded.png`);
			}

			// Screenshot 4: Scroll to show chunk types
			console.log('\n4️⃣  Scrolling to show different chunk types...');
			await page.evaluate(() => window.scrollBy(0, 400));
			await page.waitForTimeout(300);

			await page.screenshot({
				path: `${SCREENSHOT_DIR}/04-chunk-types-visible.png`,
				fullPage: false
			});
			console.log(`   ✅ Saved: ${SCREENSHOT_DIR}/04-chunk-types-visible.png`);

			// Screenshot 5: Hover state on expand button
			console.log('\n5️⃣  Capturing hover state on expand button...');
			await page.evaluate(() => window.scrollTo(0, 0));
			await page.waitForTimeout(300);

			if (buttonCount > 4) {
				await chunkButtons.nth(4).hover();
				await page.waitForTimeout(300);

				await page.screenshot({
					path: `${SCREENSHOT_DIR}/05-hover-state.png`,
					fullPage: false
				});
				console.log(`   ✅ Saved: ${SCREENSHOT_DIR}/05-hover-state.png`);
			}

			// Screenshot 6: All chunks expanded
			console.log('\n6️⃣  Expanding all remaining chunks...');
			for (let i = 1; i < Math.min(buttonCount, 8); i++) {
				const button = chunkButtons.nth(i);
				const isExpanded = await button.getAttribute('aria-label');
				if (!isExpanded?.includes('Collapse')) {
					await button.click();
					await page.waitForTimeout(200);
				}
			}

			await page.evaluate(() => window.scrollTo(0, 0));
			await page.waitForTimeout(500);

			await page.screenshot({
				path: `${SCREENSHOT_DIR}/06-all-chunks-expanded.png`,
				fullPage: true
			});
			console.log(`   ✅ Saved: ${SCREENSHOT_DIR}/06-all-chunks-expanded.png`);
		} else {
			console.log('⚠️  No expandable chunks found - evidence may not be rendering chunks');
			console.log('   Check if EvidenceUploadResults component is being used on this page');
		}

		// Take final full page screenshot
		console.log('\n7️⃣  Final full page screenshot...');
		await page.screenshot({
			path: `${SCREENSHOT_DIR}/07-full-page.png`,
			fullPage: true
		});
		console.log(`   ✅ Saved: ${SCREENSHOT_DIR}/07-full-page.png\n`);

		// Check for chunk type badges
		console.log('🏷️  Checking chunk type badges...');
		const articleBadges = await page.locator('text=/ARTICLE/i').count();
		const sectionBadges = await page.locator('text=/SECTION/i').count();
		const subsectionBadges = await page.locator('text=/SUBSECTION/i').count();

		console.log(`   ARTICLE badges: ${articleBadges}`);
		console.log(`   SECTION badges: ${sectionBadges}`);
		console.log(`   SUBSECTION badges: ${subsectionBadges}\n`);

		console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
		console.log('✅ Screenshot Capture Complete!');
		console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
		console.log(`\n📁 Screenshots saved to: ${SCREENSHOT_DIR}/`);
		console.log(`📊 Total screenshots: 7`);
		console.log(`🆔 Evidence ID: ${evidenceId}`);
		console.log(`🔗 Evidence URL: ${evidenceUrl}\n`);

		console.log('📋 Screenshot List:');
		console.log('   01-chunks-collapsed.png          - All chunks collapsed');
		console.log('   02-first-chunk-expanded.png      - First ARTICLE chunk expanded');
		console.log('   03-multiple-chunks-expanded.png  - Multiple chunks expanded');
		console.log('   04-chunk-types-visible.png       - Scrolled view showing chunk types');
		console.log('   05-hover-state.png               - Hover state on expand button');
		console.log('   06-all-chunks-expanded.png       - All chunks expanded');
		console.log('   07-full-page.png                 - Final full page view\n');

		console.log('🎯 Next Steps:');
		console.log('   - Review screenshots to verify expandable chunks UI');
		console.log('   - Check chunk type color coding (ARTICLE=cyan, SECTION=orange, SUBSECTION=purple)');
		console.log('   - Verify expand/collapse animation');
		console.log(`   - View live: ${evidenceUrl}\n`);
	} catch (error) {
		console.error('\n❌ Error capturing screenshots:', error);
		throw error;
	} finally {
		if (browser) {
			await browser.close();
		}
	}
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
	screenshotChunksUI()
		.then(() => {
			console.log('✅ Complete!');
			process.exit(0);
		})
		.catch((error) => {
			console.error('Fatal error:', error);
			process.exit(1);
		});
}

export { screenshotChunksUI };
