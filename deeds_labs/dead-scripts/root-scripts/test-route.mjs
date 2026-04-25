import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err.message));
  
  try {
    await page.goto('http://localhost:5173/evidence/upload');
    console.log('Page loaded successfully');
  } catch (e) {
    console.error('Failed to load:', e.message);
  }
  
  await browser.close();
})();
