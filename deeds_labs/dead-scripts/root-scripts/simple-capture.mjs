import puppeteer from 'puppeteer';

async function simpleCapture() {
  console.log('Starting browser...');

  const browser = await puppeteer.launch({
    headless: true, // Run headless for speed
    defaultViewport: { width: 1920, height: 1080 },
  });

  const page = await browser.newPage();

  try {
    console.log('Navigating to page...');
    await page.goto('http://localhost:5174/persons-of-interest', {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    console.log('Waiting 5 seconds for render...');
    await page.waitForTimeout(5000);

    console.log('Taking screenshot...');
    await page.screenshot({
      path: 'fugitivedx-screenshot.png',
      fullPage: true,
    });

    console.log('Success! Screenshot saved as fugitivedx-screenshot.png');
  } catch (error) {
    console.error('Error:', error.message);
    console.log('Attempting basic screenshot anyway...');

    try {
      await page.screenshot({
        path: 'fugitivedx-basic.png',
      });
      console.log('Basic screenshot saved as fugitivedx-basic.png');
    } catch (e) {
      console.error('Basic screenshot also failed:', e.message);
    }
  } finally {
    await browser.close();
  }
}

simpleCapture();
