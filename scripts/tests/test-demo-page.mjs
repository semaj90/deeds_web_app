#!/usr/bin/env node

import { chromium } from 'playwright';

const DEMO_URL = 'http://localhost:5173/demos/chunks-ui';

async function testDemoPage() {
	const browser = await chromium.launch({ headless: false, slowMo: 200 });
	const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
	const page = await context.newPage();

	try {
		console.log('🎯 Testing Chunks UI Demo Page...');
		console.log(`   URL: ${DEMO_URL}\n`);

		await page.goto(DEMO_URL);
		await page.waitForLoadState('networkidle');
		await page.waitForTimeout(2000);

		const title = await page.title();
		console.log(`📄 Page title: ${title}\n`);

		// Check for chunk elements
		const articleBadges = await page.locator('text=/ARTICLE/i').count();
		const sectionBadges = await page.locator('text=/SECTION/i').count();
		const subsectionBadges = await page.locator('text=/SUBSECTION/i').count();

		console.log('🏷️  Chunk type badges:');
		console.log(`   ARTICLE: ${articleBadges} ${articleBadges === 3 ? '✅' : '❌'}`);
		console.log(`   SECTION: ${sectionBadges} ${sectionBadges === 3 ? '✅' : '❌'}`);
		console.log(`   SUBSECTION: ${subsectionBadges} ${subsectionBadges === 2 ? '✅' : '❌'}`);

		// Check for expandable buttons
		const expandButtons = await page.locator('button[aria-label*="Expand"], button[aria-label*="xpand"]').count();
		console.log(`\n🎯 Expand buttons: ${expandButtons} ${expandButtons === 8 ? '✅' : '❌'}`);

		if (expandButtons > 0) {
			console.log('\n🎉 CHUNKS UI SUCCESSFULLY RENDERED!');

			// Take screenshot of collapsed state
			await page.screenshot({
				path: 'scripts/tests/screenshots/evidence-chunks/demo-01-collapsed.png',
				fullPage: true
			});
			console.log('📸 01-collapsed.png saved');

			// Expand first chunk (ARTICLE)
			console.log('\n👆 Expanding first chunk (ARTICLE)...');
			await page.locator('button[aria-label*="Expand"]').first().click();
			await page.waitForTimeout(500);

			await page.screenshot({
				path: 'scripts/tests/screenshots/evidence-chunks/demo-02-first-expanded.png',
				fullPage: true
			});
			console.log('📸 02-first-expanded.png saved');

			// Expand third chunk (SECTION)
			console.log('\n👆 Expanding third chunk (SECTION)...');
			await page.locator('button[aria-label*="Expand"]').nth(2).click();
			await page.waitForTimeout(500);

			await page.screenshot({
				path: 'scripts/tests/screenshots/evidence-chunks/demo-03-multiple-expanded.png',
				fullPage: true
			});
			console.log('📸 03-multiple-expanded.png saved');

			// Expand fifth chunk (ARTICLE IV)
			console.log('\n👆 Expanding fifth chunk (ARTICLE IV)...');
			await page.locator('button[aria-label*="Expand"]').nth(4).click();
			await page.waitForTimeout(500);

			// Collapse first chunk to show toggle
			console.log('👆 Collapsing first chunk...');
			await page.locator('button[aria-label*="Collapse"]').first().click();
			await page.waitForTimeout(500);

			await page.screenshot({
				path: 'scripts/tests/screenshots/evidence-chunks/demo-04-toggle-demo.png',
				fullPage: true
			});
			console.log('📸 04-toggle-demo.png saved');

			// Scroll to show color coding
			console.log('\n📜 Scrolling to show chunk types...');
			await page.evaluate(() => window.scrollBy(0, 300));
			await page.waitForTimeout(300);

			await page.screenshot({
				path: 'scripts/tests/screenshots/evidence-chunks/demo-05-color-coding.png',
				fullPage: false
			});
			console.log('📸 05-color-coding.png saved');

			console.log('\n✅ All screenshots captured successfully!');
			console.log('\n📁 Saved to: scripts/tests/screenshots/evidence-chunks/');
		} else {
			console.log('\n❌ No expand buttons found - chunks UI may not be rendering');
		}

		console.log('\n🔍 Keeping browser open for 15 seconds for manual testing...');
		console.log('   Try clicking different chunks to test expand/collapse!');
		await page.waitForTimeout(15000);

	} catch (error) {
		console.error('\n❌ Error:', error.message);
		await page.screenshot({
			path: 'scripts/tests/screenshots/evidence-chunks/demo-error.png',
			fullPage: true
		});
	} finally {
		await browser.close();
		console.log('\n🏁 Test complete!');
	}
}

testDemoPage();
