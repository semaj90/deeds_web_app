#!/usr/bin/env node

import { chromium } from 'playwright';

const urls = [
  'http://127.0.0.1:5176/',
  'http://127.0.0.1:5176/all-routes',
  'http://127.0.0.1:5176/text-editor',
];

async function takeScreenshots() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Set viewport size
  await page.setViewportSize({ width: 1920, height: 1080 });

  console.log('📸 Taking screenshots of fixed routes...');

  for (const url of urls) {
    try {
      console.log(`📷 Navigating to: ${url}`);
      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: 10000,
      });

      // Wait a bit for any dynamic content to load
      await page.waitForTimeout(2000);

      const routeName = url.split('/').pop() || 'home';
      const filename = `route-${routeName === '' ? 'home' : routeName}-fixed.png`;

      await page.screenshot({
        path: filename,
        fullPage: true,
      });

      console.log(`✅ Screenshot saved: ${filename}`);
    } catch (error) {
      console.error(`❌ Failed to screenshot ${url}:`, error.message);
    }
  }

  // Test the all-routes modal functionality
  try {
    console.log('🎯 Testing all-routes modal functionality...');
    await page.goto('http://127.0.0.1:5176/all-routes', {
      waitUntil: 'networkidle',
      timeout: 10000,
    });

    // Wait for route cards to load
    await page.waitForSelector('.bg-white.border-2.border-gray-200', { timeout: 5000 });

    // Click on the first route card to open modal
    const firstCard = await page.$('.bg-white.border-2.border-gray-200');
    if (firstCard) {
      await firstCard.click();
      await page.waitForTimeout(1000); // Wait for modal to open

      await page.screenshot({
        path: 'route-all-routes-modal-open.png',
        fullPage: true,
      });

      console.log('✅ Modal screenshot saved: route-all-routes-modal-open.png');
    }
  } catch (error) {
    console.error('❌ Failed to test modal functionality:', error.message);
  }

  await browser.close();
  console.log('🎉 Screenshot testing complete!');
}

takeScreenshots().catch(console.error);
