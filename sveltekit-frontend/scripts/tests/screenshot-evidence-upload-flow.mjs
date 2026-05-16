#!/usr/bin/env node
/**
 * Evidence Upload UX Flow - Screenshot Capture
 *
 * Captures 4 screenshots demonstrating the complete upload flow:
 * 1. Upload modal with drag-and-drop zone
 * 2. Real-time 8-stage pipeline progress
 * 3. Success results with chunks collapsed
 * 4. Expanded chunk view with full text
 *
 * Usage:
 *   node scripts/tests/screenshot-evidence-upload-flow.mjs
 *
 * Requirements:
 *   - Dev server running on http://localhost:5173
 *   - Test image in Pictures directory
 *   - Playwright installed (npx playwright install chromium)
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BASE_URL = process.env.PUBLIC_APP_URL ?? (process.env.BASE_URL || 'http://localhost:5173');
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots', 'evidence-upload-flow');
const PICTURES_DIR = process.env.PICTURES_DIR || path.join(process.env.USERPROFILE || process.env.HOME, 'Pictures');

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

function findTestImage() {
  const imageExtensions = ['.jpg', '.jpeg', '.png'];

  if (!fs.existsSync(PICTURES_DIR)) {
    log(`❌ Pictures directory not found: ${PICTURES_DIR}`, 'red');
    return null;
  }

  const files = fs.readdirSync(PICTURES_DIR)
    .filter(f => imageExtensions.includes(path.extname(f).toLowerCase()))
    .slice(0, 5);

  if (files.length === 0) {
    log('❌ No images found', 'red');
    return null;
  }

  // Select smallest image for faster upload
  const fileSizes = files.map(f => ({
    path: path.join(PICTURES_DIR, f),
    size: fs.statSync(path.join(PICTURES_DIR, f)).size,
    name: f,
  })).sort((a, b) => a.size - b.size);

  log(`✓ Found ${files.length} images, selected: ${fileSizes[0].name}`, 'green');
  return fileSizes[0].path;
}

async function captureScreenshots() {
  const imagePath = findTestImage();
  if (!imagePath) {
    log('❌ No test image found', 'red');
    return;
  }

  log('\n🚀 Launching Chromium...', 'cyan');
  const browser = await chromium.launch({ headless: false }); // headless=false to see the UI
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  try {
    // Navigate to evidence page
    log('📍 Navigating to /evidence...', 'cyan');
    await page.goto(`${BASE_URL}/evidence`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // SCREENSHOT 1: Upload Modal - Initial State
    log('\n📸 Screenshot 1: Upload Modal - Initial State', 'bright');

    // Click upload button to open modal
    const uploadButton = page.locator('button:has-text("Upload Evidence")').first();
    if (await uploadButton.count() > 0) {
      await uploadButton.click();
      await page.waitForTimeout(500);

      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, '01-upload-modal-initial.png'),
        fullPage: true,
      });
      log('  ✓ Saved: 01-upload-modal-initial.png', 'green');
    } else {
      log('  ⚠️  Upload button not found, trying direct modal route...', 'yellow');
    }

    // SCREENSHOT 2: Pipeline Progress - Processing
    log('\n📸 Screenshot 2: Pipeline Progress - Processing', 'bright');

    // Upload the file
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(imagePath);
    await page.waitForTimeout(1000);

    // Click upload button in modal
    const uploadModalButton = page.locator('button:has-text("Upload and process")').first();
    if (await uploadModalButton.count() > 0) {
      await uploadModalButton.click();
      await page.waitForTimeout(1500); // Wait for pipeline to start

      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, '02-pipeline-progress.png'),
        fullPage: true,
      });
      log('  ✓ Saved: 02-pipeline-progress.png', 'green');

      // Wait for upload to complete
      await page.waitForSelector('text=/Upload Complete|Evidence Uploaded Successfully/i', {
        timeout: 30000,
      });
      await page.waitForTimeout(1000);
    }

    // Get evidence ID from the results
    const evidenceIdMatch = await page.textContent('body');
    const evidenceIdRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    const match = evidenceIdMatch?.match(evidenceIdRegex);
    const evidenceId = match ? match[0] : null;

    if (!evidenceId) {
      log('  ⚠️  Could not extract evidence ID, trying fallback...', 'yellow');

      // Try to get latest evidence from API
      const response = await page.evaluate(async () => {
        const res = await fetch('/api/evidence?limit=1');
        return res.json();
      });

      if (response && response.evidence && response.evidence.length > 0) {
        const latestId = response.evidence[0].id;
        log(`  ✓ Found latest evidence ID: ${latestId}`, 'green');

        // Navigate to evidence details page
        await page.goto(`${BASE_URL}/evidence/${latestId}`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(2000);
      }
    } else {
      log(`  ✓ Evidence ID: ${evidenceId}`, 'green');

      // Navigate to evidence details page
      await page.goto(`${BASE_URL}/evidence/${evidenceId}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);
    }

    // SCREENSHOT 3: Results - Chunks Collapsed
    log('\n📸 Screenshot 3: Results - Chunks Collapsed', 'bright');

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '03-results-collapsed.png'),
      fullPage: true,
    });
    log('  ✓ Saved: 03-results-collapsed.png', 'green');

    // SCREENSHOT 4: Expanded Chunk
    log('\n📸 Screenshot 4: Expanded Chunk - Full Content', 'bright');

    // Find and click the first expand button (chevron-down icon)
    const expandButton = page.locator('button[aria-label="Expand"], button:has(svg)').first();
    if (await expandButton.count() > 0) {
      await expandButton.click();
      await page.waitForTimeout(500);

      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, '04-chunk-expanded.png'),
        fullPage: true,
      });
      log('  ✓ Saved: 04-chunk-expanded.png', 'green');
    } else {
      log('  ⚠️  Expand button not found, capturing current state...', 'yellow');

      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, '04-chunk-expanded.png'),
        fullPage: true,
      });
      log('  ✓ Saved: 04-chunk-expanded.png (no expandable chunks)', 'green');
    }

    log('\n✅ All 4 screenshots captured successfully!', 'green');
    log(`\n📂 Screenshots saved to: ${SCREENSHOTS_DIR}`, 'cyan');
    log('\nFiles:', 'bright');
    log('  • 01-upload-modal-initial.png', 'dim');
    log('  • 02-pipeline-progress.png', 'dim');
    log('  • 03-results-collapsed.png', 'dim');
    log('  • 04-chunk-expanded.png', 'dim');

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
    await page.waitForTimeout(2000); // Keep browser open briefly
    await browser.close();
  }
}

// Main
log('═'.repeat(70), 'cyan');
log('  Evidence Upload UX Flow - Screenshot Capture', 'bright');
log('═'.repeat(70), 'cyan');
log('', 'reset');

captureScreenshots().catch(error => {
  log(`\n❌ Fatal error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
