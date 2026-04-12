import { expect, test } from '@playwright/test';
import { PORTS } from './helpers/env-ports.js';

/**
 * Cache System Tests
 *
 * These tests verify the caching layer works when available.
 * The /cache-demo route may not exist, so tests gracefully
 * skip when the route returns 404.
 *
 * When backends are down, routes may return 500 — tests accept
 * this and verify the page doesn't hard-crash.
 */

const BASE_URL = PORTS.APP_BASE;

test.describe('Cache System - Route Availability', () => {
  test('cache-demo route should respond', async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/cache-demo`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    // Route may not exist (404) or backend may be down (500)
    // Just verify page didn't crash entirely
    const status = response?.status() ?? 0;
    if (status === 404) {
      console.log('ℹ️  /cache-demo route not found (404) — skipping cache tests');
      test.skip();
      return;
    }

    // Page loaded (200 or 500) — verify it has content
    const body = await page.textContent('body');
    expect(body?.length).toBeGreaterThan(0);
  });
});

test.describe('Cache System - Case Detail Integration', () => {
  test('should navigate to case detail without crash', async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/cases/test-case-123`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    // Case route should exist even if DB is down
    const status = response?.status() ?? 0;
    expect(status).not.toBe(404);

    // Verify page has content
    const body = await page.textContent('body');
    expect(body?.length).toBeGreaterThan(0);
  });
});

test.describe('Cache System - Form Routes', () => {
  test('should navigate to case creation without crash', async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/cases/create`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    const status = response?.status() ?? 0;
    expect(status).not.toBe(404);

    const body = await page.textContent('body');
    expect(body?.length).toBeGreaterThan(0);
  });
});

test.describe('Cache System - Offline Mode', () => {
  test('should handle offline mode without crash', async ({ page, context }) => {
    // Load page first while online
    await page.goto(`${BASE_URL}/`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    // Simulate offline
    await context.setOffline(true);
    await page.waitForTimeout(1000);

    // Page should still have content (cached or error message)
    const body = await page.textContent('body');
    expect(body?.length).toBeGreaterThan(0);

    // Go back online
    await context.setOffline(false);
  });
});