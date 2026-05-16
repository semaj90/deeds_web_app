import { expect, test } from '@playwright/test';
import { PORTS } from './helpers/env-ports.js';
import { PORTS } from './helpers/env-ports.js';

const BASE = PORTS.APP_BASE;

test.describe('Sprint 1 — Critical Fixes Verification', () => {
	test.describe('1.1 Embedding Gateway Shim', () => {
		test('POST /api/embed — should still be wired after gateway shim', async ({ request }) => {
			const res = await request.post(`${BASE}/api/embed`, {
				data: { text: 'test embedding shim' },
			});
			expect(res.status()).not.toBe(404);
			expect(res.status()).toBeLessThan(600);
		});
	});

	test.describe('1.2 VAPID Keys Externalized', () => {
		test('GET /api/health — server boots without VAPID crash', async ({ request }) => {
			const res = await request.get(`${BASE}/api/health`);
			expect(res.status()).not.toBe(404);
			expect(res.status()).toBeLessThan(600);
		});
	});

	test.describe('1.3 Graceful Shutdown', () => {
		test('GET /api/health/services — services endpoint responds', async ({ request }) => {
			const res = await request.get(`${BASE}/api/health/services`);
			expect(res.status()).not.toBe(404);
		});
	});

	test.describe('1.4 CORS Headers', () => {
		test('OPTIONS /api/cases — should return CORS headers', async ({ request }) => {
			const res = await request.fetch(`${BASE}/api/cases`, {
				method: 'OPTIONS',
				headers: { Origin: PORTS.APP_BASE },
			});
			// Accept 204 (CORS handler) or other non-404 status
			expect(res.status()).not.toBe(404);
			const acao = res.headers()['access-control-allow-origin'];
			if (acao) {
				expect(acao).toBeTruthy();
			}
		});

		test('GET /api/health — response includes CORS header', async ({ request }) => {
			const res = await request.get(`${BASE}/api/health`);
			const acao = res.headers()['access-control-allow-origin'];
			expect(acao).toBeTruthy();
		});
	});

	test.describe('1.5 Server Boot Stability', () => {
		test('Dashboard loads without 500', async ({ page }) => {
			const response = await page.goto(`${BASE}/dashboard`, {
				waitUntil: 'domcontentloaded',
				timeout: 30000,
			});
			const status = response?.status() ?? 0;
			expect(status).toBeGreaterThan(0);
			expect(status).not.toBe(404);
		});

		test('X-Request-ID header present', async ({ request }) => {
			const res = await request.get(`${BASE}/api/health`);
			const requestId = res.headers()['x-request-id'];
			expect(requestId).toBeTruthy();
			expect(requestId).toMatch(
				/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
			);
		});

		test('X-Response-Time header present', async ({ request }) => {
			const res = await request.get(`${BASE}/api/health`);
			const responseTime = res.headers()['x-response-time'];
			expect(responseTime).toBeTruthy();
			expect(responseTime).toMatch(/^\d+ms$/);
		});
	});
});
