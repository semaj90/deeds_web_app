#!/usr/bin/env node

import { chromium } from 'playwright';

const CORRECT_URL = 'http://localhost:5173/document-analysis/26c42a93-1a4f-47b2-b439-ea6e3e9d72e0';

async function testCorrectURL() {
	const browser = await chromium.launch({ headless: false, slowMo: 300 });
	const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
	const page = await context.newPage();

	try {
		console.log('🌐 Testing CORRECT URL...');
		console.log(`   ${CORRECT_URL}\n`);

		await page.goto(CORRECT_URL);
		await page.waitForLoadState('networkidle');
		await page.waitForTimeout(2000);

		const title = await page.title();
		console.log(`📄 Page title: ${title}`);

		const is404 = title.includes('404') || title.includes('Error');
		console.log(`   Status: ${is404 ? '❌ 404 Error' : '✅ Page loaded'}\n`);

		if (!is404) {
			// Check for chunks
			const bodyText = await page.textContent('body');

			console.log('🔍 Searching for chunks UI...\n');

			const hasArticle = bodyText?.includes('ARTICLE') || bodyText?.includes('Article');
			const hasSection = bodyText?.includes('SECTION') || bodyText?.includes('Section');
			const hasChunks = bodyText?.includes('chunks') || bodyText?.includes('Chunks');

			console.log(`   ARTICLE text: ${hasArticle ? '✅' : '❌'}`);
			console.log(`   SECTION text: ${hasSection ? '✅' : '❌'}`);
			console.log(`   Chunks mentioned: ${hasChunks ? '✅' : '❌'}`);

			// Look for expandable elements
			const expandButtons = await page.locator('button[aria-label*="Expand"], button[aria-label*="xpand"]').count();
			const chevronIcons = await page.locator('[class*="chevron"]').count();
			const allButtons = await page.locator('button').count();

			console.log(`\n🎯 Interactive elements:`);
			console.log(`   Expand buttons: ${expandButtons}`);
			console.log(`   Chevron icons: ${chevronIcons}`);
			console.log(`   Total buttons: ${allButtons}`);

			// Take screenshot
			await page.screenshot({
				path: 'scripts/tests/screenshots/evidence-chunks/correct-url-initial.png',
				fullPage: true
			});
			console.log(`\n📸 Screenshot saved: correct-url-initial.png`);

			// Check what component is rendering
			const mainContent = await page.locator('main, [role="main"], body').first().innerHTML();
			const hasUploadResults = mainContent.includes('EvidenceUploadResults') || mainContent.includes('upload-results');
			const hasDocumentAnalysis = mainContent.includes('DocumentAnalysis') || mainContent.includes('document-analysis');

			console.log(`\n🧩 Component detection:`);
			console.log(`   EvidenceUploadResults: ${hasUploadResults ? '✅' : '❌'}`);
			console.log(`   DocumentAnalysis: ${hasDocumentAnalysis ? '✅' : '❌'}`);

			// Look for the evidence title
			const evidenceTitle = await page.locator('text=/Service Agreement/i').count();
			console.log(`\n📋 Evidence title visible: ${evidenceTitle > 0 ? '✅' : '❌'}`);

			if (evidenceTitle > 0) {
				console.log('   Title: "Service Agreement with Structured Chunks" found!');
			}

			// Try to find chunk-related elements
			const chunkItems = await page.locator('[class*="chunk"]').count();
			console.log(`\n📦 Chunk-related elements: ${chunkItems}`);

			if (chunkItems > 0) {
				console.log('   🎉 CHUNKS UI FOUND!');

				// Try clicking first expandable element if exists
				if (expandButtons > 0) {
					console.log('\n👆 Clicking first expand button...');
					await page.locator('button[aria-label*="Expand"]').first().click();
					await page.waitForTimeout(500);

					await page.screenshot({
						path: 'scripts/tests/screenshots/evidence-chunks/correct-url-expanded.png',
						fullPage: true
					});
					console.log('📸 Screenshot saved: correct-url-expanded.png');
				}
			} else {
				console.log('\n⚠️  No chunk elements found.');
				console.log('   This page might not use EvidenceUploadResults component.');
				console.log('   Check if chunks are displayed in a different format.');
			}
		}

		console.log('\n🔍 Keeping browser open for 15 seconds...');
		await page.waitForTimeout(15000);
	} catch (error) {
		console.error('\n❌ Error:', error.message);
		await page.screenshot({
			path: 'scripts/tests/screenshots/evidence-chunks/correct-url-error.png',
			fullPage: true
		});
	} finally {
		await browser.close();
		console.log('🏁 Browser closed');
	}
}

testCorrectURL();
