#!/usr/bin/env node
/**
 * Professional Analysis UIs - Screenshot Capture
 *
 * Captures screenshots of the 3 professional analysis editors:
 * 1. Audio Analysis (Adobe Audition-style)
 * 2. Video Analysis (Adobe Premiere-style)
 * 3. Document Analysis (Google Docs-style)
 *
 * Usage:
 *   node scripts/tests/screenshot-analysis-uis.mjs
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots', 'professional-analysis-uis');

// Evidence IDs from database
const EVIDENCE = {
  audio: '1330f67c-bf15-4e3a-8da3-3565271b70ef',
  video: 'd469e6e2-f916-4a91-9bff-673b9f940beb',
  document: '4fc9c5d1-5678-4def-abcd-123456789abc' // Fallback if no real docs exist
};

// Create screenshots directory
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

// ANSI colors
const c = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  dim: '\x1b[2m',
};

function log(msg, color = 'reset') {
  console.log(`${c[color]}${msg}${c.reset}`);
}

async function captureScreenshots() {
  log('\n🚀 Launching Chromium...', 'cyan');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  try {
    // SCREENSHOT 1: Audio Analysis Editor
    log('\n📸 Screenshot 1: Audio Analysis Editor (Adobe Audition-style)', 'bright');

    await page.goto(`${BASE_URL}/audio-analysis/${EVIDENCE.audio}`, {
      waitUntil: 'networkidle',
      timeout: 15000
    });
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '01-audio-analysis-editor.png'),
      fullPage: true,
    });
    log('  ✓ Saved: 01-audio-analysis-editor.png', 'green');

    // SCREENSHOT 2: Video Analysis Editor
    log('\n📸 Screenshot 2: Video Analysis Editor (Adobe Premiere-style)', 'bright');

    await page.goto(`${BASE_URL}/video-analysis/${EVIDENCE.video}`, {
      waitUntil: 'networkidle',
      timeout: 15000
    });
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '02-video-analysis-editor.png'),
      fullPage: true,
    });
    log('  ✓ Saved: 02-video-analysis-editor.png', 'green');

    // SCREENSHOT 3: Document Analysis Editor
    log('\n📸 Screenshot 3: Document Analysis Editor (Google Docs-style)', 'bright');

    await page.goto(`${BASE_URL}/document-analysis/${EVIDENCE.document}`, {
      waitUntil: 'networkidle',
      timeout: 15000
    });
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '03-document-analysis-editor.png'),
      fullPage: true,
    });
    log('  ✓ Saved: 03-document-analysis-editor.png', 'green');

    // SCREENSHOT 4: Evidence Page with Upload UI
    log('\n📸 Screenshot 4: Evidence Page (Grid View)', 'bright');

    await page.goto(`${BASE_URL}/evidence`, {
      waitUntil: 'networkidle',
      timeout: 15000
    });
    await page.waitForTimeout(1000);

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '04-evidence-page.png'),
      fullPage: true,
    });
    log('  ✓ Saved: 04-evidence-page.png', 'green');

    log('\n✅ All 4 screenshots captured successfully!', 'green');
    log(`\n📂 Screenshots saved to: ${SCREENSHOTS_DIR}`, 'cyan');
    log('\nFiles:', 'bright');
    log('  • 01-audio-analysis-editor.png', 'dim');
    log('  • 02-video-analysis-editor.png', 'dim');
    log('  • 03-document-analysis-editor.png', 'dim');
    log('  • 04-evidence-page.png', 'dim');

  } catch (error) {
    log(`\n❌ Error: ${error.message}`, 'red');
    console.error(error);

    // Take error screenshot
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'error-state.png'),
      fullPage: true,
    });
    log(`  ✓ Error screenshot saved: error-state.png`, 'yellow');

  } finally {
    await page.waitForTimeout(2000);
    await browser.close();
  }
}

// Main
log('═'.repeat(70), 'cyan');
log('  Professional Analysis UIs - Screenshot Capture', 'bright');
log('═'.repeat(70), 'cyan');
log('', 'reset');

captureScreenshots().catch(error => {
  log(`\n❌ Fatal error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
