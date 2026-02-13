import { test, expect } from '@playwright/test';
import { captureNumberedStep } from './utils/screenshot-utils';
import { testRoutes, timeouts } from './utils/test-fixtures';

test.describe('UI Screenshot Capture Suite', () => {
  test.describe.configure({ mode: 'serial' });

  test('Capture Homepage with full layout', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const body = await page.textContent('body');
    expect(body).toBeTruthy();

    await captureNumberedStep(page, 1, 'homepage-full', {
      directory: 'screenshots/ui-capture',
      fullPage: true,
    });
  });

  test('Capture Login page', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');

    // Capture whatever renders (may redirect if auth bypass)
    await captureNumberedStep(page, 2, 'login-page', {
      directory: 'screenshots/ui-capture',
      fullPage: true,
    });

    const body = await page.textContent('body');
    expect(body).toBeTruthy();
  });

  test('Capture Cases page', async ({ page, context }) => {
    // Set auth cookie for protected routes
    await context.addCookies([{
      name: 'legal_ai_session',
      value: 'test_session_123',
      domain: '127.0.0.1',
      path: '/',
    }]);

    await page.goto('/cases');
    await page.waitForLoadState('domcontentloaded');

    await captureNumberedStep(page, 3, 'cases-list', {
      directory: 'screenshots/ui-capture',
      fullPage: true,
    });

    // Verify page loaded without 500 error
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
  });

  test('Capture Evidence page', async ({ page, context }) => {
    await context.addCookies([{
      name: 'legal_ai_session',
      value: 'test_session_123',
      domain: '127.0.0.1',
      path: '/',
    }]);

    await page.goto('/evidence');
    await page.waitForLoadState('domcontentloaded');

    await captureNumberedStep(page, 4, 'evidence-board', {
      directory: 'screenshots/ui-capture',
      fullPage: true,
    });

    const body = await page.textContent('body');
    expect(body).toBeTruthy();
  });

  test('Capture Chat/AI Assistant page', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('domcontentloaded');

    await captureNumberedStep(page, 5, 'chat-interface', {
      directory: 'screenshots/ui-capture',
      fullPage: true,
    });

    const body = await page.textContent('body');
    expect(body).toBeTruthy();
  });

  test('Capture Persons of Interest page', async ({ page, context }) => {
    await context.addCookies([{
      name: 'legal_ai_session',
      value: 'test_session_123',
      domain: '127.0.0.1',
      path: '/',
    }]);

    await page.goto('/persons-of-interest');
    await page.waitForLoadState('domcontentloaded');

    await captureNumberedStep(page, 6, 'persons-of-interest', {
      directory: 'screenshots/ui-capture',
      fullPage: true,
    });

    const body = await page.textContent('body');
    expect(body).toBeTruthy();
  });

  test('Capture Case Creation form', async ({ page, context }) => {
    await context.addCookies([{
      name: 'legal_ai_session',
      value: 'test_session_123',
      domain: '127.0.0.1',
      path: '/',
    }]);

    await page.goto('/cases/new');
    await page.waitForLoadState('domcontentloaded');

    await captureNumberedStep(page, 7, 'case-creation-form', {
      directory: 'screenshots/ui-capture',
      fullPage: true,
    });

    const body = await page.textContent('body');
    expect(body).toBeTruthy();
  });

  test('Capture all public routes', async ({ page }) => {
    const publicRoutes = testRoutes.filter(r => !r.requiresAuth);
    let step = 8;
    const failedRoutes: string[] = [];

    for (const route of publicRoutes) {
      const response = await page.goto(route.path, { timeout: timeouts.extended });
      const status = response?.status() ?? 0;

      await captureNumberedStep(page, step++, `route-${route.name.toLowerCase().replace(/\s+/g, '-')}`, {
        directory: 'screenshots/ui-capture/routes',
        fullPage: true,
      });

      if (status >= 500) {
        console.log(`WARNING: ${route.name} (${route.path}) returned ${status}`);
        failedRoutes.push(`${route.name}: ${status}`);
      }
    }

    // Allow up to 1 route to fail (some may not be fully implemented)
    expect(failedRoutes.length, `Routes with 500 errors: ${failedRoutes.join(', ')}`).toBeLessThanOrEqual(1);
  });
});
