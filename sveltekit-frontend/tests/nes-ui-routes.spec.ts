import { expect, test, type Page } from '@playwright/test';

type RouteCheck = {
  path: string;
  title: string;
  check: (page: Page) => Promise<void>;
};

const routes: RouteCheck[] = [
  {
    path: '/',
    title: 'Home command center',
    check: async (page) => {
      await expect(page.locator('.yorha-command-center')).toBeVisible();
      await expect(page.locator('.yorha-command-center .sidebar-nav').first()).toBeVisible();
    },
  },
  {
    path: '/demos/bits-ui',
    title: 'Bits UI demo',
    check: async (page) => {
      await expect(
        page.getByRole('heading', { name: /legal ai platform - bits-ui components/i })
      ).toBeVisible();
      await expect(page.getByRole('button', { name: /create new case/i })).toBeVisible();
      await expect(page.getByText('bits-ui v2.16.2', { exact: true })).toBeVisible();
    },
  },
  {
    path: '/admin/all-routes',
    title: 'All routes command center',
    check: async (page) => {
      await expect(page.locator('.nes-command-center')).toBeVisible();
      await expect(page.locator('.nes-command-center .nes-header h1')).toHaveText(
        'NES COMMAND CENTER'
      );
    },
  },
  {
    path: '/evidence/upload',
    title: 'Evidence upload',
    check: async (page) => {
      await expect(page.locator('.upload-zone')).toBeVisible();
      await expect(page.locator('input[type="file"]')).toHaveCount(1);
    },
  },
];

test.describe('Current Stack UI Routes', () => {
  routes.forEach(({ path, title, check }) => {
    test(`should load ${title} at ${path}`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('domcontentloaded');
      await check(page);
    });
  });

  test('Bits UI dialog opens and closes with current headless primitives', async ({ page }) => {
    await page.goto('/demos/bits-ui');
    await page.waitForLoadState('domcontentloaded');

    await page.getByRole('button', { name: /create new case/i }).click();

    const dialog = page.locator('[role="dialog"]').first();
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Create New Legal Case');

    await dialog.getByRole('button', { name: /cancel/i }).click();
    await expect(dialog).not.toBeVisible();
  });

  test('Bits UI demo renders UnoCSS and modern component status cards', async ({ page }) => {
    await page.goto('/demos/bits-ui');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.locator('[class*="bg-yorha-bg-primary"]')).toBeVisible();
    await expect(page.getByText('Latest headless primitives')).toBeVisible();
    await expect(
      page.locator('input[placeholder*="Search"], input[placeholder*="Enter case name"]').first()
    ).toBeVisible();
  });
});
