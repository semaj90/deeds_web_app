/**
 * GET /api/infrastructure/status
 *
 * Aggregated infrastructure health for monitoring dashboard.
 * Returns detailed status of all tiers: gRPC, SIMD, TRT-LLM, QUIC/NATS, GPU, cache, queues.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { ENV } from '$lib/server/env.server.js';
import { getGpuLeaseStatus } from '$lib/server/inference/gpu-arbiter.js';
import { getRouterStatus } from '$lib/server/inference/inference-router.js';
import { getSIMDStatus } from '$lib/server/minio-simd-client.js';
import { checkGrpcHealth } from '$lib/server/grpc/embedding-client.js';
import { healthCheck as trtHealthCheck } from '$lib/server/trt-llm.js';
import { isCudaAvailable } from '$lib/server/gpu/libtorch-bridge.js';

export const GET: RequestHandler = async () => {
	const start = Date.now();
	const TIMEOUT = 3000;

	const [
		grpc,
		simd,
		trtOk,
		routerStatus,
		gpuLease,
		ollamaOk,
		redisOk,
		postgresOk,
		qdrantOk,
		rabbitmqOk,
	] = await Promise.all([
		checkGrpcHealth().catch(() => ({ enabled: false, url: '', available: false })),
		getSIMDStatus().catch(() => ({ healthy: false, minioConnected: false, latencyMs: -1 })),
		trtHealthCheck().catch(() => false),
		getRouterStatus().catch(() => null),
		getGpuLeaseStatus().catch(() => null),

		// Ollama
		fetch(`${ENV.OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(TIMEOUT) })
			.then(r => r.ok).catch(() => false),

		// Redis
		(async () => {
			try {
				const { redis } = await import('$lib/server/redis.js');
				if (!redis) return false;
				await redis.ping();
				return true;
			} catch { return false; }
		})(),

		// Postgres
		(async () => {
			try {
				const { db } = await import('$lib/server/db/index.js');
				const { sql } = await import('drizzle-orm');
				await db.execute(sql`SELECT 1`);
				return true;
			} catch { return false; }
		})(),

		// Qdrant
		fetch(`${ENV.QDRANT_URL}/collections`, { signal: AbortSignal.timeout(TIMEOUT) })
			.then(r => r.ok).catch(() => false),

		// RabbitMQ (check management API)
		fetch('http://localhost:15672/api/overview', {
			headers: { Authorization: 'Basic ' + btoa('guest:guest') },
			signal: AbortSignal.timeout(TIMEOUT)
		}).then(r => r.ok).catch(() => false),
	]);

	const cudaAddon = isCudaAvailable();

	return json({
		tiers: {
			tier1_grpc: {
				label: 'gRPC Embedding (Tier 1)',
				...grpc,
				protocol: 'gRPC/Protobuf',
			},
			tier2_quic: {
				label: 'QUIC/NATS Transport (Tier 2)',
				enabled: ENV.EMBEDDING_QUIC_ENABLED,
				natsUrl: ENV.NATS_URL,
				protocol: 'NATS over QUIC',
			},
			tier3_http: {
				label: 'HTTP/Ollama (Tier 3+4)',
				available: ollamaOk,
				url: ENV.OLLAMA_BASE_URL,
				protocol: 'HTTP/JSON',
			},
		},
		inference: {
			tensorrt: { available: trtOk, url: ENV.TENSORRT_URL },
			ollama: { available: ollamaOk, url: ENV.OLLAMA_BASE_URL },
			router: routerStatus,
		},
		gpu: {
			cudaAddon,
			leaseHolder: gpuLease?.backend ?? null,
			leaseFree: !gpuLease,
			leaseExpiresAt: gpuLease?.expiresAt ?? null,
			device: cudaAddon ? 'RTX 3060 Ti (8GB, Ampere 8.6)' : 'CPU fallback',
		},
		services: {
			postgres: postgresOk,
			redis: redisOk,
			qdrant: qdrantOk,
			rabbitmq: rabbitmqOk,
			simd,
		},
		latencyMs: Date.now() - start,
		ts: new Date().toISOString(),
	}, {
		headers: { 'Cache-Control': 'public, max-age=15, stale-while-revalidate=30' },
	});
};