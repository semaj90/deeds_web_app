const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1920, height: 1080 });

  try {
    console.log('🚀 Attempting to connect to different ports...');

    const ports = [5173, 5174, 5175, 5176, 5177, 5178];
    let successful = false;

    for (const port of ports) {
      try {
        console.log(`Trying port ${port}...`);
        await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle', timeout: 5000 });

        // Wait a moment for content to load
        await page.waitForTimeout(2000);

        // Take screenshot regardless of content
        await page.screenshot({
          path: `demo-routes-port-${port}.png`,
          fullPage: true,
        });

        console.log(`✅ Screenshot saved: demo-routes-port-${port}.png`);
        successful = true;
        break;
      } catch (e) {
        console.log(`❌ Port ${port} failed: ${e.message}`);
        continue;
      }
    }

    if (!successful) {
      console.log('⚠️ No ports responded, taking blank screenshot...');
      await page.screenshot({ path: 'demo-routes-no-server.png' });
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    await page.screenshot({ path: 'demo-routes-final-error.png' });
  } finally {
    await browser.close();
  }
})();
