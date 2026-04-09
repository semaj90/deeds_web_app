import { chromium } from 'playwright';

const browser = await chromium.launch({ args: ['--enable-webgpu', '--enable-unsafe-webgpu'] });
const page = await browser.newPage();
const logs = [];
page.on('pageerror', e => logs.push('PAGE_ERR: ' + e.message.substring(0, 120)));

await page.goto('http://localhost:5173/demos/ui-components', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.hero-title', { state: 'visible', timeout: 30000 });
await page.waitForTimeout(3000);

// Try keyboard approach for slider
const slider = page.locator('input[type="range"]').first();
await slider.focus();
for (let i = 0; i < 25; i++) await page.keyboard.press('ArrowRight');
await page.waitForTimeout(500);
const lbl = await page.locator('label').filter({ hasText: 'Value:' }).first().textContent();
console.log('AFTER_KEYBOARD:', lbl);

// Check if ChatFeedback button fires onclick
const btn = page.locator('button[title="Helpful"]').first();
const btnHtml = await btn.evaluate(el => el.outerHTML);
console.log('BTN_HTML:', btnHtml);
await btn.click({ force: true });
await page.waitForTimeout(1000);
const logCount = await page.locator('.feedback-log').count();
console.log('LOG_COUNT_AFTER_FORCE:', logCount);

// Also try second thumbs up
const btn2 = page.locator('button[title="Helpful"]').nth(1);
if (await btn2.isVisible()) {
  await btn2.click({ force: true });
  await page.waitForTimeout(1000);
  const logCount2 = await page.locator('.feedback-log').count();
  console.log('LOG_COUNT_AFTER_2ND:', logCount2);
}

// Check validate button
const vBtn = page.locator('button').filter({ hasText: 'Validate' }).first();
await vBtn.click({ force: true });
await page.waitForTimeout(1000);
const actionLog = await page.locator('.scene-action-log').count();
console.log('ACTION_LOG_COUNT:', actionLog);

// Dump page errors
console.log('\nPAGE_ERRORS:');
logs.forEach(l => console.log(l));

await browser.close();
