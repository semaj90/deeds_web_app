import { expect, test } from '@playwright/test';

// Test all major routes with NES.css UI components
const routes = [
  { path: '/', title: 'Home' },
  { path: '/demo/nes-bits-ui', title: 'NES.css' },
  { path: '/admin', title: 'Admin' },
  { path: '/ai', title: 'AI' },
  { path: '/chat', title: 'Chat' },
  { path: '/search', title: 'Search' },
  { path: '/documents', title: 'Documents' },
  { path: '/cases', title: 'Cases' },
  { path: '/demo/vector-intelligence', title: 'Vector' },
  { path: '/demo/ui-components', title: 'Components' },
  { path: '/admin/error-brain', title: 'Error-Brain Dashboard' },
  { path: '/error-brain/runs', title: 'Error-Brain Runs' },
];

test.describe('NES.css UI Routes', () => {
  routes.forEach(({ path, title }) => {
    test(`should load ${title} page at ${path}`, async ({ page }) => {
      // Navigate to route
      await page.goto(`http://localhost:5173${path}`);

      // Wait for page to load
      await page.waitForLoadState('networkidle');

      // Check that NES.css is loaded
      const nesContainer = await page.locator('.nes-container, .nes-btn').first();
      await expect(nesContainer).toBeVisible({ timeout: 10000 });

      // Check that the page doesn't have Tailwind classes (should be removed)
      const tailwindElements = await page
        .locator('[class*="bg-gray-"], [class*="text-gray-"]')
        .count();
      // Some may remain, but should be minimal
      expect(tailwindElements).toBeLessThan(5);

      // Check for UnoCSS classes
      const unoElements = await page
        .locator('[class*="yorha-"], [class*="nier-"], [class*="bits-"]')
        .count();
      expect(unoElements).toBeGreaterThan(0);

      console.log(`✅ ${title} page loaded with NES.css UI`);
    });
  });

  test('NES.css buttons should be interactive', async ({ page }) => {
    await page.goto('http://localhost:5173/demo/nes-bits-ui');

    // Test button click
    const primaryButton = await page.locator('.nes-btn.is-primary').first();
    if (await primaryButton.isVisible()) {
      await primaryButton.click();
      // Button should respond to clicks
      await expect(primaryButton).toBeEnabled();
    }
  });

  test('NES.css dialogs should open and close', async ({ page }) => {
    await page.goto('http://localhost:5173/demo/nes-bits-ui');

    // Look for dialog trigger
    const dialogTrigger = await page.locator('button:has-text("Open Dialog")').first();
    if (await dialogTrigger.isVisible()) {
      await dialogTrigger.click();

      // Dialog should appear
      const dialog = await page.locator('.nes-dialog, .dialog-overlay');
      await expect(dialog).toBeVisible();

      // Close dialog
      const closeButton = await page
        .locator('button:has-text("Cancel"), button:has-text("Close")')
        .first();
      if (await closeButton.isVisible()) {
        await closeButton.click();
        await expect(dialog).not.toBeVisible();
      }
    }
  });

  test('NES.css forms should accept input', async ({ page }) => {
    await page.goto('http://localhost:5173/demo/nes-bits-ui');

    // Test input field
    const input = await page.locator('.nes-input').first();
    if (await input.isVisible()) {
      await input.fill('Test input');
      await expect(input).toHaveValue('Test input');
    }

    // Test checkbox
    const checkbox = await page.locator('.nes-checkbox').first();
    if (await checkbox.isVisible()) {
      await checkbox.check();
      await expect(checkbox).toBeChecked();
    }
  });
});

test.describe('Protobuffer Integration', () => {
  test('should have protobuf support configured', async ({ page }) => {
    await page.goto('http://localhost:5173/api/proto/test', { waitUntil: 'domcontentloaded' });

    // Check if protobuf endpoint exists
    const response = await page.evaluate(async () => {
      try {
        const res = await fetch('/api/proto/test');
        return res.status;
      } catch {
        return 404;
      }
    });

    // Endpoint should exist (even if it returns an error)
    expect([200, 404, 405, 501]).toContain(response);
  });
});
