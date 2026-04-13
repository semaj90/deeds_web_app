#!/usr/bin/env node
/**
 * Complete Upload Flow - Upload → Process → View Chunks
 *
 * 1. Upload document via API
 * 2. Wait for processing to complete
 * 3. Navigate to evidence detail page
 * 4. Capture expandable chunks UI
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'http://localhost:5173';
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots', 'chunks-final');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

const log = (msg, emoji = '📝') => console.log(`${emoji} ${msg}`);

async function uploadAndViewChunks() {
  const browser = await chromium.launch({ headless: false, slowMo: 500 });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  try {
    // Step 1: Upload via API (faster than UI)
    log('Step 1: Uploading document via API...', '📤');

    const testDoc = path.join(__dirname, 'test-legal-doc.txt');
    fs.writeFileSync(testDoc, `
SUPREME COURT OF THE UNITED STATES

Case No. 2024-CV-12345

ARTICLE I - JURISDICTION AND PARTIES

SECTION 1.1 - Jurisdiction
This Court has jurisdiction pursuant to 28 U.S.C. § 1331 (federal question jurisdiction).

SECTION 1.2 - Plaintiff
Jane Doe, a citizen of California, hereinafter referred to as "Plaintiff".

SECTION 1.3 - Defendant
XYZ Corporation, a Delaware corporation, hereinafter referred to as "Defendant".

ARTICLE II - STATEMENT OF FACTS

SECTION 2.1 - Background
On January 15, 2024, Plaintiff entered into an employment agreement with Defendant.

SECTION 2.2 - Breach of Contract
Defendant failed to pay the agreed-upon salary of $120,000 per annum as specified in Section 3.2 of the employment contract dated January 15, 2024.

SECTION 2.3 - Damages Incurred
As a result of Defendant's breach, Plaintiff has suffered economic damages in the amount of $30,000 representing unpaid wages for the period February 2024 through April 2024.

ARTICLE III - CAUSES OF ACTION

SECTION 3.1 - First Cause of Action: Breach of Contract
Plaintiff alleges that Defendant breached the employment contract by failing to pay salary as promised, in violation of California Labor Code § 201.

SECTION 3.2 - Second Cause of Action: Unjust Enrichment
Defendant has been unjustly enriched by receiving the benefit of Plaintiff's labor without providing the agreed-upon compensation.

SECTION 3.3 - Third Cause of Action: Violation of Wage and Hour Laws
Defendant's actions constitute willful violations of the Fair Labor Standards Act, 29 U.S.C. § 201 et seq.

ARTICLE IV - RELIEF REQUESTED

SECTION 4.1 - Monetary Damages
Plaintiff seeks compensatory damages in the amount of $30,000 for unpaid wages.

SECTION 4.2 - Punitive Damages
Plaintiff requests punitive damages in the amount of $90,000 to punish Defendant's willful conduct.

SECTION 4.3 - Attorney's Fees
Pursuant to California Labor Code § 218.5, Plaintiff requests an award of reasonable attorney's fees and costs.

SECTION 4.4 - Injunctive Relief
Plaintiff requests the Court to enjoin Defendant from further violations of labor laws.

ARTICLE V - CONCLUSION
Wherefore, Plaintiff respectfully requests that the Court grant the relief requested herein.

Dated: April 12, 2026
Respectfully submitted,
Jane Doe, Plaintiff Pro Se
    `.trim());

    // Upload via fetch API
    const formData = new FormData();
    const blob = new Blob([fs.readFileSync(testDoc)], { type: 'text/plain' });
    const file = new File([blob], 'legal-complaint.txt', { type: 'text/plain' });
    formData.append('file', file);
    formData.append('caseId', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890');

    log('Uploading file...', '⏳');
    const uploadResponse = await fetch(`${BASE_URL}/api/evidence/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!uploadResponse.ok) {
      throw new Error(`Upload failed: ${uploadResponse.status}`);
    }

    const uploadResult = await uploadResponse.json();
    const evidenceId = uploadResult.evidenceId || uploadResult.id;

    if (!evidenceId) {
      throw new Error('No evidence ID returned from upload');
    }

    log(`✅ Uploaded! Evidence ID: ${evidenceId}`, '✅');

    // Step 2: Wait for processing (poll for chunks)
    log('Step 2: Waiting for chunks to be generated...', '⏳');

    let hasChunks = false;
    let attempts = 0;
    const maxAttempts = 20;

    while (!hasChunks && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      attempts++;

      const checkResponse = await fetch(`${BASE_URL}/api/evidence/${evidenceId}`);
      if (checkResponse.ok) {
        const evidence = await checkResponse.json();
        const chunks = evidence.evidence?.metadata?.chunks || evidence.metadata?.chunks;

        if (chunks && chunks.length > 0) {
          hasChunks = true;
          log(`✅ Chunks ready! (${chunks.length} chunks)`, '🎉');
        } else {
          log(`  Attempt ${attempts}/${maxAttempts} - still processing...`, '⏳');
        }
      }
    }

    if (!hasChunks) {
      log('⚠️  Chunks not generated yet, but continuing to capture UI...', '⚠️');
    }

    // Step 3: Navigate to evidence page to view results
    log('Step 3: Navigating to evidence page...', '📍');
    await page.goto(`${BASE_URL}/evidence`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Screenshot 1: Evidence grid (should show new upload)
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01-evidence-grid.png'), fullPage: true });
    log('Screenshot 1: Evidence grid', '📸');

    // Step 4: Look for the uploaded evidence in the primary upload component
    // Check if EvidenceUploadResults is visible (might still be showing from upload)
    const resultsVisible = await page.locator('text=/chunk|ARTICLE|extractedText/i').count();

    if (resultsVisible > 0) {
      log('Results component visible on page!', '✅');

      // Screenshot 2: Results with chunks
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02-upload-results.png'), fullPage: true });
      log('Screenshot 2: Upload results', '📸');

      // Look for expandable chunks
      const chunkButtons = await page.locator('button').all();
      log(`Found ${chunkButtons.length} buttons, looking for expand controls...`, '🔍');

      for (const btn of chunkButtons.slice(0, 10)) {
        const text = await btn.textContent();
        const ariaLabel = await btn.getAttribute('aria-label');

        if (text?.includes('›') || text?.includes('▼') || ariaLabel?.toLowerCase().includes('expand')) {
          log('Found expand button, clicking...', '👆');
          await btn.click();
          await page.waitForTimeout(1000);

          // Screenshot 3: Expanded chunk
          await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03-chunk-expanded.png'), fullPage: true });
          log('Screenshot 3: Chunk expanded', '📸');
          break;
        }
      }
    } else {
      log('Results not visible, trying to view via evidence detail...', '⚠️');

      // Try clicking on the evidence item in the grid
      const evidenceCards = await page.locator('.evidence-card, [data-evidence-id], .grid > div').all();
      if (evidenceCards.length > 0) {
        log(`Found ${evidenceCards.length} evidence cards, clicking first...`, '👆');
        await evidenceCards[0].click();
        await page.waitForTimeout(2000);

        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02-evidence-detail.png'), fullPage: true });
        log('Screenshot 2: Evidence detail', '📸');
      }
    }

    log('\n✅ Test complete!', '🎉');
    log(`Screenshots: ${SCREENSHOTS_DIR}`, '📂');

    // Cleanup
    fs.unlinkSync(testDoc);

  } catch (error) {
    log(`Error: ${error.message}`, '❌');
    console.error(error);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'error.png'), fullPage: true });
  } finally {
    await page.waitForTimeout(3000);
    await browser.close();
  }
}

uploadAndViewChunks();
