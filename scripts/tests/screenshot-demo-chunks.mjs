#!/usr/bin/env node
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots', 'chunks-demo');

import fs from 'fs';
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } });

const demoFile = path.join(__dirname, 'demo-chunks-ui.html');
await page.goto(`file:///${demoFile.replace(/\\/g, '/')}`);
await page.waitForTimeout(1000);

console.log('📸 Screenshot 1: Chunks collapsed');
await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01-chunks-collapsed.png'), fullPage: true });

// Click first chunk to expand
await page.locator('.chunk-card').first().click();
await page.waitForTimeout(500);

console.log('📸 Screenshot 2: First chunk expanded');
await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02-first-chunk-expanded.png'), fullPage: true });

// Expand a few more chunks
const chunks = await page.locator('.chunk-card').all();
if (chunks[2]) {
  await chunks[2].click();
  await page.waitForTimeout(300);
}
if (chunks[4]) {
  await chunks[4].click();
  await page.waitForTimeout(300);
}

console.log('📸 Screenshot 3: Multiple chunks expanded');
await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03-multiple-chunks-expanded.png'), fullPage: true });

console.log(`\n✅ Demo screenshots saved to: ${SCREENSHOTS_DIR}\n`);

await page.waitForTimeout(2000);
await browser.close();
