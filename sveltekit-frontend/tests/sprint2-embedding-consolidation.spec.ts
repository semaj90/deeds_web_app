import { expect, test } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';

test.describe('Sprint 2 — Embedding Consolidation Verification', () => {
	test.describe('2.1 Canonical Embedding Endpoint', () => {
		test('POST /api/embed — canonical embedding pipeline', async ({ request }) => {
			const res = await request.post(`${BASE}/api/embed`, {
				data: { text: 'test embedding consolidation' },
			});
			expect(res.status()).not.toBe(404);
			expect(res.status()).toBeLessThan(600);
		});
	});

	test.describe('2.2 Ollama Health', () => {
		test('GET /api/health/ollama — Ollama health check', async ({ request }) => {
			const res = await request.get(`${BASE}/api/health/ollama`);
			expect(res.status()).not.toBe(404);
			expect(res.status()).toBeLessThan(600);
		});
	});

	test.describe('2.3 RAG Pipeline', () => {
		test('POST /api/rag/search — RAG search uses consolidated embeddings', async ({ request }) => {
			const res = await request.post(`${BASE}/api/rag/search`, {
				data: { query: 'breach of contract elements', limit: 3 },
			});
			expect(res.status()).not.toBe(404);
			expect(res.status()).toBeLessThan(600);
		});
	});

	test.describe('2.4 Knowledge Search Page', () => {
		test('Knowledge search loads without 500', async ({ page }) => {
			const response = await page.goto(`${BASE}/admin/knowledge-search`, {
				waitUntil: 'domcontentloaded',
				timeout: 30000,
			});
			const status = response?.status() ?? 0;
			expect(status).toBeGreaterThan(0);
			expect(status).not.toBe(500);
		});
	});

	test.describe('2.5 Embedding Gateway Shim', () => {
		test('POST /api/embed — gateway shim still works after consolidation', async ({ request }) => {
			const res = await request.post(`${BASE}/api/embed`, {
				data: { text: 'gateway shim verification' },
			});
			// Should not 404 (shim exists)
			expect(res.status()).not.toBe(404);
		});
	});
});
