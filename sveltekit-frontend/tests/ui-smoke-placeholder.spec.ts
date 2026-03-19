import { test, expect } from '@playwright/test';

test.describe('Core route smoke checks', () => {
  test('home page shows current command center shell', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.yorha-command-center')).toBeVisible();

    const signInButton = page.getByRole('button', { name: /sign in/i }).first();
    const registerButton = page.getByRole('button', { name: /register/i }).first();

    if (
      (await signInButton.count()) > 0 &&
      (await signInButton.isVisible()) &&
      (await registerButton.count()) > 0 &&
      (await registerButton.isVisible())
    ) {
      await expect(signInButton).toBeVisible();
      await expect(registerButton).toBeVisible();
    } else {
      await expect(page.locator('.sidebar-nav a').first()).toBeVisible();
    }
  });

  test('all routes directory renders', async ({ page }) => {
    await page.goto('/admin/all-routes');
    await expect(page.locator('.nes-command-center')).toBeVisible();
    await expect(page.locator('.nes-command-center .nes-header h1')).toHaveText(
      'NES COMMAND CENTER'
    );
  });

  test('evidence upload page is reachable', async ({ page }) => {
    await page.goto('/evidence/upload');
    await expect(page.locator('.upload-zone')).toBeVisible();
    await expect(page.locator('input[type="file"]')).toHaveCount(1);
  });
});
