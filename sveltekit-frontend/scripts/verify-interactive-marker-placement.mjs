import { chromium } from '@playwright/test';

async function main() {
	const browser = await chromium.launch({ headless: true });
	const context = await browser.newContext({
		viewport: { width: 1440, height: 900 },
		permissions: ['clipboard-read', 'clipboard-write']
	});
	const page = await context.newPage();

	const pageErrors = [];
	page.on('pageerror', (err) => pageErrors.push(err.message));

	console.log('Navigating to /demos/detective-mode...');
	await page.goto('http://localhost:5173/demos/detective-mode', { waitUntil: 'networkidle' });

	// Wait for Detective Mode Canvas to mount
	await page.waitForSelector('.detective-hud-container', { timeout: 15000 });
	console.log('Detective Mode Canvas mounted.');

	// 1. Switch to 3D Crime Scene view if not already
	const crimeSceneTab = page.locator('button:has-text("3D CRIME SCENE"), button:has-text("3D Scene")').first();
	if (await crimeSceneTab.isVisible()) {
		await crimeSceneTab.click();
		await page.waitForTimeout(1000);
	}

	// Capture initial 3D crime scene view
	await page.screenshot({ path: 'scratch/crime-scene-interactive-start.png' });
	console.log('Captured start view.');

	// 2. Select Marker Placement Tool
	const markerToolBtn = page.locator('button[title*="Place Evidence Marker"]').first();
	if (await markerToolBtn.isVisible()) {
		console.log('Activating Marker Placement tool...');
		await markerToolBtn.click();
		await page.waitForTimeout(300);
	}

	// 3. Click on the 3D canvas to place Marker #4
	const canvas = page.locator('canvas.three-crime-canvas').first();
	if (await canvas.isVisible()) {
		const box = await canvas.boundingBox();
		if (box) {
			console.log(`Clicking floor at (${box.x + box.width * 0.65}, ${box.y + box.height * 0.7})...`);
			await page.mouse.click(box.x + box.width * 0.65, box.y + box.height * 0.7);
			await page.waitForTimeout(600);
		}
	}

	// Capture updated 3D crime scene with placed marker
	await page.screenshot({ path: 'scratch/crime-scene-marker-placed.png' });
	console.log('Captured marker-placed view.');

	// 4. Test Ornith AI Prompt Input
	const promptInput = page.locator('input[placeholder*="Ask Ornith AI"]').first();
	const sendBtn = page.locator('.occ-send-btn').first();
	if (await promptInput.isVisible() && await sendBtn.isVisible()) {
		console.log('Testing Ornith AI prompt submission...');
		await promptInput.fill('Formulate cross-examination questions for Alexander Vance on Sub-station 4-B access.');
		await sendBtn.click();
		await page.waitForTimeout(1200);
	}

	await page.screenshot({ path: 'scratch/crime-scene-ornith-response.png' });
	console.log('Captured Ornith AI response view.');

	console.log('Page Errors encountered:', pageErrors);
	await browser.close();

	if (pageErrors.length > 0) {
		console.error('Test completed with page errors:', pageErrors);
		process.exit(1);
	}
	console.log('All interactive tests passed successfully!');
}

main().catch((err) => {
	console.error('Fatal test error:', err);
	process.exit(1);
});
