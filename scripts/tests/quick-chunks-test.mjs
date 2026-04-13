#!/usr/bin/env node

import { chromium } from 'playwright';

const EVIDENCE_URL = 'http://localhost:5173/evidence/26c42a93-1a4f-47b2-b439-ea6e3e9d72e0';

async function testChunksUI() {
	const browser = await chromium.launch({ headless: false, slowMo: 500 });
	const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
	const page = await context.newPage();

	try {
		console.log('🌐 Loading evidence page...');
		console.log(`   URL: ${EVIDENCE_URL}\n`);

		await page.goto(EVIDENCE_URL);
		await page.waitForLoadState('networkidle');
		await page.waitForTimeout(2000);

		// Check what's on the page
		console.log('📋 Page analysis:');

		// Check for chunks
		const chunksText = await page.textContent('body');
		const hasChunks = chunksText?.includes('chunks') || chunksText?.includes('ARTICLE');
		console.log(`   Chunks mentioned: ${hasChunks ? '✅' : '❌'}`);

		// Look for EvidenceUploadResults component indicators
		const uploadResults = await page.locator('text=/chunks/i').count();
		console.log(`   "chunks" text found: ${uploadResults} times`);

		// Look for expandable buttons
		const expandButtons = await page.locator('button').count();
		console.log(`   Buttons found: ${expandButtons}`);

		// Check for chunk type badges
		const articleBadges = await page.locator('text=/ARTICLE/i').count();
		const sectionBadges = await page.locator('text=/SECTION/i').count();
		const subsectionBadges = await page.locator('text=/SUBSECTION/i').count();

		console.log(`\n🏷️  Chunk type badges:`);
		console.log(`   ARTICLE: ${articleBadges}`);
		console.log(`   SECTION: ${sectionBadges}`);
		console.log(`   SUBSECTION: ${subsectionBadges}`);

		// Take initial screenshot
		console.log(`\n📸 Taking screenshots...\n`);

		await page.screenshot({
			path: 'scripts/tests/screenshots/evidence-chunks/quick-test-01-initial.png',
			fullPage: true
		});
		console.log('   ✅ 01-initial.png');

		// Look for any expandable elements
		const chevronButtons = await page.locator('[aria-label*="Expand"], [aria-label*="xpand"]').count();
		console.log(`\n🔍 Expandable elements: ${chevronButtons}`);

		if (chevronButtons > 0) {
			console.log('   Found expandable chunks! Clicking first one...');
			await page.locator('[aria-label*="Expand"]').first().click();
			await page.waitForTimeout(500);

			await page.screenshot({
				path: 'scripts/tests/screenshots/evidence-chunks/quick-test-02-expanded.png',
				fullPage: true
			});
			console.log('   ✅ 02-expanded.png');
		}

		// Check page title
		const title = await page.title();
		console.log(`\n📄 Page title: ${title}`);

		// Get page HTML to see what components are rendered
		const mainContent = await page.locator('main').textContent().catch(() => 'No main element');
		const hasEvidenceTitle = mainContent?.includes('Service Agreement');
		console.log(`   Evidence title visible: ${hasEvidenceTitle ? '✅' : '❌'}`);

		console.log('\n✅ Test complete! Check screenshots in scripts/tests/screenshots/evidence-chunks/\n');

		// Keep browser open for 10 seconds so user can inspect
		console.log('🔍 Browser will stay open for 10 seconds for manual inspection...');
		await page.waitForTimeout(10000);
	} catch (error) {
		console.error('❌ Error:', error.message);
		await page.screenshot({
			path: 'scripts/tests/screenshots/evidence-chunks/quick-test-error.png',
			fullPage: true
		});
	} finally {
		await browser.close();
		console.log('🏁 Browser closed');
	}
}

testChunksUI();
