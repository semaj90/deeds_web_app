import { expect, test } from '@playwright/test';
import { PORTS } from './helpers/env-ports.js';

const BASE = PORTS.APP_BASE;

test.describe('Sprint 4 — Production Readiness', () => {
	test.describe('4.1 Request Tracing Headers', () => {
		test('X-Request-ID header present and UUID format', async ({ request }) => {
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

	test.describe('4.2 Cross-Origin Isolation', () => {
		test('COOP header set', async ({ request }) => {
			const res = await request.get(`${BASE}/api/health`);
			expect(res.headers()['cross-origin-opener-policy']).toBe('same-origin');
		});

		test('COEP header set', async ({ request }) => {
			const res = await request.get(`${BASE}/api/health`);
			expect(res.headers()['cross-origin-embedder-policy']).toBe('require-corp');
		});
	});

	test.describe('4.3 SSE Endpoint', () => {
		test('GET /api/sse/routes — SSE endpoint responds', async ({ request }) => {
			const res = await request.get(`${BASE}/api/sse/routes`);
			expect(res.status()).not.toBe(404);
			expect(res.status()).toBeLessThan(600);
		});
	});

	test.describe('4.4 Core Route Regression', () => {
		test('Dashboard loads', async ({ page }) => {
			const res = await page.goto(`${BASE}/dashboard`, {
				waitUntil: 'domcontentloaded',
				timeout: 30000,
			});
			expect(res?.status()).not.toBe(500);
		});

		test('Cases page loads', async ({ page }) => {
			const res = await page.goto(`${BASE}/cases`, {
				waitUntil: 'domcontentloaded',
				timeout: 30000,
			});
			expect(res?.status()).not.toBe(500);
		});

		test('Evidence page loads', async ({ page }) => {
			const res = await page.goto(`${BASE}/evidence`, {
				waitUntil: 'domcontentloaded',
				timeout: 30000,
			});
			expect(res?.status()).not.toBe(500);
		});

		test('Terminal page loads', async ({ page }) => {
			const res = await page.goto(`${BASE}/terminal`, {
				waitUntil: 'domcontentloaded',
				timeout: 30000,
			});
			expect(res?.status()).not.toBe(500);
		});

		test('Analysis center loads', async ({ page }) => {
			const res = await page.goto(`${BASE}/analysis-center`, {
				waitUntil: 'domcontentloaded',
				timeout: 30000,
			});
			expect(res?.status()).not.toBe(500);
		});
	});
});
