import playwright from 'playwright';

const browser = await playwright.chromium.launch();
const page = await browser.newPage();

try {
  await page.goto('http://localhost:5173/command-center', { waitUntil: 'networkidle', timeout: 10000 });

  await page.screenshot({ path: 'command-center-step4-FULL.png', fullPage: true });
  console.log('✅ Full page screenshot saved');

  // Also get bounding box of QuickActions to see where it is
  const qaPosition = await page.evaluate(() => {
    const panel = document.querySelector('.quick-actions-panel');
    if (!panel) return null;
    const rect = panel.getBoundingClientRect();
    return {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      bottom: rect.bottom
    };
  });

  console.log('QuickActions position:', JSON.stringify(qaPosition, null, 2));
} catch (err) {
  console.log('❌ Error:', err.message);
} finally {
  await browser.close();
}