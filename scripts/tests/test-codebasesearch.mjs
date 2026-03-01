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

  // Check if dialog element exists
  const dialogExists = await page.evaluate(() => {
    const dialog = document.querySelector('dialog');
    return {
      exists: !!dialog,
      tagName: dialog?.tagName,
      open: dialog?.open || false
    };
  });

  console.log('CodebaseSearch dialog:', JSON.stringify(dialogExists, null, 2));

  await page.screenshot({ path: 'command-center-step5.png', fullPage: true });
  console.log('✅ Screenshot saved');
} catch (err) {
  console.log('❌ Error:', err.message);
} finally {
  await browser.close();
}
