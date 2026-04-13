#!/usr/bin/env node

import { chromium } from 'playwright';

const EVIDENCE_PAGE_URL = 'http://localhost:5173/evidence';

async function testEvidencePage() {
	const browser = await chromium.launch({ headless: false, slowMo: 300 });
	const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
	const page = await context.newPage();

	try {
		console.log('🌐 Testing Evidence List Page...');
		console.log(`   URL: ${EVIDENCE_PAGE_URL}\n`);

		await page.goto(EVIDENCE_PAGE_URL);
		await page.waitForLoadState('networkidle');
		await page.waitForTimeout(2000);

		const title = await page.title();
		console.log(`📄 Page title: ${title}\n`);

		// Look for our test evidence
		const serviceAgreement = await page.locator('text=/Service Agreement/i').count();
		console.log(`📋 Test evidence visible: ${serviceAgreement > 0 ? '✅' : '❌'}`);

		if (serviceAgreement > 0) {
			console.log('   Found "Service Agreement with Structured Chunks"!');

			// Try clicking it
			console.log('\n👆 Clicking on evidence item...');
			await page.locator('text=/Service Agreement/i').first().click();
			await page.waitForTimeout(1500);

			// Check if chunks UI appears
			const hasChunks = await page.locator('text=/chunks/i').count();
			const hasArticle = await page.locator('text=/ARTICLE/i').count();
			const expandButtons = await page.locator('button[aria-label*="Expand"]').count();

			console.log(`\n🔍 After clicking:`);
			console.log(`   Chunks mentioned: ${hasChunks > 0 ? '✅' : '❌'}`);
			console.log(`   ARTICLE badges: ${hasArticle}`);
			console.log(`   Expand buttons: ${expandButtons}`);

			if (expandButtons > 0) {
				console.log('\n🎉 CHUNKS UI FOUND!');

				await page.screenshot({
					path: 'scripts/tests/screenshots/evidence-chunks/evidence-page-chunks.png',
					fullPage: true
				});
				console.log('📸 Screenshot saved: evidence-page-chunks.png');

				// Click expand button
				console.log('\n👆 Expanding first chunk...');
				await page.locator('button[aria-label*="Expand"]').first().click();
				await page.waitForTimeout(500);

				await page.screenshot({
					path: 'scripts/tests/screenshots/evidence-chunks/evidence-page-expanded.png',
					fullPage: true
				});
				console.log('📸 Screenshot saved: evidence-page-expanded.png');
			}
		} else {
			console.log('⚠️  Test evidence not found on page');
			console.log('   Checking for other evidence items...');

			const allEvidence = await page.locator('[class*="evidence"], [data-evidence]').count();
			console.log(`   Total evidence elements: ${allEvidence}`);

			// Take screenshot anyway
			await page.screenshot({
				path: 'scripts/tests/screenshots/evidence-chunks/evidence-page-list.png',
				fullPage: true
			});
			console.log('📸 Screenshot saved: evidence-page-list.png');
		}

		// Check for upload form
		const uploadForm = await page.locator('form, [type="file"]').count();
		console.log(`\n📤 Upload form present: ${uploadForm > 0 ? '✅' : '❌'}`);

		// Check for EvidencePrimaryUpload component indicators
		const primaryUpload = await page.locator('[class*="upload"], [class*="drop"]').count();
		console.log(`   Upload area elements: ${primaryUpload}`);

		console.log('\n🔍 Keeping browser open for 20 seconds for inspection...');
		await page.waitForTimeout(20000);
	} catch (error) {
		console.error('\n❌ Error:', error.message);
		await page.screenshot({
			path: 'scripts/tests/screenshots/evidence-chunks/evidence-page-error.png',
			fullPage: true
		});
	} finally {
		await browser.close();
		console.log('🏁 Browser closed');
	}
}

testEvidencePage();
