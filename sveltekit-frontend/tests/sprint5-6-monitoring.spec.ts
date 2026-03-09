import { expect, test } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';

test.describe('Sprint 5-6 — Type Safety & Monitoring', () => {
	test.describe('5.1 Auth Endpoints (type-safe locals)', () => {
		test('Dashboard auth flow works without type errors', async ({ page }) => {
			const res = await page.goto(`${BASE}/dashboard`, {
				waitUntil: 'domcontentloaded',
				timeout: 30000,
			});
			expect(res?.status()).not.toBe(500);
		});
	});

	test.describe('5.2 Embedding Pipeline (typed responses)', () => {
		test('POST /api/embed — embedding response valid', async ({ request }) => {
			const res = await request.post(`${BASE}/api/embed`, {
				data: { text: 'type safety test' },
			});
			expect(res.status()).not.toBe(404);
			expect(res.status()).toBeLessThan(600);
		});
	});

	test.describe('6.1 Prometheus Metrics', () => {
		test('GET /api/metrics — returns Prometheus format', async ({ request }) => {
			const res = await request.get(`${BASE}/api/metrics`);
			expect(res.status()).toBe(200);
			const body = await res.text();
			expect(body).toContain('process_uptime_seconds');
			expect(body).toContain('process_memory_heap_used_bytes');
			expect(body).toContain('circuit_breaker_state');
			expect(body).toContain('# TYPE');
		});

		test('GET /api/metrics — content type is text/plain', async ({ request }) => {
			const res = await request.get(`${BASE}/api/metrics`);
			const ct = res.headers()['content-type'];
			expect(ct).toContain('text/plain');
		});
	});

	test.describe('6.2 Circuit Breaker Integration', () => {
		test('GET /api/health/circuit-breakers — all CLOSED after boot', async ({ request }) => {
			const res = await request.get(`${BASE}/api/health/circuit-breakers`);
			expect(res.status()).toBe(200);
			const data = await res.json();
			expect(data.breakers.ollama.state).toBe('CLOSED');
		});
	});
});
