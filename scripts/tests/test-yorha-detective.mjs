import playwright from 'playwright';

const browser = await playwright.chromium.launch();
const page = await browser.newPage();

page.on('console', msg => {
  const text = msg.text();
  if (text.includes('Error') || text.includes('error') || text.includes('undefined') || text.includes('props')) {
    console.log('CONSOLE:', msg.type(), text);
  }
});

page.on('pageerror', err => console.log('ERROR:', err.message));

try {
  await page.goto('http://localhost:5173/command-center', { waitUntil: 'networkidle', timeout: 15000 });
  console.log('✅ Page loaded successfully');

  await page.screenshot({ path: 'command-center-step6.png', fullPage: true });
  console.log('✅ Screenshot saved');
} catch (err) {
  console.log('❌ Error:', err.message);
} finally {
  await browser.close();
}