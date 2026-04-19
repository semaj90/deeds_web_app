import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ENV } from '$lib/server/env.server.js';
import { getTrtLlmUrl, getQdrantUrl } from '$lib/config/env.server.js';
import { getGpuLeaseStatus } from '$lib/server/inference/gpu-arbiter.js';
import { getLangExtractStatus } from '$lib/server/langextract-client.js';
import { checkGrpcHealth } from '$lib/server/grpc/embedding-client.js';

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
	const qdrantUrl = getQdrantUrl();
	const trtllmUrl = getTrtLlmUrl();

	// Parallel checks — all with 2s timeout
	const [
    ollamaRes,
    qdrantHealth,
    postgresOk,
    redisOk,
    tensorrtOk,
    gpuLease,
    langExtractStatus,
    grpcStatus,
  ] = await Promise.all([
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
          includeVectorCounts: false,
        });

        return {
          ok: health.healthy,
          collections: health.collections.length,
          missing: health.missingCollections.length,
          schemaIssues: health.schemaIssues.length,
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
          const { db } = await import('$lib/server/db/client');
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
    check(`${trtllmUrl}/health`),

    // GPU lease status
    getGpuLeaseStatus().catch(() => null),

    // LangExtract service health
    getLangExtractStatus().catch(() => ({
      healthy: false,
      services: {},
      version: '',
      latencyMs: -1,
    })),

    // gRPC embedding health
    checkGrpcHealth().catch(() => ({ enabled: false, url: '', available: false })),
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
        schemaIssues: qdrantHealth.schemaIssues,
      },
      postgres: postgresOk,
      redis: redisOk,
      tensorrt: tensorrtOk,
      langextract: langExtractStatus,
      grpc: grpcStatus,
      gpu: {
        leaseHolder: gpuLease?.backend ?? null,
        leaseFree: !gpuLease,
        leaseExpiresAt: gpuLease?.expiresAt ?? null,
        leaseRemainingMs: gpuLease ? Math.max(0, gpuLease.expiresAt - Date.now()) : null,
      },
      ragEnabled,
      serverReady,
      models,
      // Model registry from DB (if available)
      modelRegistry: await getModelRegistry(),
      // Service capability matrix from DB (if available)
      serviceMatrix: await getServiceMatrix(),
      latencyMs: Date.now() - start,
      ts: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=30, stale-while-revalidate=60',
      },
    }
  );
};

/** Fetch active models from model_registry table (graceful degradation) */
async function getModelRegistry() {
	try {
		const { db } = await import('$lib/server/db/client');
		const { modelRegistry } = await import('$lib/server/db/schema-postgres.js');
		const { eq } = await import('drizzle-orm');
		const rows = await db.select({
			name: modelRegistry.name,
			backend: modelRegistry.backend,
			capability: modelRegistry.capability,
			quantization: modelRegistry.quantization,
			isDefault: modelRegistry.isDefault,
			parameterCount: modelRegistry.parameterCount,
			contextWindow: modelRegistry.contextWindow,
			embeddingDims: modelRegistry.embeddingDims,
		}).from(modelRegistry).where(eq(modelRegistry.isActive, true));
		return rows;
	} catch {
		return [];
	}
}

/** Fetch service capabilities matrix from DB (graceful degradation) */
async function getServiceMatrix() {
	try {
		const { db } = await import('$lib/server/db/client');
		const { serviceCapabilities } = await import('$lib/server/db/schema-postgres.js');
		const rows = await db.select({
			name: serviceCapabilities.serviceName,
			tier: serviceCapabilities.tier,
			port: serviceCapabilities.port,
			fallback: serviceCapabilities.fallbackService,
			isRequired: serviceCapabilities.isRequired,
			dockerProfile: serviceCapabilities.dockerProfile,
			lastHealthStatus: serviceCapabilities.lastHealthStatus,
			lastLatencyMs: serviceCapabilities.lastLatencyMs,
		}).from(serviceCapabilities);
		return rows;
	} catch {
		return [];
	}
}
