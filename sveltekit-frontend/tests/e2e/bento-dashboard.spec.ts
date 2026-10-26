import { expect, test } from '@playwright/test';

test.describe('Bento dashboard prototype', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (error) => console.error(`[bento pageerror] ${error.stack ?? error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') console.error(`[bento console] ${message.text()}`);
    });
    page.on('requestfailed', (request) => console.error(`[bento requestfailed] ${request.url()} ${request.failure()?.errorText ?? ''}`));
    const response = await page.goto('/demos/bento-dashboard');
    expect(response, 'Dashboard navigation should return a document response').not.toBeNull();
    expect(response!.status(), 'Dashboard route must not return a server error').toBeLessThan(500);
  });

  test('renders the dashboard and routes quick actions to existing workflows', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Intelligence Nexus' })).toBeVisible();
    await expect(page.getByRole('link', { name: /New Investigation/ })).toHaveAttribute('href', '/cases/new');
    await expect(page.getByRole('link', { name: /Ingest Evidence/ })).toHaveAttribute('href', '/evidence/upload');
    await page.screenshot({ path: 'test-results/bento-dashboard.png', fullPage: true });
  });

  test('filters local demo results and reports an empty search clearly', async ({ page }) => {
    const search = page.getByPlaceholder('Search statutes, precedents, or cases...');
    await expect(page.getByRole('heading', { name: '18 U.S.C. § 1001' })).toBeVisible();

    await search.fill('Miranda');
    await expect(page.getByRole('heading', { name: 'Miranda v. Arizona' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '18 U.S.C. § 1001' })).toHaveCount(0);

    await search.fill('no matching demo item');
    await expect(page.getByRole('status')).toContainText('No demo results match');
  });

  test('prepares a local draft, clears it, and toggles the generator', async ({ page }) => {
    await page.getByRole('button', { name: 'Prepare Draft' }).click();
    await expect(page.getByRole('alert')).toContainText('Add notes');

    await page.getByPlaceholder('Paste raw data for extraction...').fill('Witness interview\nA witness observed the event.');
    await page.getByRole('button', { name: 'Prepare Draft' }).click();
    await expect(page.getByRole('status')).toContainText('nothing has been saved');
    await expect(page.getByLabel('Title')).toHaveValue('Witness interview');
    await expect(page.getByLabel('What')).toHaveValue('Witness interview\nA witness observed the event.');

    await page.getByRole('button', { name: 'Clear draft' }).click();
    await expect(page.getByPlaceholder('Paste raw data for extraction...')).toHaveValue('');
    await expect(page.getByRole('status')).toHaveCount(0);

    const collapse = page.getByRole('button', { name: 'Collapse use case generator' });
    await collapse.click();
    await expect(page.getByPlaceholder('Paste raw data for extraction...')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Expand use case generator' })).toHaveAttribute('aria-expanded', 'false');
  });

  test('keeps the bento grid responsive at mobile and desktop widths', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileColumns = await page.locator('.bento-grid').evaluate((element) => getComputedStyle(element).gridTemplateColumns);
    expect(mobileColumns.trim().split(/\s+/)).toHaveLength(1);

    await page.setViewportSize({ width: 1280, height: 800 });
    const desktopColumns = await page.locator('.bento-grid').evaluate((element) => getComputedStyle(element).gridTemplateColumns);
    expect(desktopColumns.trim().split(/\s+/)).toHaveLength(6);
  });
});
