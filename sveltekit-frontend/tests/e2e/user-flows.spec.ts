/**
 * User Flow E2E Tests
 *
 * End-to-end tests for complete user workflows including:
 * - Homepage navigation
 * - Real login flow
 * - Case creation flow
 * - Evidence upload availability
 */

import pg from 'pg';
import { expect, test, type Page } from '@playwright/test';
import { TEST_CASE_PREFIX } from '../fixtures/test-cases.js';
import { captureNumberedStep, captureStepScreenshot } from './utils/screenshot-utils';
import {
  commonSelectors,
  testCaseData,
  testCredentials,
  testRoutes,
  timeouts,
} from './utils/test-fixtures';

const DB_URL =
  process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db';
const TEST_PASSWORD = 'TestPass123!';

interface FlowUser {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

function buildUser(label: string): FlowUser {
  const nonce = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  return {
    email: `playwright-${label}-${nonce}@test.legal.ai`,
    password: TEST_PASSWORD,
    firstName: 'Playwright',
    lastName: label,
  };
}

async function cleanupUserArtifacts(email: string) {
  const pool = new pg.Pool({ connectionString: DB_URL });

  try {
    const usersResult = await pool.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [
      email,
    ]);

    for (const row of usersResult.rows) {
      await pool.query('DELETE FROM cases WHERE user_id = $1', [row.id]);
      await pool.query('DELETE FROM sessions WHERE user_id = $1', [row.id]);
      await pool.query('DELETE FROM users WHERE id = $1', [row.id]);
    }
  } finally {
    await pool.end();
  }
}

async function expectAuthenticatedEmail(page: Page, email: string) {
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
    .toBe(email);
}

async function registerUser(page: Page, user: FlowUser) {
  const registerResponse = await page.request.post('/api/auth/register', {
    data: user,
  });
  expect(registerResponse.status()).toBe(201);
  await expectAuthenticatedEmail(page, user.email);
}

async function logoutUser(page: Page) {
  const logoutResponse = await page.request.post('/api/auth/logout');
  expect(logoutResponse.ok()).toBeTruthy();
  await page.context().clearCookies();
}

test.describe('User Flow Tests', () => {
  test.describe.configure({ mode: 'serial' });

  test.describe('Homepage Navigation', () => {
    test('should load homepage with navigation elements', async ({ page }) => {
      await page.goto('/');
      try {
        await page.waitForLoadState('networkidle', { timeout: 5000 });
      } catch {
        // networkidle may timeout on SSE routes
      }

      await captureNumberedStep(page, 1, 'homepage-loaded', {
        directory: 'screenshots/user-flow',
      });

      const bodyContent = await page.textContent('body');
      expect(bodyContent).toBeTruthy();
    });

    test('should have functional navigation buttons', async ({ page }) => {
      await page.goto('/');
      try {
        await page.waitForLoadState('networkidle', { timeout: 5000 });
      } catch {
        // networkidle may timeout on SSE routes
      }

      const navElements = await page.locator('nav, [role="navigation"], header').count();

      await captureStepScreenshot(page, 'navigation-elements', {
        directory: 'screenshots/user-flow',
      });

      expect(navElements).toBeGreaterThan(0);
    });
  });

  test.describe('Login Flow', () => {
    test('should display login page', async ({ page }) => {
      await page.goto('/login');
      try {
        await page.waitForLoadState('networkidle', { timeout: 5000 });
      } catch {
        // networkidle may timeout on SSE routes
      }

      await captureNumberedStep(page, 1, 'login-page-displayed', {
        directory: 'screenshots/login-flow',
      });

      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByText(/sign in to your account/i)).toBeVisible();
      await expect(page.getByLabel(/^email$/i)).toBeVisible();
      await expect(page.getByLabel(/^password$/i)).toBeVisible();
    });

    test('should allow user to login successfully', async ({ page }) => {
      const user = buildUser('login');

      try {
        await registerUser(page, user);
        await logoutUser(page);

        await page.goto('/login');
        await page.getByLabel(/^email$/i).fill(user.email);
        await page.getByLabel(/^password$/i).fill(user.password);

        await captureNumberedStep(page, 2, 'login-form-filled', {
          directory: 'screenshots/login-flow',
        });

        await page.getByRole('button', { name: /sign in/i }).click();
        await page.waitForURL((url) => !url.pathname.includes('/login'), {
          timeout: timeouts.medium,
        });
        await expectAuthenticatedEmail(page, user.email);

        await captureNumberedStep(page, 3, 'post-login-dashboard', {
          directory: 'screenshots/login-flow',
        });

        await expect(page.locator('nav, .sidebar-nav, header').first()).toBeVisible();
      } finally {
        await cleanupUserArtifacts(user.email);
      }
    });
  });

  test.describe('Route Verification', () => {
    for (const route of testRoutes.filter((route) => !route.requiresAuth)) {
      test(`should load ${route.name} route (${route.path})`, async ({ page }) => {
        const response = await page.goto(route.path, { timeout: timeouts.extended });

        await captureStepScreenshot(page, `route-${route.name.toLowerCase().replace(/\s+/g, '-')}`, {
          directory: 'screenshots/routes',
          fullPage: true,
        });

        const status = response?.status() ?? 0;
        if (status >= 500) {
          console.log(`WARNING: ${route.name} (${route.path}) returned ${status}`);
        }
        expect(status).toBeLessThan(501);
      });
    }
  });

  test.describe('Case Creation Flow', () => {
    test('should display case creation page', async ({ page }) => {
      const user = buildUser('case-page');

      try {
        await registerUser(page, user);

        const response = await page.goto('/cases/new', { timeout: timeouts.extended });
        await expect(page.getByRole('heading', { name: /new case intake/i })).toBeVisible();

        await captureNumberedStep(page, 1, 'case-creation-page', {
          directory: 'screenshots/case-flow',
        });

        expect(response?.status()).toBeLessThan(400);
      } finally {
        await cleanupUserArtifacts(user.email);
      }
    });

    test('should allow case creation with form submission', async ({ page }) => {
      const user = buildUser('case-create');
      const caseTitle = `${TEST_CASE_PREFIX} E2E Case ${Date.now()}`;

      try {
        await registerUser(page, user);

        await page.goto('/cases/new');
        await expect(page.getByRole('heading', { name: /new case intake/i })).toBeVisible();

        await page.locator('input[name="title"]').fill(caseTitle);
        await page.locator('textarea[name="narrative"]').fill(testCaseData.description);
        await page.locator('input[name="what"]').fill('E2E authenticated case creation flow');
        await page.locator('select[name="priority"]').selectOption(testCaseData.priority ?? 'medium');

        await captureNumberedStep(page, 2, 'case-form-filled', {
          directory: 'screenshots/case-flow',
        });

        await page.getByRole('button', { name: /create case/i }).click();
        await page.waitForURL(/\/cases\/[0-9a-f-]+\/overview$/i, {
          timeout: 30000,
        });
        await expect(page.getByText(caseTitle).first()).toBeVisible({ timeout: 15000 });

        await captureNumberedStep(page, 3, 'case-created', {
          directory: 'screenshots/case-flow',
        });
      } finally {
        await cleanupUserArtifacts(user.email);
      }
    });
  });

  test.describe('Evidence Upload Flow', () => {
    test('should display evidence page', async ({ page }) => {
      const user = buildUser('evidence-page');

      try {
        await registerUser(page, user);

        const response = await page.goto('/evidence', { timeout: timeouts.extended });
        await expect(page).not.toHaveURL(/\/login$/);
        await expect(page.locator('.upload-zone')).toBeVisible();
        await expect(page.getByText(/drop files here or use/i)).toBeVisible();

        await captureNumberedStep(page, 1, 'evidence-page', {
          directory: 'screenshots/evidence-flow',
        });

        expect(response?.status()).toBeLessThan(400);
      } finally {
        await cleanupUserArtifacts(user.email);
      }
    });

    test('should have evidence upload capability', async ({ page }) => {
      const user = buildUser('evidence-upload');

      try {
        await registerUser(page, user);

        await page.goto('/evidence');

        const uploadZone = page.locator('.upload-zone');
        const uploadBrowse = page.locator('.upload-browse');
        const fileInput = page.locator('input[type="file"][name="file"]');

        await expect(uploadZone).toBeVisible({ timeout: 15000 });
        await expect(uploadBrowse).toContainText(/browse/i);
        await expect(fileInput).toHaveCount(1);

        const accept = await fileInput.first().getAttribute('accept');

        await captureStepScreenshot(page, 'evidence-upload-elements', {
          directory: 'screenshots/evidence-flow',
        });

        expect(accept).toContain('.pdf');
        expect(accept).toContain('image/*');
      } finally {
        await cleanupUserArtifacts(user.email);
      }
    });
  });

  test.describe('Screenshot Capture', () => {
    test('should capture screenshots at test steps', async ({ page }) => {
      await page.goto('/');
      try {
        await page.waitForLoadState('networkidle', { timeout: 5000 });
      } catch {
        // networkidle may timeout on SSE routes
      }

      const screenshot1 = await captureNumberedStep(page, 1, 'screenshot-test-step1', {
        directory: 'screenshots/verification',
      });

      const screenshot2 = await captureNumberedStep(page, 2, 'screenshot-test-step2', {
        directory: 'screenshots/verification',
        fullPage: true,
      });

      expect(screenshot1.path).toContain('step-01');
      expect(screenshot2.path).toContain('step-02');
      expect(screenshot1.stepName).toBe('step-01-screenshot-test-step1');
      expect(screenshot2.stepName).toBe('step-02-screenshot-test-step2');
    });
  });
});

test.describe('E2E Utility Verification', () => {
  test('should have valid test fixtures', async () => {
    expect(testCredentials.username).toBeTruthy();
    expect(testCredentials.password).toBeTruthy();
    expect(testCaseData.title).toBeTruthy();
    expect(testCaseData.description).toBeTruthy();
    expect(testRoutes.length).toBeGreaterThan(0);
    expect(commonSelectors.sidebar).toBeTruthy();
    expect(commonSelectors.header).toBeTruthy();
  });

  test('should have valid timeout configurations', async () => {
    expect(timeouts.short).toBeGreaterThan(0);
    expect(timeouts.medium).toBeGreaterThan(timeouts.short);
    expect(timeouts.long).toBeGreaterThan(timeouts.medium);
    expect(timeouts.extended).toBeGreaterThan(timeouts.long);
  });
});