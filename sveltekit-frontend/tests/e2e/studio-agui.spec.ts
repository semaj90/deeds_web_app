import { test, expect } from '@playwright/test';

test.describe('Parent Atlas Studio AG-UI Verification', () => {
  test('loads Studio page, shows gates, and verifies diagnostic stream', async ({ page }) => {
    page.on('console', (msg) => console.log(`[PAGE CONSOLE ${msg.type()}]:`, msg.text()));
    page.on('pageerror', (err) => console.log(`[PAGE ERROR]:`, err.message));

    await page.goto('/studio');
    await page.waitForLoadState('networkidle');

    // Verify page header and system gate cards
    const heading = page.getByRole('heading', { name: 'PARENT ATLAS STUDIO // AG-UI' });
    await expect(heading).toBeVisible();

    const drizzleBadge = page.getByText('DRIZZLE / PG18', { exact: true });
    await expect(drizzleBadge).toBeVisible();

    const aguiBadge = page.getByText('HEADLESS AG-UI', { exact: true });
    await expect(aguiBadge).toBeVisible();

    const authorityBadge = page.getByText('NOT ADMITTED', { exact: true });
    await expect(authorityBadge).toBeVisible();

    // Fill query and dispatch diagnostic run
    const queryInput = page.locator('input#query');
    await queryInput.fill('Run Playwright Diagnostic Probe');

    const submitBtn = page.getByRole('button', { name: /RUN AGENT STREAM/i });
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // Verify assistant stream response appears in output
    const assistantOutput = page.locator('text=Parent Atlas Studio // Diagnostic Agent [READ_ONLY]');
    await expect(assistantOutput).toBeVisible({ timeout: 15000 });

    const gateConfirmed = page.locator('text=All gates verified: Drizzle ORM + PostgreSQL 18 active, Prisma excluded.');
    await expect(gateConfirmed).toBeVisible({ timeout: 15000 });
  });

  test('verifies permission tier refusal gate', async ({ page }) => {
    page.on('console', (msg) => console.log(`[PAGE CONSOLE ${msg.type()}]:`, msg.text()));
    page.on('pageerror', (err) => console.log(`[PAGE ERROR]:`, err.message));

    await page.goto('/studio');
    await page.waitForLoadState('networkidle');

    // Select AUTHORITY_ADMITTED permission tier
    const select = page.locator('select#tier');
    await select.selectOption('AUTHORITY_ADMITTED');

    const queryInput = page.locator('input#query');
    await queryInput.fill('Attempt mutation run');

    const submitBtn = page.getByRole('button', { name: /RUN AGENT STREAM/i });
    await submitBtn.click();

    // Verify refusal message appears in log
    const refusalMsg = page.locator('text=WORKSPACE_NOT_ADMITTED');
    await expect(refusalMsg).toBeVisible({ timeout: 15000 });
  });
});
