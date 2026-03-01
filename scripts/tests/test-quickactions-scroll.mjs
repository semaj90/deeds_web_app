import playwright from 'playwright';

const browser = await playwright.chromium.launch();
const page = await browser.newPage();

try {
  await page.goto('http://localhost:5173/command-center', { waitUntil: 'networkidle', timeout: 10000 });

  // Scroll to bottom to see QuickActions
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);

  await page.screenshot({ path: 'command-center-step4-scrolled.png', fullPage: false });
  console.log('✅ Scrolled screenshot saved');
} catch (err) {
  console.log('❌ Error:', err.message);
} finally {
  await browser.close();
}
