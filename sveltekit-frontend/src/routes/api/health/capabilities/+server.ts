import { json, type RequestHandler } from '@sveltejs/kit';
import { ENV } from '$lib/server/env.server.js';

/**
 * GET /api/health/capabilities
 *
 * Lightweight health contract for client-router + XState state machines.
 * Returns which server capabilities are available RIGHT NOW.
 *
 * Design: fast (2s timeout per check, parallel), cacheable (30s TTL).
 * Client polls this to decide local-onnx vs server-ollama routing.
 *
 * Contract:
 * {
 *   ollama: boolean,        // LLM inference available
 *   embedding: boolean,     // Embedding generation available
 *   rag: boolean,           // Full RAG search (Qdrant) available
 *   postgres: boolean,      // Database available
 *   redis: boolean,         // Cache available
 *   ragEnabled: boolean,    // Composite: ollama + embedding + rag + postgres
 *   serverReady: boolean,   // Composite: ollama + postgres (minimum for server mode)
 *   models: string[],       // Available Ollama model names
 *   latencyMs: number,      // Total check time
 *   ts: string,             // ISO timestamp
 * }
 */
export const GET: RequestHandler = async () => {
	const start = Date.now();
	const TIMEOUT = 2000;

	const check = async (url: string): Promise<boolean> => {
		try {
			const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
			return res.ok;
		} catch {
			return false;
		}
	};

	const ollamaUrl = ENV.OLLAMA_BASE_URL;
	const qdrantUrl = ENV.QDRANT_URL ?? 'http://localhost:6333';

	// Parallel checks — all with 2s timeout
	const [ollamaRes, qdrantHealth, postgresOk, redisOk, tensorrtOk] = await Promise.all([
		// Ollama: fetch model list (proves LLM + embedding available)
		fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(TIMEOUT) })
			.then(async (r) => {
				if (!r.ok) return { ok: false, models: [] as string[] };
				const data = await r.json();
				const names = (data.models ?? []).map((m: { name: string }) => m.name);
				return { ok: true, models: names as string[] };
			})
			.catch(() => ({ ok: false, models: [] as string[] })),

		// Qdrant: check server + collection health
		(async () => {
			try {
				const { QdrantClient } = await import('@qdrant/js-client-rest');
				const { checkQdrantHealth } = await import('$lib/server/vector/qdrant-health.js');

				const client = new QdrantClient({ url: qdrantUrl });
				const health = await checkQdrantHealth(client, {
					timeout: TIMEOUT,
					includeVectorCounts: false
				});

				return {
					ok: health.healthy,
					collections: health.collections.length,
					missing: health.missingCollections.length,
					schemaIssues: health.schemaIssues.length
				};
			} catch {
				return { ok: false, collections: 0, missing: 8, schemaIssues: 0 };
			}
		})(),

		// Postgres: lightweight query via existing health endpoint
		check('/api/health/database')
			.catch(() => false)
			// Self-fetch fails in SSR — check DB directly
			.then(async (ok) => {
				if (ok) return true;
				try {
					const { db } = await import('$lib/server/db/index.js');
					const { sql } = await import('drizzle-orm');
					await db.execute(sql`SELECT 1`);
					return true;
				} catch {
					return false;
				}
			}),

		// Redis: try importing and pinging
		(async () => {
			try {
				const { redis } = await import('$lib/server/redis.js');
				if (!redis) return false;
				await redis.ping();
				return true;
			} catch {
				return false;
			}
		})(),

		// TensorRT-LLM: check /health endpoint
		check(ENV.TENSORRT_URL ?? 'http://localhost:8000'),
	]);

	const ollama = ollamaRes.ok;
	const models = ollamaRes.models;
	const embedding = ollama && models.some((m: string) => m.includes('embed'));
	const rag = ollama && embedding && qdrantHealth.ok;
	const ragEnabled = rag && postgresOk;
	const serverReady = ollama && postgresOk;

	return json(
		{
			ollama,
			embedding,
			rag: qdrantHealth.ok,
			qdrant: {
				healthy: qdrantHealth.ok,
				collections: qdrantHealth.collections,
				missing: qdrantHealth.missing,
				schemaIssues: qdrantHealth.schemaIssues
			},
			postgres: postgresOk,
			redis: redisOk,
			tensorrt: tensorrtOk,
			ragEnabled,
			serverReady,
			models,
			latencyMs: Date.now() - start,
			ts: new Date().toISOString(),
		},
		{
			headers: {
				'Cache-Control': 'public, max-age=30, stale-while-revalidate=60',
			},
		},
	);
};
