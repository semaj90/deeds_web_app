const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1920, height: 1080 });

  try {
    console.log('🚀 Final attempt - connecting to port 5178...');

    // Try port 5178 first, then fallback to others
    const ports = [5178, 5176, 5177, 5173];
    let successful = false;

    for (const port of ports) {
      try {
        console.log(`Trying port ${port}...`);
        await page.goto(`http://127.0.0.1:${port}/`, {
          waitUntil: 'domcontentloaded',
          timeout: 10000,
        });

        // Wait for potential content to load
        await page.waitForTimeout(3000);

        // Look for demo routes
        const demoCount = await page.evaluate(() => {
          return document.querySelectorAll('.demo-route-card').length;
        });

        console.log(`Found ${demoCount} demo route cards`);

        // Take screenshot
        await page.screenshot({
          path: `final-demo-routes.png`,
          fullPage: true,
        });

        console.log(`✅ Final screenshot saved: final-demo-routes.png`);
        successful = true;
        break;
      } catch (e) {
        console.log(`❌ Port ${port} failed: ${e.message.substring(0, 100)}`);
        continue;
      }
    }

    if (!successful) {
      console.log('⚠️ All ports failed, taking blank page screenshot...');
      await page.screenshot({ path: 'final-demo-routes.png' });
    }
  } catch (error) {
    console.error('❌ Final error:', error.message);
    await page.screenshot({ path: 'final-demo-routes.png' });
  } finally {
    await browser.close();
  }
})();
