import playwright from 'playwright';

const browser = await playwright.chromium.launch();
const page = await browser.newPage();

page.on('console', msg => {
  const text = msg.text();
  if (text.includes('Error') || text.includes('error') || text.includes('undefined')) {
    console.log('CONSOLE:', msg.type(), text);
  }
});

page.on('pageerror', err => console.log('ERROR:', err.message));

try {
  await page.goto('http://localhost:5173/command-center', { waitUntil: 'networkidle', timeout: 10000 });
  console.log('✅ Page loaded successfully');

  // Check QuickActions rendered
  const quickActionsExists = await page.evaluate(() => {
    const panel = document.querySelector('.quick-actions-panel');
    if (!panel) return { error: 'No .quick-actions-panel found' };

    const buttons = panel.querySelectorAll('.action-button');
    return {
      exists: true,
      buttonCount: buttons.length,
      labels: Array.from(buttons).map(b => b.querySelector('.action-label')?.textContent)
    };
  });

  console.log('QuickActions:', JSON.stringify(quickActionsExists, null, 2));

  await page.screenshot({ path: 'command-center-step4.png', fullPage: true });
  console.log('✅ Screenshot saved');
} catch (err) {
  console.log('❌ Error:', err.message);
} finally {
  await browser.close();
}
