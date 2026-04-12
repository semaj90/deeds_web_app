import { expect, test } from '@playwright/test';
import { PORTS, probe } from '../helpers/env-ports.js';

/**
 * Service Health Probe Tests
 *
 * Demonstrates the probe() liveness helper from env-ports.ts.
 * These tests check if external services are reachable before running
 * integration tests that depend on them.
 *
 * Example: Skip Qdrant tests if the service is unavailable.
 */

test.describe('Service Health Probes', () => {
	test.describe('Application Server', () => {
		test('should be reachable at APP_BASE', async () => {
			const isUp = await probe(PORTS.APP_BASE, 3000);
			expect(isUp).toBe(true);
		});

		test('should serve /api/health', async ({ request }) => {
			const res = await request.get(`${PORTS.APP_BASE}/api/health`);
			expect(res.status()).toBe(200);
			const data = await res.json();
			expect(data).toHaveProperty('status');
		});
	});

	test.describe.skip('Optional Service Probes (conditional)', () => {
		test('Qdrant vector database', async () => {
			const isUp = await probe(`${PORTS.QDRANT_URL}/healthz`, 2000);
			if (!isUp) {
				console.warn('⚠️  Qdrant not available — skipping vector search tests');
				test.skip();
				return;
			}
			expect(isUp).toBe(true);
		});

		test('Ollama LLM API', async () => {
			const isUp = await probe(PORTS.OLLAMA_URL, 2000);
			if (!isUp) {
				console.warn('⚠️  Ollama not available — skipping LLM tests');
				test.skip();
				return;
			}
			expect(isUp).toBe(true);
		});

		test('Redis cache', async ({ request }) => {
			// Redis doesn't have HTTP endpoint, so check via /api/health
			const res = await request.get(`${PORTS.APP_BASE}/api/health`);
			if (!res.ok()) {
				console.warn('⚠️  Health endpoint unavailable — skipping Redis test');
				test.skip();
				return;
			}
			const data = await res.json();
			const redisHealthy = data?.checks?.redis?.healthy ?? false;
			if (!redisHealthy) {
				console.warn('⚠️  Redis not available — skipping cache tests');
				test.skip();
			}
		});

		test('MinIO object storage', async () => {
			const isUp = await probe(`${PORTS.MINIO_URL}/minio/health/live`, 2000);
			if (!isUp) {
				console.warn('⚠️  MinIO not available — skipping storage tests');
				test.skip();
				return;
			}
			expect(isUp).toBe(true);
		});
	});

	test.describe('Infrastructure Status API', () => {
		test('should return service health map', async ({ request }) => {
			const res = await request.get(`${PORTS.APP_BASE}/api/infrastructure/status`);
			expect(res.status()).toBe(200);
			const data = await res.json();
			expect(data).toHaveProperty('services');

			// Expected services (may be unavailable but keys should exist)
			const expectedServices = [
				'ollama',
				'qdrant',
				'redis',
				'database',
				'minio',
				'rabbitmq',
				'langextract',
			];

			for (const service of expectedServices) {
				expect(data.services).toHaveProperty(service);
				expect(data.services[service]).toHaveProperty('healthy');
				expect(typeof data.services[service].healthy).toBe('boolean');
			}
		});
	});
});