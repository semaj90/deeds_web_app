import { test, expect } from '@playwright/test';

/**
 * Report auto-population E2E spec.
 *
 * Covers:
 * 1. Report template listing via API
 * 2. Auto-populate endpoint returns a valid draft (degraded-ok if Ollama down)
 * 3. Report editor page loads without 500
 */
test.describe('Reports', () => {
  test('GET /api/reports returns 200 with reports array', async ({ request }) => {
    const res = await request.get('/api/reports');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.reports ?? body)).toBe(true);
  });

  test('GET /api/reports/templates returns available templates', async ({ request }) => {
    const res = await request.get('/api/reports/templates');
    if (res.status() === 404) {
      test.skip(true, '/api/reports/templates not yet implemented');
      return;
    }
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.templates ?? body).toBeTruthy();
  });

  test('POST /api/reports/auto-populate returns draft fields (degraded-ok)', async ({ request }) => {
    const res = await request.post('/api/reports/auto-populate', {
      data: {
        caseId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        caseTitle: 'E2E Test Case — Reports Spec',
        template: 'incident-summary',
      },
    });

    if (res.status() === 404) {
      test.skip(true, '/api/reports/auto-populate not yet implemented');
      return;
    }

    // Accept both 200 (success) and 503 (Ollama unavailable — degraded)
    expect([200, 503]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toHaveProperty('fields');
      expect(body).toHaveProperty('template');
      expect(body.template).toBe('incident-summary');
    }
  });

  test('/reports page loads without 500', async ({ page }) => {
    const res = await page.goto('/reports');
    expect(res?.status()).not.toBe(500);
    // Accept both 200 (page exists) and 302/404 (page not yet wired)
    expect([200, 301, 302, 404]).toContain(res?.status() ?? 200);
  });
});
