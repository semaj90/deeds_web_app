/**
 * GET /api/infrastructure/status
 *
 * Aggregated infrastructure health for monitoring dashboard.
 * Returns detailed status of all tiers: gRPC, LangExtract, TRT-LLM, QUIC/NATS, GPU, cache, queues.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { ENV } from '$lib/server/env.server.js';
import { getRabbitMQManagementUrl, getRabbitMQManagementAuth } from '$lib/config/env.server.js';
import { getGpuLeaseStatus } from '$lib/server/inference/gpu-arbiter.js';
import { getRouterStatus } from '$lib/server/inference/inference-router.js';
import { getLangExtractStatus } from '$lib/server/langextract-client.js';
import { checkGrpcHealth } from '$lib/server/grpc/embedding-client.js';
import { checkRetrievalHealth } from '$lib/server/grpc/retrieval-client.js';
import { healthCheck as trtHealthCheck } from '$lib/server/trt-llm.js';
import { healthCheckModel as tritonModelHealthCheck } from '$lib/server/triton-llm.js';
import { isCudaAvailable } from '$lib/server/gpu/libtorch-bridge.js';
import { NODE_RUNTIME_CONFIG, GPU_MARKDOWN_ENV } from '$lib/gpu/runtime-optimizations.js';
import { ollamaFetch } from '$lib/server/ollama.js';
import { validateQdrantCollections } from '$lib/server/config/vector-config.js';
import { getAdapterStatus } from '$lib/server/inference/adapter-manifest.js';
import { getDispatchStats } from '$lib/server/queue/dispatch-inline.js';
import { getInferenceLogStats } from '$lib/server/observability/inference-log.js';

export const GET: RequestHandler = async () => {
	const start = Date.now();
	const TIMEOUT = 3000;

	const [
    grpc,
    retrievalGrpc,
    langextract,
    trtOk,
    tritonVlmOk,
    routerStatus,
    gpuLease,
    ollamaOk,
    redisInfo,
    postgresOk,
    qdrantInfo,
    whisperServer,
    rabbitmqInfo,
  ] = await Promise.all([
    checkGrpcHealth().catch(() => ({ enabled: false, url: '', available: false })),
    checkRetrievalHealth().catch(() => ({ enabled: false, url: '', available: false })),
    getLangExtractStatus().catch(() => ({
      healthy: false,
      services: {},
      version: '',
      latencyMs: -1,
    })),
    trtHealthCheck().catch(() => false),
    tritonModelHealthCheck(ENV.TRITON_VLM_MODEL).catch(() => false),
    getRouterStatus().catch(() => null),
    getGpuLeaseStatus().catch(() => null),

    // Ollama
    ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(TIMEOUT) })
      .then((r) => r.ok)
      .catch(() => false),

    // Redis — ping + memory/keyspace stats
    (async () => {
      try {
        const { redis } = await import('$lib/server/redis.js');
        if (!redis) return { ok: false };
        await redis.ping();
        const info = await redis.info('memory');
        const keyspace = await redis.info('keyspace');
        const usedMemory = info.match(/used_memory_human:(\S+)/)?.[1] ?? 'unknown';
        const peakMemory = info.match(/used_memory_peak_human:(\S+)/)?.[1] ?? 'unknown';
        const dbKeys = keyspace.match(/keys=(\d+)/)?.[1] ?? '0';
        return { ok: true, usedMemory, peakMemory, keys: parseInt(dbKeys) };
      } catch {
        return { ok: false };
      }
    })(),

    // Postgres
    (async () => {
      try {
        const { db } = await import('$lib/server/db/client');
        const { sql } = await import('drizzle-orm');
        await db.execute(sql`SELECT 1`);
        return true;
      } catch {
        return false;
      }
    })(),

    // Qdrant — collection count + total vectors
    (async () => {
      try {
        const res = await fetch(`${ENV.QDRANT_URL}/collections`, {
          signal: AbortSignal.timeout(TIMEOUT),
        });
        if (!res.ok) return { ok: false };
        const data = await res.json();
        const collections = data.result?.collections ?? [];
        const validation = await validateQdrantCollections(ENV.QDRANT_URL).catch(() => null);
        return {
          ok: true,
          collectionCount: collections.length,
          validation: validation
            ? {
                passed: validation.passed.length,
                failed: validation.failed.length,
                skipped: validation.skipped.length,
                failures: validation.failed,
              }
            : null,
        };
      } catch {
        return { ok: false };
      }
    })(),

    // Whisper server (persistent HTTP mode)
    (async () => {
      if (!ENV.WHISPER_USE_SERVER) return { ok: false, enabled: false };
      try {
        const res = await fetch(`${ENV.WHISPER_SERVER_URL}/health`, {
          signal: AbortSignal.timeout(TIMEOUT),
        });
        return { ok: res.ok, enabled: true, url: ENV.WHISPER_SERVER_URL };
      } catch {
        return { ok: false, enabled: true, url: ENV.WHISPER_SERVER_URL };
      }
    })(),

    // RabbitMQ — overview with queue/message counts
    (async () => {
      try {
        const res = await fetch(`${getRabbitMQManagementUrl()}/api/overview`, {
          headers: { Authorization: getRabbitMQManagementAuth() },
          signal: AbortSignal.timeout(TIMEOUT),
        });
        if (!res.ok) return { ok: false };
        const data = await res.json();
        return {
          ok: true,
          queues: data.object_totals?.queues ?? 0,
          messagesReady: data.queue_totals?.messages_ready ?? 0,
          messagesUnacked: data.queue_totals?.messages_unacknowledged ?? 0,
          publishRate: data.message_stats?.publish_details?.rate ?? 0,
          deliverRate: data.message_stats?.deliver_get_details?.rate ?? 0,
        };
      } catch {
        return { ok: false };
      }
    })(),
  ]);

	const cudaAddon = isCudaAvailable();

	return json(
    {
      tiers: {
        tier1_grpc: {
          label: 'gRPC Embedding (Tier 1)',
          ...grpc,
          protocol: 'gRPC/Protobuf',
        },
        tier1_retrieval_grpc: {
          label: 'gRPC Retrieval (Tier 1b)',
          ...retrievalGrpc,
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
        triton: {
          available: routerStatus?.triton?.available ?? false,
          url: ENV.TRITON_URL,
          model: routerStatus?.triton?.model ?? ENV.TRITON_LLM_MODEL,
        },
        tritonVlm: {
          available: tritonVlmOk,
          url: ENV.TRITON_URL,
          model: ENV.TRITON_VLM_MODEL,
          visionModel: ENV.TRITON_VISION_MODEL,
        },
        ollama: { available: ollamaOk, url: ENV.OLLAMA_BASE_URL },
        router: routerStatus,
        adapters: getAdapterStatus(),
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
        redis: redisInfo.ok,
        qdrant: qdrantInfo.ok,
        rabbitmq: rabbitmqInfo.ok,
        langextract,
        whisperServer,
      },
      cache: {
        redis: redisInfo.ok
          ? {
              usedMemory: redisInfo.usedMemory,
              peakMemory: redisInfo.peakMemory,
              keys: redisInfo.keys,
            }
          : null,
        qdrant: qdrantInfo.ok
          ? {
              collectionCount: qdrantInfo.collectionCount,
              validation: qdrantInfo.validation,
            }
          : null,
      },
      queues: rabbitmqInfo.ok
        ? {
            total: rabbitmqInfo.queues,
            messagesReady: rabbitmqInfo.messagesReady,
            messagesUnacked: rabbitmqInfo.messagesUnacked,
            publishRate: rabbitmqInfo.publishRate,
            deliverRate: rabbitmqInfo.deliverRate,
          }
        : null,
      dispatch: getDispatchStats(),
      inferenceLog: getInferenceLogStats(),
      runtimeConfig: {
        maxOldSpaceSize: NODE_RUNTIME_CONFIG.maxOldSpaceSize,
        gpuBatchSize: NODE_RUNTIME_CONFIG.gpuBatchSize,
        gpuConcurrencyLimit: NODE_RUNTIME_CONFIG.gpuConcurrencyLimit,
        wasmSimd: NODE_RUNTIME_CONFIG.experimentalWasmSimd,
        wasmThreads: NODE_RUNTIME_CONFIG.experimentalWasmThreads,
        gpuMarkdownService: GPU_MARKDOWN_ENV.GPU_MARKDOWN_SERVICE_URL,
        fallbackToCpu: GPU_MARKDOWN_ENV.FALLBACK_TO_CPU,
      },
      latencyMs: Date.now() - start,
      ts: new Date().toISOString(),
    },
    {
      headers: { 'Cache-Control': 'public, max-age=15, stale-while-revalidate=30' },
    }
  );
};