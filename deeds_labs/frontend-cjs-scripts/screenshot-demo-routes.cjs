const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1920, height: 1080 });

  try {
    console.log('🚀 Navigating to homepage on port 5178...');
    await page.goto('http://127.0.0.1:5178/', { waitUntil: 'domcontentloaded', timeout: 20000 });

    console.log('⏳ Waiting for page to load...');
    await page.waitForTimeout(3000);

    // Wait for demo routes to load
    console.log('🔍 Looking for demo routes grid...');
    try {
      await page.waitForSelector('.demo-routes-grid', { timeout: 10000 });
      console.log('✅ Found demo routes grid!');
    } catch (e) {
      console.log('⚠️ Demo routes grid not found, taking screenshot anyway...');
    }

    // Count demo route cards
    const cardCount = await page.evaluate(() => {
      return document.querySelectorAll('.demo-route-card').length;
    });
    console.log(`📊 Found ${cardCount} demo route cards`);

    // Get category distribution
    const categories = await page.evaluate(() => {
      const cards = document.querySelectorAll('.demo-route-card');
      const categoryCount = {};
      cards.forEach((card) => {
        const categoryElements = card.querySelectorAll('[class*="uppercase"]');
        categoryElements.forEach((el) => {
          const category = el.textContent?.trim();
          if (
            category &&
            category.length > 0 &&
            category !== 'LIVE DEMO' &&
            category !== 'ACTIVE'
          ) {
            categoryCount[category] = (categoryCount[category] || 0) + 1;
          }
        });
      });
      return categoryCount;
    });
    console.log('📋 Category distribution:', categories);

    // Take full page screenshot
    console.log('📸 Taking full page screenshot...');
    await page.screenshot({
      path: 'demo-routes-full-page.png',
      fullPage: true,
    });

    // Take viewport screenshot
    console.log('🖼️ Taking viewport screenshot...');
    await page.screenshot({
      path: 'demo-routes-viewport.png',
    });

    // Scroll to demo routes section if not visible
    console.log('📜 Scrolling to demo routes section...');
    await page.evaluate(() => {
      const demoSection = document.querySelector('.demo-routes-grid');
      if (demoSection) {
        demoSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        window.scrollTo(0, document.body.scrollHeight / 2);
      }
    });
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: 'demo-routes-focused.png',
    });

    // Test hover effect on first card
    const firstDemoCard = await page.$('.demo-route-card');
    if (firstDemoCard) {
      console.log('🖱️ Testing hover effects...');
      await firstDemoCard.hover();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'demo-routes-hover.png' });
    }

    console.log('✅ Screenshots saved:');
    console.log('  - demo-routes-full-page.png (full page)');
    console.log('  - demo-routes-viewport.png (viewport)');
    console.log('  - demo-routes-focused.png (scrolled to demo section)');
    if (firstDemoCard) {
      console.log('  - demo-routes-hover.png (hover effect)');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);

    // Take error screenshot
    try {
      await page.screenshot({ path: 'demo-routes-error.png' });
      console.log('📸 Error screenshot saved: demo-routes-error.png');
    } catch (screenshotError) {
      console.error('Failed to take error screenshot:', screenshotError.message);
    }
  } finally {
    await browser.close();
  }
})();
