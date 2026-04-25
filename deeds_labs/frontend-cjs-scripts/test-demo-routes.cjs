const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  try {
    console.log('🚀 Navigating to homepage...');
    await page.goto('http://localhost:5176/', { waitUntil: 'domcontentloaded', timeout: 20000 });

    // Wait for demo routes to load
    console.log('⏳ Waiting for demo routes to load...');
    await page.waitForSelector('.demo-routes-grid', { timeout: 5000 });

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
        const categoryElement = card.querySelector('[class*="uppercase"]');
        if (categoryElement) {
          const category = categoryElement.textContent.trim();
          categoryCount[category] = (categoryCount[category] || 0) + 1;
        }
      });
      return categoryCount;
    });
    console.log('📋 Category distribution:', categories);

    // Get sample route titles
    const sampleTitles = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.demo-route-card'));
      return cards.slice(0, 10).map((card) => {
        const titleElement = card.querySelector('h4');
        const categoryElement = card.querySelector('[class*="uppercase"]');
        return {
          title: titleElement ? titleElement.textContent.trim() : 'No title',
          category: categoryElement ? categoryElement.textContent.trim() : 'No category',
        };
      });
    });
    console.log('📝 Sample route titles:', sampleTitles);

    // Take screenshot of the full page
    console.log('📸 Taking full page screenshot...');
    await page.screenshot({
      path: 'homepage-demo-routes-full.png',
      fullPage: true,
    });

    // Take screenshot of just the demo routes section
    console.log('🎯 Taking demo routes section screenshot...');
    const demoSection = await page.$('.demo-routes-grid');
    if (demoSection) {
      await demoSection.screenshot({ path: 'demo-routes-grid.png' });
    }

    // Verify CardBits styling
    const cardBitsInfo = await page.evaluate(() => {
      const cards = document.querySelectorAll('.demo-route-card');
      if (cards.length === 0) return { count: 0, hasTransition: false };

      const firstCard = cards[0];
      const computedStyle = window.getComputedStyle(firstCard);
      return {
        count: cards.length,
        hasTransition: computedStyle.transition !== 'none',
        hasGradient: firstCard.classList.toString().includes('bg-gradient'),
        hasBorder: firstCard.classList.toString().includes('border'),
      };
    });
    console.log('🎨 CardBits styling info:', cardBitsInfo);

    // Check responsive grid properties
    const gridStyles = await page.evaluate(() => {
      const grid = document.querySelector('.demo-routes-grid');
      if (grid) {
        const styles = window.getComputedStyle(grid);
        return {
          display: styles.display,
          flexWrap: styles.flexWrap,
          gap: styles.gap,
          alignItems: styles.alignItems,
        };
      }
      return null;
    });
    console.log('📐 Grid styles:', gridStyles);

    // Test hover effect on first card
    console.log('🖱️ Testing hover effects...');
    const firstCard = await page.$('.demo-route-card');
    if (firstCard) {
      await firstCard.hover();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'demo-routes-hover-effect.png' });
    }

    console.log('✅ Screenshots saved:');
    console.log('  - homepage-demo-routes-full.png (full page)');
    console.log('  - demo-routes-grid.png (grid section)');
    console.log('  - demo-routes-hover-effect.png (hover effect)');
  } catch (error) {
    console.error('❌ Error:', error.message);

    // Take error screenshot
    try {
      await page.screenshot({ path: 'error-screenshot.png' });
      console.log('📸 Error screenshot saved: error-screenshot.png');
    } catch (screenshotError) {
      console.error('Failed to take error screenshot:', screenshotError.message);
    }
  } finally {
    await browser.close();
  }
})();
