import { test, expect } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';

test.describe('Evidence Routes', () => {
  test('homepage loads successfully', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page).toHaveTitle(/YoRHa Legal AI|Legal AI/);
    console.log('✅ Homepage loaded');
  });

  test('evidence page loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/evidence`);
    await expect(page.locator('h1')).toContainText(/Evidence/i);
    console.log('✅ Evidence page loaded');
  });

  test('evidence upload page loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/evidence/upload`);
    await expect(page.locator('h1, h2')).toContainText(/upload|evidence/i);
    console.log('✅ Evidence upload page loaded');
  });

  test('evidence manage page loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/evidence/manage`);
    await expect(page).toHaveURL(/evidence\/manage/);
    console.log('✅ Evidence manage page loaded');
  });

  test('evidence analyze page loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/evidence/analyze`);
    await expect(page).toHaveURL(/evidence\/analyze/);
    console.log('✅ Evidence analyze page loaded');
  });
});
