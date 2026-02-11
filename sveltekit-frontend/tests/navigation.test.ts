import { test, expect } from '@playwright/test';

test('navigation links are present and functional', async ({ page }) => {
  await page.goto('/');

  const navItems = [
    { label: 'Home', path: '/' },
    { label: 'AI Assistant', path: '/ai/assistant' },
    { label: 'Evidence Board', path: '/evidence/board' },
    { label: 'Admin', path: '/admin' },
    { label: 'Login', path: '/login' },
  ];

  for (const item of navItems) {
    const link = page.locator(`a[href="${item.path}"]`);
    await expect(link).toBeVisible();
    await expect(link).toHaveText(item.label);

    // Test navigation
    await link.click();
    await expect(page).toHaveURL(new RegExp(`^${item.path}$`));
    await page.goBack(); // Go back to the home page for the next link
  }
});

test('high-priority routes are ordered correctly', async ({ page }) => {
  await page.goto('/');

  const expectedOrder = ['AI Assistant', 'Evidence Board', 'Admin', 'Home', 'Login'];
  const navLinks = await page.locator('nav ul li a').allTextContents();

  // Filter out any unexpected links and assert the order of expected links
  const orderedNavLinks = navLinks.filter((linkText) => expectedOrder.includes(linkText));
  expect(orderedNavLinks).toEqual(expectedOrder);
});
