const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1920, height: 1080 });

  try {
    console.log('🚀 Connecting to working server on port 5180...');
    await page.goto('http://127.0.0.1:5180/', { waitUntil: 'domcontentloaded', timeout: 15000 });

    console.log('⏳ Waiting for demo routes to load...');
    await page.waitForTimeout(3000);

    // Count demo route cards
    const cardCount = await page.evaluate(() => {
      return document.querySelectorAll('.demo-route-card').length;
    });
    console.log(`📊 Found ${cardCount} demo route cards`);

    // Check if demo routes grid exists
    const hasGrid = await page.evaluate(() => {
      return !!document.querySelector('.demo-routes-grid');
    });
    console.log(`🔍 Demo routes grid exists: ${hasGrid}`);

    // Take screenshots
    await page.screenshot({
      path: 'working-demo-routes-full.png',
      fullPage: true,
    });

    await page.screenshot({
      path: 'working-demo-routes-viewport.png',
    });

    console.log('✅ Working screenshots saved:');
    console.log('  - working-demo-routes-full.png');
    console.log('  - working-demo-routes-viewport.png');
  } catch (error) {
    console.error('❌ Error:', error.message);
    await page.screenshot({ path: 'working-demo-routes-error.png' });
  } finally {
    await browser.close();
  }
})();
