import puppeteer from 'puppeteer';

async function testDatabaseScreenshot() {
  console.log('🚀 Starting browser for database test on port 5177...');

  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1920, height: 1080 },
  });

  const page = await browser.newPage();

  try {
    console.log('🔗 Navigating to FugitiveDx page...');
    await page.goto('http://localhost:5177/persons-of-interest', {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    console.log('⏳ Waiting for database content to load...');
    await new Promise((resolve) => setTimeout(resolve, 8000)); // Longer wait for database

    console.log('📸 Taking screenshots...');

    // Full page screenshot
    await page.screenshot({
      path: 'fugitivedx-database-working.png',
      fullPage: true,
    });

    // Viewport screenshot
    await page.screenshot({
      path: 'fugitivedx-database-viewport-working.png',
    });

    console.log('✅ Screenshots captured successfully!');
    console.log('📁 Files saved:');
    console.log('   - fugitivedx-database-working.png (full page)');
    console.log('   - fugitivedx-database-viewport-working.png (viewport)');

    // Try to count persons displayed
    try {
      const personCount = await page.$$eval('[data-person-id]', (elements) => elements.length);
      console.log(`👥 Found ${personCount} persons of interest displayed`);
      if (personCount > 0) {
        console.log('✅ Database data is being rendered in the interface');
      }
    } catch (e) {
      // Try alternative selectors
      try {
        const cardCount = await page.$$eval('.person-card', (elements) => elements.length);
        console.log(`👥 Found ${cardCount} person cards displayed`);
      } catch (e2) {
        console.log('ℹ️  Using fallback method to detect content');
        const pageText = await page.evaluate(() => document.body.innerText);
        if (
          pageText.includes('Ghost') ||
          pageText.includes('Shadow') ||
          pageText.includes('threat')
        ) {
          console.log('✅ Database person names detected in page content');
        } else {
          console.log('⚠️  No specific person names detected - may need manual verification');
        }
      }
    }

    // Get page title for verification
    const title = await page.title();
    console.log(`📄 Page title: ${title}`);
  } catch (error) {
    console.error('❌ Error during screenshot test:', error.message);

    // Take a screenshot anyway to see what's happening
    try {
      await page.screenshot({
        path: 'fugitivedx-error-screenshot-5177.png',
      });
      console.log('📸 Error screenshot saved as fugitivedx-error-screenshot-5177.png');
    } catch (e) {
      console.error('❌ Could not take error screenshot:', e.message);
    }
  } finally {
    await browser.close();
    console.log('🔒 Browser closed');
  }
}

testDatabaseScreenshot();
