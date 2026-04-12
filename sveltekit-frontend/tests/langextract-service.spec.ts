import { expect, test } from '@playwright/test';
import { PORTS } from './helpers/env-ports.js';

const BASE = PORTS.APP_BASE;

test.describe('LangExtract Service Contract', () => {
	test.describe('Health Endpoints', () => {
		test('GET /api/health — includes langextract status', async ({ request }) => {
			const res = await request.get(`${BASE}/api/health`);
			expect(res.status()).toBe(200);
			const data = await res.json();
			expect(data.checks).toBeDefined();
			// langextract may or may not be running — just verify the key exists
			expect('langextract' in data.checks || 'simd' in data.checks).toBe(true);
		});

		test('GET /api/health/capabilities — includes langextract field', async ({ request }) => {
			const res = await request.get(`${BASE}/api/health/capabilities`);
			expect(res.status()).toBe(200);
			const data = await res.json();
			// Should have the new langextract key (not simd)
			expect(data).toHaveProperty('langextract');
			expect(data.langextract).toHaveProperty('healthy');
			expect(data.langextract).toHaveProperty('latencyMs');
			expect(typeof data.langextract.healthy).toBe('boolean');
		});

		test('GET /api/infrastructure/status — includes langextract in services', async ({ request }) => {
			const res = await request.get(`${BASE}/api/infrastructure/status`);
			expect(res.status()).toBe(200);
			const data = await res.json();
			expect(data.services).toBeDefined();
			expect(data.services).toHaveProperty('langextract');
			expect(data.services.langextract).toHaveProperty('healthy');
			// Verify old key is gone
			expect(data.services).not.toHaveProperty('simd');
		});
	});

	test.describe('Web Crawl (langextract-backed)', () => {
		test('POST /api/web/crawl — requires auth', async ({ request }) => {
			const res = await request.post(`${BASE}/api/web/crawl`, {
				data: { url: 'https://example.com' },
			});
			// Without auth: 401
			expect(res.status()).toBe(401);
		});
	});

	test.describe('Response Shape Contracts', () => {
		test('capabilities langextract shape matches LangExtractHealthStatus', async ({ request }) => {
			const res = await request.get(`${BASE}/api/health/capabilities`);
			expect(res.status()).toBe(200);
			const data = await res.json();
			const le = data.langextract;
			// Must have all fields from LangExtractHealthStatus
			expect(typeof le.healthy).toBe('boolean');
			expect(typeof le.latencyMs).toBe('number');
			// Optional fields — present when service was probed
			if (le.healthy) {
				expect(le).toHaveProperty('services');
				expect(le).toHaveProperty('version');
			}
		});

		test('infrastructure status langextract shape', async ({ request }) => {
			const res = await request.get(`${BASE}/api/infrastructure/status`);
			expect(res.status()).toBe(200);
			const data = await res.json();
			const le = data.services.langextract;
			expect(typeof le.healthy).toBe('boolean');
			expect(typeof le.latencyMs).toBe('number');
		});
	});
});
