#!/usr/bin/env node

/**
 * Take screenshots of report UI/UX
 * Captures all report pages for documentation
 */

import { chromium } from 'playwright';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
const SCREENSHOT_DIR = './screenshots/reports';
const TEST_CASE_ID = '5814dc72-fe7e-49ab-b5d2-ff22f2e40ff1';

// Ensure screenshot directory exists
if (!existsSync(SCREENSHOT_DIR)) {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function takeScreenshot(page, name, options = {}) {
  const path = join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({
    path,
    fullPage: options.fullPage || false,
    ...options
  });
  console.log(`📸 Saved: ${name}.png`);
}

async function run() {
  console.log('\n📸 Taking Report UI Screenshots...\n');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  try {
    // 1. Reports Listing Page
    console.log('1️⃣  Reports Listing Page');
    await page.goto(`${BASE_URL}/reports`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(1000); // Let content settle
    await takeScreenshot(page, '01-reports-listing', { fullPage: true });

    // 2. Report Creation Wizard
    console.log('2️⃣  Report Creation Wizard');
    await page.goto(`${BASE_URL}/reports/new?caseId=${TEST_CASE_ID}`, {
      waitUntil: 'networkidle',
      timeout: 10000
    });
    await page.waitForTimeout(1000);
    await takeScreenshot(page, '02-report-creation-wizard', { fullPage: true });

    // 3. Report Creation Wizard - With Title Filled
    console.log('3️⃣  Creation Wizard - Filled Form');
    await page.fill('input[type="text"]', 'Sample Charging Memorandum');
    await page.waitForTimeout(500);
    await takeScreenshot(page, '03-creation-wizard-filled', { fullPage: true });

    // 4. Report Creation Wizard - Different Report Type Selected
    console.log('4️⃣  Creation Wizard - Discovery List Selected');
    const discoveryButton = await page.locator('button:has-text("Discovery List")').first();
    if (await discoveryButton.isVisible()) {
      await discoveryButton.click();
      await page.waitForTimeout(500);
      await takeScreenshot(page, '04-creation-wizard-discovery-list', { fullPage: true });
    }

    // 5. Create a test report for viewing
    console.log('5️⃣  Creating test report...');
    const createResponse = await page.evaluate(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId: '5814dc72-fe7e-49ab-b5d2-ff22f2e40ff1',
          title: 'Screenshot Test Report',
          contentHtml: '<h1>Sample Report</h1><p>This is a test report for screenshot purposes.</p><h2>Analysis</h2><p>Sample content here...</p>',
          status: 'draft',
          metadata: { reportType: 'summary', automated: true }
        })
      });
      const data = await res.json();
      return data.data?.id;
    }, BASE_URL);

    if (createResponse) {
      console.log(`   Created report ID: ${createResponse}`);

      // 6. Report View Page
      console.log('6️⃣  Report View Page');
      await page.goto(`${BASE_URL}/reports/${createResponse}`, {
        waitUntil: 'networkidle',
        timeout: 10000
      });
      await page.waitForTimeout(1000);
      await takeScreenshot(page, '05-report-view', { fullPage: true });

      // 7. Report View - Export Menu (if visible)
      console.log('7️⃣  Report View - Export Options');
      const exportButton = await page.locator('button:has-text("Export")').first();
      if (await exportButton.isVisible()) {
        await exportButton.click();
        await page.waitForTimeout(500);
        await takeScreenshot(page, '06-report-view-export-menu');
      }

      // 8. Report Editor Page
      console.log('8️⃣  Report Editor');
      await page.goto(`${BASE_URL}/reports/${createResponse}/edit`, {
        waitUntil: 'networkidle',
        timeout: 10000
      });
      await page.waitForTimeout(2000); // Let TipTap editor load
      await takeScreenshot(page, '07-report-editor', { fullPage: true });

      // 9. Report Editor - AI Assistant (if visible)
      console.log('9️⃣  Report Editor - AI Assistant');
      const aiButton = await page.locator('button:has-text("AI")').first();
      if (await aiButton.isVisible()) {
        await aiButton.click();
        await page.waitForTimeout(500);
        await takeScreenshot(page, '08-report-editor-ai-assistant');
      }

      // 10. Case Reports Tab
      console.log('🔟 Case Reports Tab');
      await page.goto(`${BASE_URL}/cases/${TEST_CASE_ID}/reports`, {
        waitUntil: 'networkidle',
        timeout: 10000
      });
      await page.waitForTimeout(1000);
      await takeScreenshot(page, '09-case-reports-tab', { fullPage: true });

      // Cleanup - Delete test report
      console.log('\n🧹 Cleaning up...');
      await page.evaluate(async (baseUrl, reportId) => {
        await fetch(`${baseUrl}/api/reports`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [reportId] })
        });
      }, BASE_URL, createResponse);
      console.log('   Test report deleted');
    }

    console.log('\n✅ All screenshots captured!');
    console.log(`📁 Location: ${SCREENSHOT_DIR}/`);

  } catch (error) {
    console.error('\n❌ Error taking screenshots:');
    console.error(error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run();
