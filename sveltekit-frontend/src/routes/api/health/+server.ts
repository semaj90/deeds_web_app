/**
 * Unified Health Endpoint — aggregates all infrastructure status in a single call.
 *
 * Sprint 3: Infrastructure Hardening — parallel probes + circuit breaker states + embedding stats.
 *
 * GET /api/health → { status, uptime, checks, breakers, embedding }
 */
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { ollamaBreaker, qdrantBreaker, redisBreaker } from '$lib/server/circuit-breaker.js';
import { getInFlightCount } from '$lib/server/embedding/embed.js';
import { checkGrpcHealth } from '$lib/server/grpc/embedding-client.js';
import { ENV } from '$lib/server/env.server.js';
import { getTrtLlmUrl, getTritonUrl } from '$lib/config/env.server.js';
import type { RequestHandler } from './$types';

const querySchema = z.object({
	service: z.enum(['ollama', 'redis', 'qdrant', 'database', 'quic', 'go-search']).optional()
});

const startedAt = Date.now();

interface CheckResult {
	ok: boolean;
	latencyMs: number;
	error?: string;
}

async function probe(url: string, timeoutMs = 5000): Promise<CheckResult> {
	const start = performance.now();
	try {
		const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
		return { ok: res.ok, latencyMs: Math.round(performance.now() - start) };
	} catch (err) {
		return {
			ok: false,
			latencyMs: Math.round(performance.now() - start),
			error: (err as Error).message
		};
	}
}

export const GET: RequestHandler = async ({ url }) => {
	const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid service' }, { status: 400 });
	}
	const { service } = parsed.data;

	if (service) {
		return handleServiceHealth(service);
	}

	const trtllmUrl = getTrtLlmUrl();
	const tritonUrl = getTritonUrl();
	const langextractUrl = ENV.LANGEXTRACT_URL;

	// Run all probes in parallel
	const [ollama, qdrant, trtllm, triton, langextract, grpc, quicHealth, goSearch] = await Promise.all([
		probe(`${ENV.OLLAMA_BASE_URL}/api/tags`, 5000),
		probe(`${ENV.QDRANT_URL}`, 3000),
		probe(`${trtllmUrl}/health`, 3000),
		probe(`${tritonUrl}/v2/health/ready`, 3000),
		probe(`${langextractUrl}/health`, 3000).catch(() => ({
			ok: false, latencyMs: 0, error: 'langextract probe failed'
		})),
		checkGrpcHealth().catch(() => ({ available: false, enabled: false, url: '' })),
		probe(ENV.QUIC_HEALTH_URL, 3000).catch(() => ({
			ok: false, latencyMs: 0, error: 'quic probe failed'
		})),
		probe(`${ENV.GO_SEARCH_URL || 'http://localhost:8096'}/health`, 3000).catch(() => ({
			ok: false, latencyMs: 0, error: 'go-search probe failed'
		})),
	]);

	const checks = { ollama, qdrant, trtllm, triton, langextract, quic: quicHealth, goSearch };

	// Core services: ollama + qdrant must be healthy; others are optional accelerators
	const coreOk = ollama.ok && qdrant.ok;

	return json({
		status: coreOk ? 'healthy' : 'degraded',
		uptime: Math.round((Date.now() - startedAt) / 1000),
		time: new Date().toISOString(),
		checks,
		breakers: {
			ollama: ollamaBreaker.getStatus(),
			qdrant: qdrantBreaker.getStatus(),
			redis: redisBreaker.getStatus(),
		},
		embedding: {
			grpc,
			quic: {
				enabled: ENV.EMBEDDING_QUIC_ENABLED,
				natsUrl: ENV.NATS_URL,
			},
			inFlight: getInFlightCount(),
		},
		transport: {
			tier1_grpc: { enabled: ENV.EMBEDDING_GRPC_ENABLED, url: ENV.EMBEDDING_GRPC_URL },
			tier2_quic: { enabled: ENV.EMBEDDING_QUIC_ENABLED, url: ENV.NATS_URL },
			tier3_http_batch: { enabled: true, url: `${ENV.OLLAMA_BASE_URL}/api/embed` },
			tier4_http_seq: { enabled: true, url: `${ENV.OLLAMA_BASE_URL}/api/embeddings` },
		},
	});
};

/** Handle per-service health sub-endpoint */
async function handleServiceHealth(service: string) {
	switch (service) {
		case 'ollama': {
			const result = await probe(`${ENV.OLLAMA_BASE_URL}/api/tags`, 5000);
			return json({ service: 'ollama', ...result });
		}
		case 'redis': {
			const state = redisBreaker.getStatus();
			return json({ service: 'redis', ok: state.state === 'CLOSED', state });
		}
		case 'qdrant': {
			const result = await probe(`${ENV.QDRANT_URL}`, 3000);
			return json({ service: 'qdrant', ...result });
		}
		case 'database': {
			try {
				const { pool: pgPool } = await import('$lib/server/db/client');
				const start = performance.now();
				await pgPool.query('SELECT 1');
				return json({
					service: 'database',
					ok: true,
					latencyMs: Math.round(performance.now() - start),
				});
			} catch (err) {
				return json({
					service: 'database',
					ok: false,
					error: (err as Error).message,
				});
			}
		}
		case 'quic': {
			const result = await probe(ENV.QUIC_HEALTH_URL, 3000);
			return json({ service: 'quic', ...result, enabled: ENV.EMBEDDING_QUIC_ENABLED });
		}
		case 'go-search': {
			const goUrl = ENV.GO_SEARCH_URL || 'http://localhost:8096';
			const result = await probe(`${goUrl}/health`, 3000);
			return json({ service: 'go-search', ...result, grpcUrl: ENV.GO_SEARCH_GRPC_URL });
		}
		default:
			return json({ error: `Unknown service: ${service}` }, { status: 400 });
	}
}
