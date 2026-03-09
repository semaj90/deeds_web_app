import { expect, test } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';

test.describe('Sprint 3 — Infrastructure Hardening', () => {
	test.describe('3.1 Circuit Breaker Health', () => {
		test('GET /api/health/circuit-breakers — returns breaker states', async ({ request }) => {
			const res = await request.get(`${BASE}/api/health/circuit-breakers`);
			expect(res.status()).toBe(200);
			const data = await res.json();
			expect(data.breakers).toBeDefined();
			expect(data.breakers.ollama).toBeDefined();
			expect(data.breakers.qdrant).toBeDefined();
			expect(data.breakers.redis).toBeDefined();
			// All should start CLOSED
			expect(data.breakers.ollama.state).toBe('CLOSED');
			expect(data.breakers.qdrant.state).toBe('CLOSED');
			expect(data.breakers.redis.state).toBe('CLOSED');
		});
	});

	test.describe('3.2 Service Health Endpoints', () => {
		test('GET /api/health/services — aggregated health', async ({ request }) => {
			const res = await request.get(`${BASE}/api/health/services`);
			expect(res.status()).not.toBe(404);
			expect(res.status()).toBeLessThan(600);
		});

		test('GET /api/health/ollama — Ollama health', async ({ request }) => {
			const res = await request.get(`${BASE}/api/health/ollama`);
			expect(res.status()).not.toBe(404);
		});

		test('GET /api/health/redis — Redis health', async ({ request }) => {
			const res = await request.get(`${BASE}/api/health/redis`);
			expect(res.status()).not.toBe(404);
		});

		test('GET /api/health/qdrant — Qdrant health', async ({ request }) => {
			const res = await request.get(`${BASE}/api/health/qdrant`);
			expect(res.status()).not.toBe(404);
		});

		test('GET /api/health/database — Database health', async ({ request }) => {
			const res = await request.get(`${BASE}/api/health/database`);
			expect(res.status()).not.toBe(404);
		});
	});

	test.describe('3.3 Root Health', () => {
		test('GET /api/health — root health responds', async ({ request }) => {
			const res = await request.get(`${BASE}/api/health`);
			expect(res.status()).toBe(200);
		});
	});
});
