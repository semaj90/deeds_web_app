/**
 * Unified Health Endpoint — aggregates all infrastructure status in a single call.
 *
 * Sprint 3: Infrastructure Hardening — parallel probes + circuit breaker states + embedding stats.
 *
 * GET /api/health → { status, uptime, checks, breakers, embedding }
 */
import { json } from '@sveltejs/kit';
import { ollamaBreaker, qdrantBreaker, redisBreaker } from '$lib/server/circuit-breaker.js';
import { getInFlightCount } from '$lib/server/embedding/embed.js';
import { checkGrpcHealth } from '$lib/server/grpc/embedding-client.js';
import { ENV } from '$lib/server/env.server.js';
import { getTrtLlmUrl, getTritonUrl } from '$lib/config/env.server.js';

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

export const GET = async () => {
	const trtllmUrl = getTrtLlmUrl();
	const tritonUrl = getTritonUrl();
	const langextractUrl = ENV.MINIO_SIMD_URL ?? 'http://127.0.0.1:8095';

	// Run all probes in parallel
	const [ollama, qdrant, trtllm, triton, langextract, grpc] = await Promise.all([
		probe(`${ENV.OLLAMA_BASE_URL}/api/tags`, 5000),
		probe(`${ENV.QDRANT_URL}`, 3000),
		probe(`${trtllmUrl}/health`, 3000),
		probe(`${tritonUrl}/v2/health/ready`, 3000),
		probe(`${langextractUrl}/health`, 3000).catch(() => ({
			ok: false, latencyMs: 0, error: 'langextract probe failed'
		})),
		checkGrpcHealth().catch(() => ({ available: false, enabled: false, url: '' })),
	]);

	const checks = { ollama, qdrant, trtllm, triton, langextract };

	// Core services: ollama + qdrant must be healthy; trtllm/triton/langextract are optional accelerators
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
			inFlight: getInFlightCount(),
		},
	});
};
