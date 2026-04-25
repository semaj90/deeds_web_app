#!/usr/bin/env node

import { chromium } from 'playwright';

async function takeQuickScreenshot() {
  console.log('📸 Taking screenshots of working SvelteKit routes...');

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1920, height: 1080 });

  try {
    // Test home page
    console.log('📷 Home page...');
    await page.goto('http://127.0.0.1:5176/', { timeout: 5000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'route-home-working.png', fullPage: true });
    console.log('✅ Home page screenshot saved');

    // Test text editor
    console.log('📷 Text editor...');
    await page.goto('http://127.0.0.1:5176/text-editor', { timeout: 5000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'route-text-editor-working.png', fullPage: true });
    console.log('✅ Text editor screenshot saved');

    console.log('🎉 Screenshots complete! Server is running successfully on port 5175');
  } catch (error) {
    console.error('❌ Screenshot failed:', error.message);
  }

  await browser.close();
}

takeQuickScreenshot().catch(console.error);
