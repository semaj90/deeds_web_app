import { chromium } from '@playwright/test';

async function testApp() {
  const browserInstance = await chromium.launch({ headless: false });
  const context = await browserInstance.newContext();
  const page = await context.newPage();

  console.log('🔍 Navigating to app...');
  await page.goto('http://localhost:5174');

  // Wait for page to load
  await page.waitForTimeout(2000);

  // Take screenshot
  await page.screenshot({ path: 'debug-homepage.png' });

  // Check title and content
  const title = await page.title();
  const bodyText = await page.textContent('body');

  console.log('📄 Page title:', title);
  console.log('📝 Body text (first 200 chars):', bodyText?.substring(0, 200));

  // Check for error messages
  const errorElements = await page.locator('text=Error').count();
  const errorText = await page.locator('text=Internal Error').count();

  console.log('❌ Error elements found:', errorElements);
  console.log('🔴 Internal Error text found:', errorText);

  // Check console errors
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.log('🚨 Console error:', msg.text());
    }
  });

  // Wait for any errors to appear
  await page.waitForTimeout(3000);

  await browserInstance.close();
}

testApp().catch(console.error);
