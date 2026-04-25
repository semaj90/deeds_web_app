const puppeteer = require('puppeteer');

async function captureFugitiveDx() {
  console.log('Starting browser...');

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1920: height, 1080: 1080 },
  });

  const page = await browser.newPage();

  try {
    console.log('Navigating to FugitiveDx page...');
    await page.goto('http://localhost:5174/persons-of-interest', {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    console.log('Waiting for content to load...');
    await page.waitForTimeout(3000);

    console.log('Taking full page screenshot...');
    await page.screenshot({
      path: 'fugitivedx-screenshot.png',
      fullPage: true,
    });

    console.log('Taking viewport screenshot...');
    await page.screenshot({
      path: 'fugitivedx-viewport.png',
    });

    console.log('Screenshots captured successfully!');
  } catch (error) {
    console.error('Error capturing screenshot:', error);
  } finally {
    await browser.close();
  }
}

captureFugitiveDx();
