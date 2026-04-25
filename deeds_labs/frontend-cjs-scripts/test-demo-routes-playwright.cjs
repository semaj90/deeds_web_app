const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false }); // Set to false to see the browser
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1920, height: 1080 });

  try {
    console.log('🚀 Navigating to homepage...');
    await page.goto('http://127.0.0.1:5176/', { waitUntil: 'domcontentloaded', timeout: 15000 });

    console.log('⏳ Waiting for page to load...');
    await page.waitForTimeout(3000); // Give time for React/Svelte to render

    // Try to find demo routes grid or take screenshot anyway
    console.log('🔍 Looking for demo routes grid...');
    try {
      await page.waitForSelector('.demo-routes-grid', { timeout: 5000 });
      console.log('✅ Found demo routes grid!');
    } catch (e) {
      console.log('⚠️ Demo routes grid not found, but continuing with screenshots...');
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

    // Get sample route titles
    const sampleTitles = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.demo-route-card'));
      return cards.slice(0, 10).map((card) => {
        const titleElement = card.querySelector('h4');
        const categoryElements = card.querySelectorAll('[class*="uppercase"]');
        let category = 'Unknown';
        for (const el of categoryElements) {
          const text = el.textContent?.trim();
          if (text && text.length > 0 && text !== 'LIVE DEMO' && text !== 'ACTIVE') {
            category = text;
            break;
          }
        }
        return {
          title: titleElement ? titleElement.textContent.trim() : 'No title',
          category,
        };
      });
    });
    console.log('📝 Sample route titles:', sampleTitles);

    // Check if any demo sections exist
    const demoSections = await page.evaluate(() => {
      const sections = [];
      const interactiveSection = document.querySelector(
        'section[aria-label*="Interactive demo routes"]'
      );
      const showcaseSection = document.querySelector(
        'section[aria-label*="Demo routes and testing"]'
      );
      if (interactiveSection) sections.push('Interactive Demo Routes Grid');
      if (showcaseSection) sections.push('Demo Routes Showcase');
      return sections;
    });
    console.log('📋 Demo sections found:', demoSections);

    // Take full page screenshot
    console.log('📸 Taking full page screenshot...');
    await page.screenshot({
      path: 'playwright-homepage-full.png',
      fullPage: true,
    });

    // Take screenshot of viewport
    console.log('🖼️ Taking viewport screenshot...');
    await page.screenshot({
      path: 'playwright-homepage-viewport.png',
    });

    // Try to scroll down to find demo routes if they exist
    console.log('📜 Scrolling to find demo routes...');
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight / 2);
    });
    await page.waitForTimeout(1000);

    await page.screenshot({
      path: 'playwright-homepage-scrolled.png',
    });

    // Look for specific demo routes elements
    const demoElements = await page.evaluate(() => {
      const elements = [];

      // Look for any elements with "demo" in class or text
      const demoCards = document.querySelectorAll('[class*="demo"]');
      elements.push(`Demo cards found: ${demoCards.length}`);

      // Look for route grids
      const grids = document.querySelectorAll('[class*="grid"]');
      elements.push(`Grid elements found: ${grids.length}`);

      // Look for CardBits components
      const cardBits = document.querySelectorAll('[class*="card"]');
      elements.push(`Card elements found: ${cardBits.length}`);

      return elements;
    });
    console.log('🔍 Demo elements search:', demoElements);

    // Test hover effect if demo cards exist
    const firstDemoCard = await page.$('.demo-route-card');
    if (firstDemoCard) {
      console.log('🖱️ Testing hover effects...');
      await firstDemoCard.hover();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'playwright-hover-effect.png' });
    }

    console.log('✅ Screenshots saved:');
    console.log('  - playwright-homepage-full.png (full page)');
    console.log('  - playwright-homepage-viewport.png (viewport)');
    console.log('  - playwright-homepage-scrolled.png (scrolled view)');
    if (firstDemoCard) {
      console.log('  - playwright-hover-effect.png (hover effect)');
    }

    // Log page content structure
    const pageStructure = await page.evaluate(() => {
      const structure = [];
      const sections = document.querySelectorAll('section');
      sections.forEach((section, i) => {
        const label = section.getAttribute('aria-label') || `Section ${i + 1}`;
        const children = section.children.length;
        structure.push(`${label}: ${children} children`);
      });
      return structure;
    });
    console.log('🏗️ Page structure:', pageStructure);
  } catch (error) {
    console.error('❌ Error:', error.message);

    // Take error screenshot
    try {
      await page.screenshot({ path: 'playwright-error-screenshot.png' });
      console.log('📸 Error screenshot saved: playwright-error-screenshot.png');
    } catch (screenshotError) {
      console.error('Failed to take error screenshot:', screenshotError.message);
    }
  } finally {
    await browser.close();
  }
})();
