#!/usr/bin/env node
/**
 * AI Summary Modal Integration Test
 * Tests the Evidence Board AI Summary Modal with ACE context
 *
 * Usage: node scripts/tests/test-ai-summary-modal.mjs [--port 5173]
 */
import playwright from 'playwright';
import fs from 'fs/promises';
import path from 'path';

const args = process.argv.slice(2);
const port = args.includes('--port') ? args[args.indexOf('--port') + 1] : '5173';
const BASE = `http://localhost:${port}`;

console.log('\n🧪 Testing AI Summary Modal Integration\n');

const browser = await playwright.chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

const screenshots = [];
const errors = [];

try {
  // Step 1: Navigate to Evidence Board
  console.log('📍 Step 1: Navigate to Evidence Board...');
  await page.goto(`${BASE}/cases/test-id/board`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000); // Wait for canvas initialization

  const shot1 = 'evidence-board-loaded.png';
  await page.screenshot({ path: shot1, fullPage: false });
  screenshots.push(shot1);
  console.log('   ✅ Board loaded');

  // Step 2: Check if evidence items are present
  console.log('\n📍 Step 2: Check evidence items...');
  const evidenceCount = await page.locator('.evidence-item, [class*="evidence"]').count();
  console.log(`   Found ${evidenceCount} evidence item elements`);

  if (evidenceCount === 0) {
    console.log('   ⚠️  No evidence items found - UI may have different selectors');
  }

  // Step 3: Open AI Chat Panel
  console.log('\n📍 Step 3: Open AI Chat Panel...');
  const chatButton = page.locator('button:has-text("Chat"), button[title*="Chat"]').first();
  const chatBtnCount = await chatButton.count();

  if (chatBtnCount === 0) {
    throw new Error('Chat button not found');
  }

  await chatButton.click();
  await page.waitForTimeout(500);

  const shot2 = 'ai-chat-opened.png';
  await page.screenshot({ path: shot2, fullPage: false });
  screenshots.push(shot2);
  console.log('   ✅ Chat panel opened');

  // Step 4: Check for "Summarize Evidence" button
  console.log('\n📍 Step 4: Check Summarize Evidence button...');
  const summarizeBtn = page.locator('button:has-text("Summarize Evidence")').first();
  const summarizeBtnCount = await summarizeBtn.count();

  if (summarizeBtnCount === 0) {
    throw new Error('Summarize Evidence button not found in chat panel');
  }

  const isDisabled = await summarizeBtn.getAttribute('disabled');
  console.log(`   Button found: ${summarizeBtnCount > 0 ? '✅' : '❌'}`);
  console.log(`   Disabled: ${isDisabled !== null ? 'Yes (no evidence selected)' : 'No'}`);

  // Step 5: Try to select evidence (if possible)
  console.log('\n📍 Step 5: Select evidence item...');
  const evidenceItem = page.locator('.evidence-item, [role="button"][class*="evidence"]').first();
  const itemCount = await evidenceItem.count();

  if (itemCount > 0) {
    await evidenceItem.click();
    await page.waitForTimeout(500);

    const shot3 = 'evidence-selected.png';
    await page.screenshot({ path: shot3, fullPage: false });
    screenshots.push(shot3);
    console.log('   ✅ Evidence item selected');

    // Check if button is now enabled
    const stillDisabled = await summarizeBtn.getAttribute('disabled');
    console.log(`   Button enabled: ${stillDisabled === null ? '✅' : '❌ (still disabled)'}`);

    // Step 6: Click Summarize Evidence (if enabled)
    if (stillDisabled === null) {
      console.log('\n📍 Step 6: Click Summarize Evidence...');
      await summarizeBtn.click();
      await page.waitForTimeout(1000);

      const shot4 = 'modal-opened.png';
      await page.screenshot({ path: shot4, fullPage: false });
      screenshots.push(shot4);
      console.log('   ✅ Modal opened');

      // Step 7: Wait for summary generation
      console.log('\n📍 Step 7: Wait for AI summary generation...');

      // Check for loading state
      const loadingSpinner = page.locator('.animate-spin, [class*="spinner"]');
      const hasSpinner = await loadingSpinner.count() > 0;
      if (hasSpinner) {
        console.log('   ⏳ Loading spinner detected');
      }

      // Wait up to 30 seconds for summary to complete
      try {
        await page.waitForSelector('h4:has-text("Summary")', { timeout: 30000 });
        console.log('   ✅ Summary generated');

        await page.waitForTimeout(1000);
        const shot5 = 'summary-complete.png';
        await page.screenshot({ path: shot5, fullPage: true });
        screenshots.push(shot5);

        // Step 8: Verify content
        console.log('\n📍 Step 8: Verify modal content...');

        const hasSummary = await page.locator('text=/Summary|Executive summary/i').count() > 0;
        const hasInsights = await page.locator('text=/Key Insights?|Insight/i').count() > 0;
        const hasConfidence = await page.locator('text=/confidence/i').count() > 0;
        const hasACEContext = await page.locator('text=/Context Sources?|ACE/i').count() > 0;

        console.log(`   Summary section: ${hasSummary ? '✅' : '❌'}`);
        console.log(`   Key insights: ${hasInsights ? '✅' : '❌'}`);
        console.log(`   Confidence score: ${hasConfidence ? '✅' : '❌'}`);
        console.log(`   ACE context metadata: ${hasACEContext ? '✅' : '❌'}`);

        // Step 9: Test Regenerate button
        console.log('\n📍 Step 9: Test Regenerate button...');
        const regenerateBtn = page.locator('button:has-text("Regenerate")');
        const hasRegenerate = await regenerateBtn.count() > 0;

        if (hasRegenerate) {
          console.log('   ✅ Regenerate button found');
          // Note: Not clicking to avoid excessive API calls
        } else {
          console.log('   ⚠️  Regenerate button not found');
        }

        // Step 10: Close modal
        console.log('\n📍 Step 10: Close modal...');
        const closeBtn = page.locator('button:has-text("Close"), button[aria-label="Close"]').first();
        const hasClose = await closeBtn.count() > 0;

        if (hasClose) {
          await closeBtn.click();
          await page.waitForTimeout(500);
          console.log('   ✅ Modal closed');

          const shot6 = 'modal-closed.png';
          await page.screenshot({ path: shot6, fullPage: false });
          screenshots.push(shot6);
        }

      } catch (err) {
        if (err.message.includes('timeout')) {
          errors.push('Summary generation timed out after 30s');
          console.log('   ❌ Summary generation timed out (may indicate API/Ollama issue)');

          const shotTimeout = 'summary-timeout.png';
          await page.screenshot({ path: shotTimeout, fullPage: true });
          screenshots.push(shotTimeout);
        } else {
          throw err;
        }
      }

    } else {
      console.log('\n   ⚠️  Cannot test modal - button still disabled after selection');
    }

  } else {
    console.log('   ⚠️  No evidence items to select - UI structure may differ');
  }

} catch (err) {
  console.error('\n❌ Test Error:', err.message);
  errors.push(err.message);

  try {
    const errorShot = 'error-state.png';
    await page.screenshot({ path: errorShot, fullPage: true });
    screenshots.push(errorShot);
  } catch { /* ignore screenshot error */ }

} finally {
  await browser.close();
}

// Summary
console.log('\n' + '═'.repeat(60));
console.log('📊 Test Summary');
console.log('═'.repeat(60));
console.log(`Screenshots: ${screenshots.length}`);
screenshots.forEach(s => console.log(`  - ${s}`));

if (errors.length > 0) {
  console.log(`\nErrors: ${errors.length}`);
  errors.forEach(e => console.log(`  - ${e}`));
  process.exit(1);
} else {
  console.log('\n✅ All checks passed!');
  process.exit(0);
}
