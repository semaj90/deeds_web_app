import puppeteer from 'puppeteer';

async function testDatabaseScreenshot() {
  console.log('🚀 Starting browser for database test...');

  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1920, height: 1080 },
  });

  const page = await browser.newPage();

  try {
    console.log('🔗 Navigating to FugitiveDx page...');
    await page.goto('http://localhost:5174/persons-of-interest', {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    console.log('⏳ Waiting for database content to load...');
    await new Promise((resolve) => setTimeout(resolve, 5000));

    console.log('📸 Taking screenshots...');

    // Full page screenshot
    await page.screenshot({
      path: 'fugitivedx-database-test.png',
      fullPage: true,
    });

    // Viewport screenshot
    await page.screenshot({
      path: 'fugitivedx-database-viewport.png',
    });

    console.log('✅ Screenshots captured successfully!');
    console.log('📁 Files saved:');
    console.log('   - fugitivedx-database-test.png (full page)');
    console.log('   - fugitivedx-database-viewport.png (viewport)');

    // Try to count persons displayed
    try {
      const personCount = await page.$$eval('.person-entry', (elements) => elements.length);
      console.log(`👥 Found ${personCount} persons of interest displayed`);
    } catch (e) {
      console.log('ℹ️  Could not count person entries (normal if different selectors used)');
    }

    // Check if API data is being used
    try {
      await page.waitForSelector('[data-person-id]', { timeout: 2000 });
      console.log('✅ Database data detected - person IDs found');
    } catch (e) {
      console.log('⚠️  No database person IDs detected - may be using mock data');
    }
  } catch (error) {
    console.error('❌ Error during screenshot test:', error.message);

    // Take a screenshot anyway to see what's happening
    try {
      await page.screenshot({
        path: 'fugitivedx-error-screenshot.png',
      });
      console.log('📸 Error screenshot saved as fugitivedx-error-screenshot.png');
    } catch (e) {
      console.error('❌ Could not take error screenshot:', e.message);
    }
  } finally {
    await browser.close();
    console.log('🔒 Browser closed');
  }
}

testDatabaseScreenshot();
