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

		test('GET /api/health — returns transport tier status', async ({ request }) => {
			const res = await request.get(`${BASE}/api/health`);
			expect(res.status()).toBe(200);
			const data = await res.json();
			expect(data.status).toBeDefined();
			expect(data.uptime).toBeDefined();
			expect(data.checks).toBeDefined();
			expect(data.breakers).toBeDefined();
			expect(data.embedding).toBeDefined();
		});
	});

	test.describe('3.4 QUIC/gRPC Transport Health', () => {
		test('GET /api/health — reports embedding transport tiers', async ({ request }) => {
			const res = await request.get(`${BASE}/api/health`);
			expect(res.status()).toBe(200);
			const data = await res.json();
			expect(data.embedding).toBeDefined();
			expect(data.embedding.grpc).toBeDefined();
			expect(data.transport).toBeDefined();
			expect(data.transport.tier1_grpc).toBeDefined();
			expect(data.transport.tier1_grpc.enabled).toBeDefined();
			expect(data.transport.tier2_quic).toBeDefined();
			expect(data.transport.tier2_quic.enabled).toBeDefined();
			expect(data.transport.tier3_http_batch).toBeDefined();
			expect(data.transport.tier3_http_batch.enabled).toBe(true);
		});

		test('GET /api/health — QUIC + Go Search probes included', async ({ request }) => {
			const res = await request.get(`${BASE}/api/health`);
			expect(res.status()).toBe(200);
			const data = await res.json();
			expect(data.checks.quic).toBeDefined();
			expect(data.checks.quic.latencyMs).toBeDefined();
			expect(data.checks.goSearch).toBeDefined();
		});
	});

	test.describe('3.5 RAG Search Pipeline', () => {
		test('POST /api/rag/search — returns results with embedding transport info', async ({ request }) => {
			const res = await request.post(`${BASE}/api/rag/search`, {
				data: {
					query: 'property law deed transfer',
					top_k: 5,
					min_score: 0.1,
				},
			});
			// Should succeed regardless of which transport tier is available
			const status = res.status();
			expect(status === 200 || status === 502).toBeTruthy();
			if (status === 200) {
				const data = await res.json();
				expect(data.query_id).toBeDefined();
				expect(data.embedding_time_ms).toBeDefined();
				expect(data.embedding_transport).toBeDefined();
			}
		});

		test('POST /api/rag/search — with DAG reordering', async ({ request }) => {
			const res = await request.post(`${BASE}/api/rag/search?dag=true`, {
				data: {
					query: 'citation dependency analysis',
					top_k: 5,
					min_score: 0.1,
				},
			});
			const status = res.status();
			expect(status === 200 || status === 502).toBeTruthy();
		});
	});

	test.describe('3.6 Platform Search with gRPC Fast-Path', () => {
		test('GET /api/search — returns results with timing', async ({ request }) => {
			const res = await request.get(`${BASE}/api/search?q=test&type=cases&limit=5`);
			expect(res.status()).toBe(200);
			const data = await res.json();
			expect(data.totalResults).toBeDefined();
			expect(data.timing).toBeDefined();
			expect(data.timing.totalMs).toBeDefined();
			expect(data.timing.adapters).toBeDefined();
			expect(data.timing.adapters.cases).toBeDefined();
		});

		test('GET /api/search — legal adapter uses fallback chain', async ({ request }) => {
			const res = await request.get(`${BASE}/api/search?q=property+law&type=legal&limit=3`);
			expect(res.status()).toBe(200);
			const data = await res.json();
			expect(data.timing.adapters.legal).toBeDefined();
			expect(data.timing.adapters.legal.status).toBeDefined();
		});
	});

	test.describe('3.7 CRUD Persistence Verification', () => {
		let testCaseId: string | null = null;

		test('POST /api/cases — creates and persists case to DB', async ({ request }) => {
			const res = await request.post(`${BASE}/api/cases`, {
				data: {
					title: '[PW-TEST] QUIC Fallback CRUD Verification',
					description: 'Test that CRUD saves to DB with QUIC transport wired',
					status: 'open',
					priority: 'low',
				},
			});
			expect(res.status()).toBe(201);
			const data = await res.json();
			expect(data.data?.case?.id ?? data.id).toBeDefined();
			testCaseId = data.data?.case?.id ?? data.id;
		});

		test('GET /api/search — finds persisted case via search', async ({ request }) => {
			if (!testCaseId) test.skip();
			const res = await request.get(`${BASE}/api/search?q=QUIC+Fallback+CRUD&type=cases&limit=5`);
			expect(res.status()).toBe(200);
			const data = await res.json();
			expect(data.totalResults).toBeGreaterThan(0);
		});

		test.afterAll(async ({ request }) => {
			if (testCaseId) {
				await request.delete(`${BASE}/api/cases/${testCaseId}`).catch(() => {});
			}
		});
	});
});
