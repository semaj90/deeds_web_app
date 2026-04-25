#!/usr/bin/env node

import { chromium } from 'playwright';

async function finalTest() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    console.log('📷 Testing all-routes functionality...');
    await page.goto('http://127.0.0.1:5176/all-routes', { timeout: 15000 });
    await page.waitForTimeout(3000);

    // Take screenshot of the main page
    await page.screenshot({ path: 'route-all-routes-final.png', fullPage: true });
    console.log('✅ All-routes final screenshot saved');
  } catch (error) {
    console.error('❌ Failed:', error.message);
  }

  await browser.close();
}

finalTest().catch(console.error);
