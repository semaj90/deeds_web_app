import { test, expect } from './fixtures/qa';

test('app shell and health respond without a 5xx', { tag: '@feature:infra.vite' }, async ({ page, request }) => {
  const health = await request.get('/api/health');
  expect(health.status()).toBe(200);

  const response = await page.goto('/');
  expect(response?.status() ?? 0).toBeLessThan(500);
});
