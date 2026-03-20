
import { expect, test } from '@playwright/test';
import pg from 'pg';
import { TEST_CASE_PREFIX } from './fixtures/test-cases.js';

const DB_URL =
  process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db';

async function cleanupNonBypassArtifacts(email: string, caseTitle: string) {
  const pool = new pg.Pool({ connectionString: DB_URL });

  try {
    await pool.query('DELETE FROM cases WHERE title = $1', [caseTitle]);

    const usersResult = await pool.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [
      email,
    ]);
    for (const row of usersResult.rows) {
      await pool.query('DELETE FROM sessions WHERE user_id = $1', [row.id]);
      await pool.query('DELETE FROM users WHERE id = $1', [row.id]);
    }
  } finally {
    await pool.end();
  }
}

test.describe('User Case Creation', () => {
  test('registers, logs in again, and creates a case without dev bypass', async ({ page }) => {
    const nonce = Date.now();
    const user = {
      email: `playwright-nonbypass-${nonce}@test.legal.ai`,
      password: 'TestPass123!',
      firstName: 'Playwright',
      lastName: 'NonBypass',
    };
    const caseTitle = `${TEST_CASE_PREFIX} Non-Bypass Create ${nonce}`;

    try {
      await page.goto('/register');
      await page.getByLabel(/first name/i).fill(user.firstName);
      await page.getByLabel(/last name/i).fill(user.lastName);
      await page.getByLabel(/^email$/i).fill(user.email);
      await page.getByLabel(/^password$/i).fill(user.password);
      await page.getByLabel(/confirm password/i).fill(user.password);
      await page.getByRole('button', { name: /create account/i }).click();

      await expect
        .poll(
          async () => {
            const meResponse = await page.request.get('/api/auth/me');
            if (meResponse.status() !== 200) return '';
            const body = await meResponse.json();
            return body.user?.email ?? '';
          },
          { timeout: 15000 }
        )
        .toBe(user.email);

      const logoutResponse = await page.request.post('/api/auth/logout');
      expect(logoutResponse.ok()).toBeTruthy();
      await page.context().clearCookies();

      await page.goto('/login');
      await page.getByLabel(/^email$/i).fill(user.email);
      await page.getByLabel(/^password$/i).fill(user.password);
      await page.getByRole('button', { name: /sign in/i }).click();

      await expect
        .poll(
          async () => {
            const meResponse = await page.request.get('/api/auth/me');
            if (meResponse.status() !== 200) return '';
            const body = await meResponse.json();
            return body.user?.email ?? '';
          },
          { timeout: 15000 }
        )
        .toBe(user.email);

      await page.goto('/cases/new');
      await expect(page.getByRole('heading', { name: /new case intake/i })).toBeVisible();
      await page.locator('input[name="title"]').fill(caseTitle);
      await page
        .locator('textarea[name="narrative"]')
        .fill('Playwright non-bypass flow verifying registration, login, and case creation.');
      await page
        .locator('input[name="what"]')
        .fill('Registered user creates a new case after logging back in.');
      await page.locator('select[name="priority"]').selectOption('high');
      await page.getByRole('button', { name: /create case/i }).click();

      await page.waitForURL(/\/cases\/[0-9a-f-]+\/overview$/i, { timeout: 30000 });
      await expect(page.getByText(caseTitle).first()).toBeVisible({ timeout: 15000 });

      await page.goto(`/cases?search=${encodeURIComponent(caseTitle)}`);
      await expect(page.getByText(caseTitle)).toBeVisible({ timeout: 15000 });
    } finally {
      await cleanupNonBypassArtifacts(user.email, caseTitle);
    }
  });
});
