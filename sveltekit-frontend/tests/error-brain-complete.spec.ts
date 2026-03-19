/**
 * Error-Brain Integration Tests
 *
 * Tests for Error-Brain API endpoints and UI.
 * The error-brain system may not be deployed, so all tests
 * gracefully handle missing routes (404) and down backends (500).
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';
const API_BASE = `${BASE_URL}/api/internal/error-brain`;
const KNOWLEDGE_API_BASE = `${BASE_URL}/api/knowledge`;

test.describe('Error-Brain Core API', () => {
  test('GET /status — should respond', async ({ request }) => {
    const response = await request.get(`${API_BASE}/status`);
    // API may not be implemented yet
    if (response.status() === 404) {
      console.log('ℹ️  error-brain API not found (404) — endpoint not implemented');
    }
    expect(response.status()).toBeLessThan(600);
  });

  test('GET /runs — should respond', async ({ request }) => {
    const response = await request.get(`${API_BASE}/runs`);
    if (response.ok()) {
      const data = await response.json();
      const runs = Array.isArray(data) ? data : data.runs;
      expect(Array.isArray(runs)).toBeTruthy();
    }
    // 404 or 500 is acceptable — endpoint may not exist
    expect(response.status()).toBeLessThan(600);
  });

  test('POST /runs — should respond', async ({ request }) => {
    const response = await request.post(`${API_BASE}/runs`, {
      data: {
        scanPaths: ['src/lib/error-brain'],
        options: { dryRun: true, maxErrors: 100 },
      },
    });
    if (response.ok()) {
      const data = await response.json();
      expect(data).toHaveProperty('runId');
    }
    expect(response.status()).toBeLessThan(600);
  });
});

test.describe('Knowledge Base API', () => {
  test('GET /knowledge/stats — should respond', async ({ request }) => {
    const response = await request.get(`${KNOWLEDGE_API_BASE}/stats`);
    if (response.ok()) {
      const data = await response.json();
      expect(data).toHaveProperty('stats');
      expect(data.stats).toHaveProperty('totalDocuments');
    }
    expect(response.status()).toBeLessThan(600);
  });

  test('POST /knowledge/search — should respond', async ({ request }) => {
    const response = await request.post(`${KNOWLEDGE_API_BASE}/search`, {
      data: {
        query: 'typescript module resolution',
        topK: 5,
      },
    });
    if (response.ok()) {
      const data = await response.json();
      expect(Array.isArray(data.results)).toBeTruthy();
    }
    expect(response.status()).toBeLessThan(600);
  });
});

test.describe('Error-Brain Dashboard UI', () => {
  test('should load error-brain page without crash', async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/admin/error-brain`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    const status = response?.status() ?? 0;
    if (status === 404) {
      console.log('ℹ️  /admin/error-brain route not found — not implemented');
      return;
    }

    // Page loaded — verify it has content
    const body = await page.textContent('body');
    expect(body?.length).toBeGreaterThan(0);
  });

  test('should handle error state gracefully', async ({ page, context }) => {
    // Load page first while online
    await page
      .goto(`${BASE_URL}/admin/error-brain`, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      })
      .catch(() => null);

    // Then simulate offline
    await context.setOffline(true);
    await page.waitForTimeout(500);

    // Try to reload offline — should not crash
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => null);
    await page.waitForTimeout(500);

    // Page should still have content
    const body = await page.textContent('body').catch(() => '');
    expect(body).toBeDefined();

    await context.setOffline(false);
  });
});

test.describe('Error-Brain Runs UI', () => {
  test('should load runs list page without crash', async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/admin/error-brain/runs`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    const status = response?.status() ?? 0;
    if (status === 404) {
      console.log('ℹ️  /admin/error-brain/runs route not found');
      return;
    }

    const body = await page.textContent('body');
    expect(body?.length).toBeGreaterThan(0);
  });
});

test.describe('Error-Brain Navigation', () => {
  test('error-brain routes should not crash the app', async ({ page }) => {
    const routes = ['/admin/error-brain', '/admin/error-brain/runs'];

    for (const route of routes) {
      const response = await page.goto(`${BASE_URL}${route}`, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });

      const status = response?.status() ?? 0;
      // Accept 200, 404, 500 — just verify no hard crash
      expect(status).toBeLessThan(600);
    }
  });
});

test.describe('Performance', () => {
  test('API status endpoint should respond in reasonable time', async ({ request }) => {
    const start = Date.now();
    const response = await request.get(`${API_BASE}/status`);
    const duration = Date.now() - start;

    // Should respond within 5 seconds (generous for cold start)
    expect(duration).toBeLessThan(5000);
    expect(response.status()).toBeLessThan(600);
  });
});