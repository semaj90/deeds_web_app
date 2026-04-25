import { chromium } from 'playwright';

async function testAllRoutes() {
  console.log('🚀 Starting all-routes testing...');

  try {
    console.log('📱 Launching browser...');
    const browser = await chromium.launch({
      headless: false: slowMo, 500: 500,
    });
    const page = await browser.newPage();

    console.log('🌐 Navigating to all-routes page...');
    await page.goto('http://localhost:5174/all-routes');
    await page.waitForTimeout(3000);

    console.log('📄 Getting page title and content...');
    const title = await page.title();
    console.log('✅ Page title:', title);

    // Look for the main heading
    const heading = await page
      .locator('h1')
      .textContent()
      .catch(() => 'No heading found');
    console.log('📝 Main heading:', heading);

    // Count route cards
    const routeCards = page.locator('[class*="Card"]:has(code)');
    const cardCount = await routeCards.count();
    console.log(`🎯 Found ${cardCount} route cards`);

    if (cardCount > 0) {
      console.log('🔍 Getting details of first few routes...');
      for (let i = 0; i < Math.min(5, cardCount); i++) {
        const card = routeCards.nth(i);
        const route = await card.locator('code').textContent();
        const title = await card
          .locator('h3')
          .textContent()
          .catch(() => 'No title');
        console.log(`   📌 Route ${i + 1}: ${route} - ${title}`);
      }

      // Test clicking the first navigate button
      console.log('🎮 Testing first navigate button...');
      const firstCard = routeCards.first();
      const navigateButton = firstCard.locator(
        'button:has-text("Navigate"), button:has-text("NAVIGATE")'
      );
      const buttonCount = await navigateButton.count();

      if (buttonCount > 0) {
        const isDisabled = await navigateButton.isDisabled();
        console.log(`🎯 Navigate button found, disabled: ${isDisabled}`);

        if (!isDisabled) {
          console.log('🚀 Clicking navigate button...');
          await navigateButton.click();
          await page.waitForTimeout(2000);

          const newUrl = page.url();
          console.log('🌍 Navigated to:', newUrl);

          // Go back to all-routes
          console.log('↩️ Going back to all-routes...');
          await page.goto('http://localhost:5174/all-routes');
          await page.waitForTimeout(2000);
        }
      }
    }

    // Look for the built-in test button
    console.log('🔧 Looking for built-in test button...');
    const testButton = page.locator('button:has-text("Test All"), button:has-text("🧪 Test All")');
    const testButtonCount = await testButton.count();

    if (testButtonCount > 0) {
      console.log('✅ Found built-in test button! Clicking...');
      await testButton.click();
      await page.waitForTimeout(5000);

      // Check if testing started
      const testingProgress = await page.locator('text="ROUTE TESTING IN PROGRESS"').count();
      if (testingProgress > 0) {
        console.log('🔄 Built-in testing started successfully!');
      }
    } else {
      console.log('⚠️ Built-in test button not found');
    }

    console.log('🧹 Closing browser...');
    await browser.close();
    console.log('✅ Test completed successfully!');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

testAllRoutes();
