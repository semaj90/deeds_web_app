#!/usr/bin/env node
/**
 * Test EvidencePrimaryUpload Component - Expandable Chunks
 *
 * Targets the drag-drop upload area on /evidence page
 * that shows EvidenceUploadResults with expandable chunks
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'http://localhost:5173';
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots', 'primary-upload-chunks');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

const log = (msg, emoji = '📝') => console.log(`${emoji} ${msg}`);

async function testPrimaryUploadChunks() {
  const browser = await chromium.launch({ headless: false, slowMo: 300 });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  try {
    // Create test document with structure
    const testFile = path.join(__dirname, 'legal-test.txt');
    fs.writeFileSync(testFile, `
ARTICLE I - PARTIES
SECTION 1.1 - First Party
John Smith, hereinafter referred to as "Plaintiff"

SECTION 1.2 - Second Party
ABC Corporation, hereinafter referred to as "Defendant"

ARTICLE II - CLAIMS
SECTION 2.1 - Breach of Contract
The Plaintiff alleges that Defendant failed to deliver goods as specified in Contract No. 12345.

SECTION 2.2 - Damages
Plaintiff seeks $50,000 in compensatory damages plus legal fees.

ARTICLE III - RELIEF SOUGHT
Plaintiff requests the Court to order specific performance and monetary relief.
    `.trim());

    log('Navigating to /evidence...', '📍');
    await page.goto(`${BASE_URL}/evidence`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Screenshot 1: Evidence page before upload
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01-before-upload.png'), fullPage: true });
    log('Screenshot 1: Before upload', '📸');

    // Find the drag-drop upload zone (should say "Drop files here or use browse")
    log('Looking for primary upload component...', '🔍');

    const uploadZoneSelectors = [
      '.upload-zone',
      '[role="button"]:has-text("Drop files")',
      'text=/Drop files here/',
      '.upload-section input[type="file"]',
    ];

    let fileInput = null;
    for (const selector of uploadZoneSelectors) {
      try {
        const element = page.locator(selector).first();
        if (await element.count() > 0) {
          log(`Found upload zone: ${selector}`, '✅');

          // Find the file input within this zone
          const inputs = await page.locator('input[type="file"]').all();
          for (const input of inputs) {
            if (await input.isVisible() || await input.count() > 0) {
              fileInput = input;
              break;
            }
          }
          if (fileInput) break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!fileInput) {
      // Try to find ANY file input
      const allInputs = await page.locator('input[type="file"]').all();
      if (allInputs.length > 0) {
        fileInput = allInputs[0];
        log(`Using file input (found ${allInputs.length} inputs)`, '⚠️');
      }
    }

    if (!fileInput) {
      log('No file input found!', '❌');
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'error-no-input.png'), fullPage: true });
      return;
    }

    // Upload the file
    log('Uploading test document...', '📤');
    await fileInput.setInputFiles(testFile);
    await page.waitForTimeout(1500);

    // Screenshot 2: File selected
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02-file-selected.png'), fullPage: true });
    log('Screenshot 2: File selected', '📸');

    // Look for and click the Upload/Submit button
    const submitSelectors = [
      'button:has-text("Upload"):visible',
      'button[type="submit"]:visible',
      '.upload-submit:visible',
      'button:has(svg):has-text("Upload")',
    ];

    let submitBtn = null;
    for (const selector of submitSelectors) {
      const btn = page.locator(selector).first();
      if (await btn.count() > 0 && await btn.isVisible()) {
        submitBtn = btn;
        log(`Found submit button: ${selector}`, '✅');
        break;
      }
    }

    if (submitBtn) {
      await submitBtn.click();
      log('Clicked upload button', '👆');
      await page.waitForTimeout(3000);

      // Screenshot 3: Processing
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03-processing.png'), fullPage: true });
      log('Screenshot 3: Processing', '📸');

      // Wait for results (look for chunks or results container)
      log('Waiting for results with chunks...', '⏳');

      try {
        await page.waitForSelector('text=/chunk|ARTICLE|SECTION/i', { timeout: 20000 });
        log('Results appeared!', '✅');
      } catch (e) {
        log('Results timeout, capturing current state...', '⚠️');
      }

      await page.waitForTimeout(2000);

      // Screenshot 4: Results with collapsed chunks
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '04-results-with-chunks.png'), fullPage: true });
      log('Screenshot 4: Results with chunks', '📸');

      // Look for expandable elements
      const chunkSelectors = [
        '[data-chunk-id]',
        '.chunk-item',
        '.chunk-header',
        'button:has(svg):has-text("expand")',
        'button[aria-label*="expand" i]',
        'div:has-text("ARTICLE"):has(button)',
      ];

      let expandBtn = null;
      for (const selector of chunkSelectors) {
        const elements = await page.locator(selector).all();
        if (elements.length > 0) {
          log(`Found ${elements.length} chunk elements: ${selector}`, '✅');

          // Try to find a clickable button within the first chunk
          const firstChunk = elements[0];
          const buttons = await firstChunk.locator('button').all();
          if (buttons.length > 0) {
            expandBtn = buttons[0];
            log(`Found expand button in chunk`, '✅');
            break;
          }
        }
      }

      if (expandBtn) {
        await expandBtn.click();
        await page.waitForTimeout(1000);
        log('Clicked expand button', '👆');

        // Screenshot 5: Expanded chunk
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '05-chunk-expanded.png'), fullPage: true });
        log('Screenshot 5: Chunk expanded', '📸');
      } else {
        log('No expandable chunks found', '⚠️');
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '05-no-expand-found.png'), fullPage: true });
      }
    } else {
      log('No submit button found!', '❌');
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'error-no-submit.png'), fullPage: true });
    }

    log('\n✅ Test complete!', '🎉');
    log(`Screenshots: ${SCREENSHOTS_DIR}`, '📂');

    // Cleanup
    fs.unlinkSync(testFile);

  } catch (error) {
    log(`Error: ${error.message}`, '❌');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'error.png'), fullPage: true });
  } finally {
    await page.waitForTimeout(3000);
    await browser.close();
  }
}

testPrimaryUploadChunks();
