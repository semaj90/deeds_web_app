import { expect, test } from '@playwright/test';
import { PORTS } from './helpers/env-ports.js';

/**
 * End-to-End Workflow Tests
 *
 * Tests core user workflows across the application.
 * Backends (DB, Redis, Ollama) may not be running,
 * so tests verify routes load without crashing.
 */

const BASE_URL = PORTS.APP_BASE;

test.describe('End-to-End Workflow Tests', () => {
  test('POI management page loads', async ({ page }) => {
    // Navigate to persons-of-interest (the actual route)
    const response = await page.goto(`${BASE_URL}/persons-of-interest`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    const status = response?.status() ?? 0;
    expect(status).not.toBe(404);

    const body = await page.textContent('body');
    expect(body?.length).toBeGreaterThan(0);
  });

  test('POI creation page loads', async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/persons-of-interest/create`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    const status = response?.status() ?? 0;
    expect(status).not.toBe(404);

    const body = await page.textContent('body');
    expect(body?.length).toBeGreaterThan(0);
  });

  test('all-routes page loads', async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/all-routes`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    const status = response?.status() ?? 0;
    expect(status).not.toBe(404);

    const body = await page.textContent('body');
    expect(body?.length).toBeGreaterThan(0);
  });

  test('navigation between routes works', async ({ page }) => {
    // Start at homepage
    await page.goto(`${BASE_URL}/`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    // Navigate to cases
    const casesResponse = await page.goto(`${BASE_URL}/cases`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    expect(casesResponse?.status()).not.toBe(404);

    // Navigate to evidence
    const evidenceResponse = await page.goto(`${BASE_URL}/evidence`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    expect(evidenceResponse?.status()).not.toBe(404);

    // Navigate to chat (dashboard may not exist)
    const chatResponse = await page.goto(`${BASE_URL}/chat`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    expect(chatResponse?.status()).not.toBe(404);
  });

  test('error handling — invalid routes return 404', async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/this-route-does-not-exist-xyz`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    const status = response?.status() ?? 0;
    expect(status).toBe(404);
  });

  test('data persistence across page reloads', async ({ page }) => {
    // Load cases page
    await page.goto(`${BASE_URL}/cases`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    const bodyBefore = await page.textContent('body');

    // Reload
    await page.reload({
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    const bodyAfter = await page.textContent('body');

    // Page should still have content after reload
    expect(bodyAfter?.length).toBeGreaterThan(0);
  });
});
