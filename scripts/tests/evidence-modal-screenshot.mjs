import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const outDir = 'scripts/tests/screenshots';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1400, height: 900 });

// 1. Evidence page
await page.goto('http://127.0.0.1:5173/evidence', { waitUntil: 'networkidle', timeout: 30000 });
await page.screenshot({ path: `${outDir}/evidence-page.png`, fullPage: false });
console.log('✓ evidence-page.png saved');

// 2. Click first evidence card to open modal
const card = await page.$('.ev-card[role="button"]');
if (card) {
  await card.click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${outDir}/evidence-modal.png`, fullPage: false });
  console.log('✓ evidence-modal.png saved');
} else {
  console.log('✗ No .ev-card found — evidence list may be empty');
  // Screenshot current state for debugging
  await page.screenshot({ path: `${outDir}/evidence-no-cards.png`, fullPage: false });
}

await browser.close();
console.log('Done');
