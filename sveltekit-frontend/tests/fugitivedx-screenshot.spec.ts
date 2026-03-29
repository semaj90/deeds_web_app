import { test } from '@playwright/test';

test('FugitiveDx Screenshot', async ({ page }) => {
  // Navigate to the persons of interest page using direct URL
  await page.goto('/persons-of-interest');

  // Wait for the page to load completely
  await page.waitForLoadState('networkidle');

  // Wait for JavaScript to load and render
  await page.waitForTimeout(3000);

  // Take a full page screenshot
  await page.screenshot({
    path: 'fugitivedx-screenshot.png',
    fullPage: true,
  });

  // Try to find the main layout and take a screenshot if it exists
  const mainLayout = page.locator('.main-layout');
  if ((await mainLayout.count()) > 0) {
    await mainLayout.screenshot({
      path: 'fugitivedx-main-layout.png',
    });
  }

  console.log('Screenshot captured successfully');
});
