
import { expect, test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { TEST_CASE_PREFIX } from './fixtures/test-cases.js';

const DATA_SCREENSHOT_DIR = path.join(process.cwd(), 'tests', 'screenshots', 'user-flow');
const DB_URL =
  process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db';

if (!fs.existsSync(DATA_SCREENSHOT_DIR)) {
  fs.mkdirSync(DATA_SCREENSHOT_DIR, { recursive: true });
}

function ensureDummyEvidenceFile() {
  const dummyFile = path.join(process.cwd(), 'tests', 'scripts', 'dummy.txt');
  if (!fs.existsSync(path.dirname(dummyFile))) {
    fs.mkdirSync(path.dirname(dummyFile), { recursive: true });
  }
  if (!fs.existsSync(dummyFile)) {
    fs.writeFileSync(dummyFile, 'This is a test evidence file content.');
  }
  return dummyFile;
}

async function cleanupFullFlowArtifacts(email: string, caseTitle: string) {
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

test.describe('YoRHa Detective User Flow Verification', () => {
  test('authenticated homepage, case intake, and navigation work without dev bypass', async ({
    page,
  }) => {
    test.setTimeout(180000);

    const nonce = Date.now();
    const user = {
      email: `playwright-fullflow-${nonce}@test.legal.ai`,
      password: 'TestPass123!',
      firstName: 'Playwright',
      lastName: 'FullFlow',
    };
    const caseTitle = `${TEST_CASE_PREFIX} Full Flow ${nonce}`;

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

      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');
      await expect(page.getByRole('heading', { name: /command center/i })).toBeVisible();

      const newCaseBtn = page.locator('a.new-case-btn[href="/cases/new"]').first();
      await expect(newCaseBtn).toBeVisible({ timeout: 10000 });
      await expect(newCaseBtn).toHaveAttribute('href', '/cases/new');
      await expect(page.locator('.sidebar-nav a[href="/evidence"]').first()).toBeVisible();
      await expect(page.locator('.sidebar-nav a[href="/global-search"]').first()).toBeVisible();
      await expect(page.locator('.sidebar-nav a[href="/chat"]').first()).toBeVisible();
      await page.screenshot({
        path: path.join(DATA_SCREENSHOT_DIR, '01-authenticated-homepage.png'),
      });

      await page.goto('/cases/new');
      await expect(page.getByRole('heading', { name: /new case intake/i })).toBeVisible();
      await page.screenshot({ path: path.join(DATA_SCREENSHOT_DIR, '02-new-case-page.png') });

      await page.locator('input[name="title"]').fill(caseTitle);
      await page
        .locator('textarea[name="narrative"]')
        .fill('This is an authenticated non-bypass full user flow covering case intake.');
      await page.locator('input[name="who"]').fill('Playwright FullFlow User');
      await page
        .locator('input[name="what"]')
        .fill('Testing authenticated case intake and navigation.');
      await page.locator('input[name="when"]').fill('March 19, 2026');
      await page.locator('input[name="where"]').fill('Automated Playwright run');
      await page.locator('select[name="priority"]').selectOption('high');

      const dummyFile = ensureDummyEvidenceFile();
      const fileInput = page.locator('#file-upload-input');
      await fileInput.setInputFiles(dummyFile);
      await expect
        .poll(async () => {
          return fileInput.evaluate((element) => {
            const input = element as HTMLInputElement;
            return input.files?.[0]?.name ?? '';
          });
        })
        .toBe('dummy.txt');
      await page.screenshot({ path: path.join(DATA_SCREENSHOT_DIR, '03-evidence-uploaded.png') });

      await page.getByRole('button', { name: /create case/i }).click();
      await page.waitForURL(/\/cases\/[0-9a-f-]+\/overview$/i, { timeout: 30000 });
      await expect(page.getByText(caseTitle).first()).toBeVisible({ timeout: 15000 });
      await page.screenshot({ path: path.join(DATA_SCREENSHOT_DIR, '04-case-overview.png') });

      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator('.sidebar-nav a[href="/evidence"]').first()).toBeVisible();
      await expect(page.locator('.sidebar-nav a[href="/global-search"]').first()).toBeVisible();
      await expect(page.locator('.sidebar-nav a[href="/chat"]').first()).toBeVisible();
      await page.screenshot({ path: path.join(DATA_SCREENSHOT_DIR, '05-sidebar-verified.png') });
    } finally {
      await cleanupFullFlowArtifacts(user.email, caseTitle);
    }
  });
});
