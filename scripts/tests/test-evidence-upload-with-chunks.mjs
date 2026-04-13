#!/usr/bin/env node
/**
 * Evidence Upload UX Flow - Complete Test
 *
 * Captures the complete upload → process → results → expand chunks workflow
 *
 * Screenshots:
 * 1. Evidence page with upload area
 * 2. File selected, ready to upload
 * 3. Processing pipeline (8 stages)
 * 4. Results with collapsed chunks
 * 5. Expanded chunk showing full content
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'http://localhost:5173';
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots', 'evidence-upload-complete');

// Create screenshots directory
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

const log = (msg, emoji = '📝') => console.log(`${emoji} ${msg}`);

async function testEvidenceUpload() {
  log('Launching browser...', '🚀');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 500, // Slow down to see what's happening
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });

  const page = await context.newPage();

  try {
    // Navigate to evidence page
    log('Navigating to /evidence...', '📍');
    await page.goto(`${BASE_URL}/evidence`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // Screenshot 1: Evidence page initial state
    log('Screenshot 1: Evidence page with upload area', '📸');
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '01-evidence-page.png'),
      fullPage: true,
    });

    // Find the upload area (drag-drop zone or file input)
    log('Looking for upload component...', '🔍');

    // Try different upload approaches
    let uploadSuccess = false;

    // Approach 1: Look for file input
    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.count() > 0) {
      log('Found file input, selecting document...', '📄');

      // Create a test text file
      const testFilePath = path.join(__dirname, 'test-document.txt');
      const testContent = `LEGAL DOCUMENT - EVIDENCE TEST

ARTICLE I - INTRODUCTION
This is a test legal document for the evidence upload system.
It contains multiple sections and articles to demonstrate chunking.

SECTION 1.1 - Purpose
The purpose of this document is to verify that:
1. Documents can be uploaded successfully
2. Text extraction works correctly
3. Legal chunking identifies structure
4. Results display with expandable chunks

ARTICLE II - TECHNICAL SPECIFICATIONS

SECTION 2.1 - File Format
This document is in plain text format (.txt) to ensure reliable processing.

SECTION 2.2 - Content Structure
The document follows a legal structure with:
- Articles (top level)
- Sections (second level)
- Numbered lists
- Paragraphs with legal terminology

ARTICLE III - EXPECTED RESULTS

SECTION 3.1 - Processing Pipeline
Upon upload, the system should:
1. Upload to MinIO storage
2. Create database record
3. Extract text (OCR if needed)
4. Chunk into legal sections
5. Generate embeddings (768-dim)
6. Store in Qdrant vector database
7. Extract entities (citations, dates, etc.)
8. Run forensic analysis

SECTION 3.2 - Display Requirements
Results should show:
- File metadata (name, size, type)
- Processing status (complete/failed)
- Chunk list (collapsed by default)
- Expandable chunks on click
- Chunk type indicators (ARTICLE, SECTION, etc.)

ARTICLE IV - CONCLUSION
This test document validates the complete evidence upload workflow.

END OF DOCUMENT`;

      fs.writeFileSync(testFilePath, testContent);

      await fileInput.setInputFiles(testFilePath);
      uploadSuccess = true;

      await page.waitForTimeout(1000);

      // Screenshot 2: File selected
      log('Screenshot 2: File selected, ready to upload', '📸');
      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, '02-file-selected.png'),
        fullPage: true,
      });

      // Find and click upload/submit button
      const uploadButtons = [
        'button:has-text("Upload")',
        'button:has-text("Process")',
        'button:has-text("Submit")',
        'button[type="submit"]',
      ];

      let buttonClicked = false;
      for (const selector of uploadButtons) {
        const button = page.locator(selector).first();
        if (await button.count() > 0 && await button.isVisible()) {
          log(`Clicking upload button: ${selector}`, '👆');
          await button.click();
          buttonClicked = true;
          break;
        }
      }

      if (buttonClicked) {
        await page.waitForTimeout(2000);

        // Screenshot 3: Processing pipeline
        log('Screenshot 3: Processing pipeline', '📸');
        await page.screenshot({
          path: path.join(SCREENSHOTS_DIR, '03-processing.png'),
          fullPage: true,
        });

        // Wait for upload to complete (look for success indicators)
        log('Waiting for upload to complete...', '⏳');

        try {
          await page.waitForSelector('text=/Upload Complete|Success|Uploaded/i', {
            timeout: 30000,
          });
          log('Upload completed!', '✅');
        } catch (e) {
          log('Upload completion not detected, continuing...', '⚠️');
        }

        await page.waitForTimeout(2000);

        // Screenshot 4: Results with collapsed chunks
        log('Screenshot 4: Results with collapsed chunks', '📸');
        await page.screenshot({
          path: path.join(SCREENSHOTS_DIR, '04-results-collapsed.png'),
          fullPage: true,
        });

        // Look for expandable chunks (chevron/arrow icons or expand buttons)
        log('Looking for expandable chunks...', '🔍');

        const expandSelectors = [
          'button[aria-label*="Expand"]',
          'button:has(svg.chevron)',
          '.chunk-header',
          '[data-chunk-id]',
          'button:has-text("▼")',
          'button:has-text("›")',
        ];

        let expandButton = null;
        for (const selector of expandSelectors) {
          const btn = page.locator(selector).first();
          if (await btn.count() > 0) {
            expandButton = btn;
            log(`Found expand button: ${selector}`, '✅');
            break;
          }
        }

        if (expandButton) {
          await expandButton.click();
          await page.waitForTimeout(1000);

          // Screenshot 5: Expanded chunk
          log('Screenshot 5: Expanded chunk with full content', '📸');
          await page.screenshot({
            path: path.join(SCREENSHOTS_DIR, '05-chunk-expanded.png'),
            fullPage: true,
          });
        } else {
          log('No expandable chunks found, capturing current state', '⚠️');
          await page.screenshot({
            path: path.join(SCREENSHOTS_DIR, '05-no-chunks.png'),
            fullPage: true,
          });
        }
      }

      // Clean up test file
      fs.unlinkSync(testFilePath);
    }

    if (!uploadSuccess) {
      log('Could not find upload mechanism', '❌');
      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'error-no-upload.png'),
        fullPage: true,
      });
    }

    log('\n✅ Test complete!', '🎉');
    log(`Screenshots saved to: ${SCREENSHOTS_DIR}`, '📂');

  } catch (error) {
    log(`Error: ${error.message}`, '❌');
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'error.png'),
      fullPage: true,
    });
  } finally {
    await page.waitForTimeout(3000);
    await browser.close();
  }
}

testEvidenceUpload();
