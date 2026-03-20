import path from 'path';
import pg from 'pg';
import { expect, test } from '@playwright/test';
import { TEST_CASE_PREFIX } from './fixtures/test-cases.js';

const SCREENSHOT_DIR = path.join(process.cwd(), 'test-results', 'screenshots');
const DB_URL =
  process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db';

async function cleanupCasesPageArtifacts(email: string, caseId: string | null) {
  const pool = new pg.Pool({ connectionString: DB_URL });

  try {
    if (caseId) {
      await pool.query('DELETE FROM cases WHERE id = $1', [caseId]);
    }

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

test.describe('Cases Page CRUD', () => {
  test('authenticated create, update, and archive render back in the cases UI', async ({
    page,
  }) => {
    test.setTimeout(180000);

    const nonce = Date.now();
    const user = {
      email: `playwright-cases-page-${nonce}@test.legal.ai`,
      password: 'TestPass123!',
      firstName: 'Playwright',
      lastName: 'CasesPage',
    };
    const createdTitle = `${TEST_CASE_PREFIX} CRUD Render ${nonce}`;
    const updatedTitle = `${createdTitle} Updated`;
    let caseId: string | null = null;

    try {
      const registerRes = await page.request.post('/api/auth/register', {
        data: user,
      });
      expect(registerRes.status()).toBe(201);

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

      await page.goto('/cases');
      await expect(page.getByRole('heading', { name: 'Cases', exact: true })).toBeVisible();

      const createCaseHeading = page.locator('.cs-modal-title', { hasText: 'Create New Case' });

      await expect
        .poll(
          async () => {
            if (await createCaseHeading.count()) {
              return 'Create New Case';
            }

            for (const selector of ['.cases-new-btn', '.cs-empty-cta']) {
              const button = page.locator(selector);
              if (!(await button.count())) {
                continue;
              }

              try {
                await button.first().click();
              } catch {
                continue;
              }

              if (await createCaseHeading.count()) {
                return 'Create New Case';
              }
            }

            return '';
          },
          { timeout: 15000, intervals: [500, 1000, 1500] }
        )
        .toBe('Create New Case');
      await expect(createCaseHeading).toBeVisible();

      await page.getByLabel(/case title/i).fill(createdTitle);
      await page
        .getByLabel(/description/i)
        .fill('Playwright CRUD coverage using a real registered auth session.');
      await page.getByLabel(/priority/i).selectOption('high');
      await page.getByLabel(/case number/i).fill(`PW-${nonce}`);
      await page.getByLabel(/practice area/i).fill('Civil Litigation');
      await page.getByLabel(/jurisdiction/i).fill('Federal District Court');
      await page.getByRole('button', { name: /create case/i }).click();

      await page.waitForURL(/\/cases\/[0-9a-f-]+$/i, { timeout: 30000 });
      await expect(page.getByText(createdTitle).first()).toBeVisible();

      caseId = page.url().split('/').pop() ?? null;
      expect(caseId).toBeTruthy();

      const updateRes = await page.request.patch(`/api/cases/${caseId}`, {
        data: {
          title: updatedTitle,
          status: 'closed',
        },
      });
      expect(updateRes.ok()).toBeTruthy();

      await page.goto(`/cases?status=closed&search=${encodeURIComponent(updatedTitle)}`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.getByText(updatedTitle)).toBeVisible({ timeout: 15000 });

      const archiveRes = await page.request.delete(`/api/cases/${caseId}`);
      expect(archiveRes.ok()).toBeTruthy();

      await page.goto(`/cases?status=archived&search=${encodeURIComponent(updatedTitle)}`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.getByText(updatedTitle)).toBeVisible({ timeout: 15000 });
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'cases-crud-render-back.png'),
        fullPage: true,
      });
    } finally {
      await cleanupCasesPageArtifacts(user.email, caseId);
    }
  });
});
