import { expect, test } from '@playwright/test';

// Basic smoke test for cases page headless components

test.describe('Cases Page Headless UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/cases');
  });

  test('create case dialog opens, validates, submits, and optimistic evidence works', async ({
    page,
  }) => {
    // Open create case dialog
    await page.getByRole('button', { name: /new case/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Attempt submit empty to trigger validation
    await page.getByRole('button', { name: /create case/i }).click();
    // Expect an error message (first validation error)
    await expect(page.getByText(/required/i).first()).toBeVisible();

    // Fill required fields (best-effort selectors; adjust to real labels / placeholders)
    await page.getByLabel(/title/i).fill('Playwright Case');
    const statusTrigger = page.getByRole('button', { name: /status/i }).first();
    if (await statusTrigger.isVisible()) {
      await statusTrigger.click();
      await page.getByRole('option').first().click();
    }

    await page.getByRole('button', { name: /create case/i }).click();

    // aria-live announcement present
    await expect(page.getByText(/creating case/i)).toBeVisible();

    // Dialog closes after creation
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 10000 });

    // New case appears in list
    await expect(page.getByText('Playwright Case')).toBeVisible({ timeout: 15000 });

    // Open case (if list item clickable)
    const caseRow = page.getByText('Playwright Case').first();
    await caseRow.click({ trial: true }).catch(() => {}); // tolerate if not clickable

    // Add evidence dialog
    const addEvidenceButton = page.getByRole('button', { name: /add evidence/i }).first();
    if (await addEvidenceButton.isVisible()) {
      await addEvidenceButton.click();
      await expect(page.getByRole('dialog')).toBeVisible();
      // Fill evidence form
      const evidenceTitle = page.getByLabel(/evidence title|title/i).first();
      await evidenceTitle.fill('Initial Evidence');
      await page.getByRole('button', { name: /add evidence/i }).click();
      // aria-live for adding
      await expect(page.getByText(/adding evidence/i)).toBeVisible();
      // Optimistic evidence appears
      await expect(page.getByText('Initial Evidence')).toBeVisible({ timeout: 10000 });
    }
  });
});
