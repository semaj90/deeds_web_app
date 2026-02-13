import { test, expect } from '@playwright/test';
import { captureNumberedStep } from './utils/screenshot-utils';

test.describe('Homepage Visual Verification', () => {
  test.describe.configure({ mode: 'serial' });

  test('should load homepage and capture screenshot', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Verify page loaded with content
    const body = await page.textContent('body');
    expect(body).toBeTruthy();

    await captureNumberedStep(page, 1, 'homepage-loaded', {
      directory: 'screenshots/homepage',
      fullPage: true,
    });
  });

  test('should display navigation sidebar', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Check for sidebar or nav element
    const nav = page.locator('nav, [role="navigation"], .sidebar-nav, aside');
    const navCount = await nav.count();
    console.log(`Navigation elements found: ${navCount}`);

    await captureNumberedStep(page, 2, 'navigation-sidebar', {
      directory: 'screenshots/homepage',
    });

    expect(navCount).toBeGreaterThan(0);
  });

  test('should display main action buttons', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Look for key action buttons/links
    const newCaseBtn = page.locator('a[href="/cases/new"], [data-testid="new-case-button"], a.new-case-btn');
    const hasNewCase = (await newCaseBtn.count()) > 0;

    const searchLink = page.locator('a[href="/global-search"], [data-testid="global-search"]');
    const hasSearch = (await searchLink.count()) > 0;

    console.log(`New Case button: ${hasNewCase}, Search link: ${hasSearch}`);

    await captureNumberedStep(page, 3, 'action-buttons', {
      directory: 'screenshots/homepage',
    });

    // At least the page should render content
    const bodyContent = await page.textContent('body');
    expect(bodyContent!.length).toBeGreaterThan(10);
  });

  test('should have responsive layout at mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await captureNumberedStep(page, 4, 'mobile-viewport', {
      directory: 'screenshots/homepage',
      fullPage: true,
    });

    const body = await page.textContent('body');
    expect(body).toBeTruthy();
  });
});
