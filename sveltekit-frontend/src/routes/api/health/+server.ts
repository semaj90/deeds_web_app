/**
 * Unified Health Endpoint — aggregates all infrastructure status in a single call.
 *
 * Sprint 3: Infrastructure Hardening — parallel probes + circuit breaker states + embedding stats.
 *
 * GET /api/health → { status, uptime, checks, breakers, embedding }
 */
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import {
  ollamaBreaker,
  qdrantBreaker,
  redisBreaker,
  breakerEventLog,
} from '$lib/server/circuit-breaker.js';
import { getInFlightCount } from '$lib/server/embedding/embed.js';
import { checkGrpcHealth } from '$lib/server/grpc/embedding-client.js';
import { ENV, SEAWEED_MASTER_PORT } from '$lib/server/env.server.js';

import { cacheMetrics } from '$lib/server/cache-metrics.js';
import { cacheControl } from '$lib/server/middleware/cache-headers.js';
import type { RequestHandler } from './$types';

const querySchema = z.object({
  service: z
    .enum([
      'ollama',
      'redis',
      'qdrant',
      'database',
      'quic',
      'go-search',
      'rabbitmq',
      'seaweedfs',
      'couchdb',
      'neo4j',
      'nats',
    ])
    .optional(),
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
      error: 'Service unreachable',
    };
  }
}

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? 'Invalid service' }, { status: 400 });
  }
  const { service } = parsed.data;

  if (service) {
    return handleServiceHealth(service);
  }

  const trtllmUrl = ENV.TENSORRT_URL;
  const tritonUrl = ENV.TRITON_URL;
  const langextractUrl = ENV.LANGEXTRACT_URL;
  const seaweedMasterUrl = `http://${ENV.MINIO_ENDPOINT}:${SEAWEED_MASTER_PORT}/cluster/status`;

  // Run all probes in parallel
  const [
    ollama,
    qdrant,
    trtllm,
    triton,
    langextract,
    grpc,
    quicHealth,
    goSearch,
    redis,
    postgres,
    rabbitmq,
    seaweedfs,
    couchdb,
    neo4j,
    nats,
  ] = await Promise.all([
    probe(`${ENV.OLLAMA_BASE_URL}/api/tags`, 5000),
    probe(`${ENV.QDRANT_URL}`, 3000),
    probe(`${trtllmUrl}/health`, 3000),
    probe(`${tritonUrl}/v2/health/ready`, 3000),
    probe(`${langextractUrl}/health`, 3000).catch(() => ({
      ok: false,
      latencyMs: 0,
      error: 'langextract probe failed',
    })),
    checkGrpcHealth().catch(() => ({ available: false, enabled: false, url: '' })),
    probe(ENV.QUIC_HEALTH_URL, 3000).catch(() => ({
      ok: false,
      latencyMs: 0,
      error: 'quic probe failed',
    })),
    probe(`${ENV.GO_SEARCH_URL || 'http://127.0.0.1:8096'}/health`, 800).catch(() => ({
      ok: false,
      latencyMs: 0,
      error: 'go-search probe failed',
    })),
    // --- Data-tier probes ---
    probeRedis(),
    probePostgres(),
    probeTcp(
      new URL(ENV.RABBITMQ_URL).hostname,
      parseInt(new URL(ENV.RABBITMQ_URL).port || '5672', 10),
      'rabbitmq'
    ),
    probe(seaweedMasterUrl, 2000).catch(() => ({
      ok: false,
      latencyMs: 0,
      error: 'seaweedfs master unreachable',
    })),
    probe(`${ENV.COUCHDB_URL.replace(/\/\/.*@/, '//')}`, 3000).catch(() => ({
      ok: false,
      latencyMs: 0,
      error: 'couchdb probe failed',
    })),
    probe(
      `http://${new URL(ENV.NEO4J_URI.replace('bolt://', 'http://')).hostname}:7474/`,
      3000
    ).catch(() => ({
      ok: false,
      latencyMs: 0,
      error: 'neo4j probe failed',
    })),
    probeTcp(new URL(ENV.NATS_URL).hostname, parseInt(new URL(ENV.NATS_URL).port || '4222', 10), 'nats'),
  ]);

  const checks = {
    ollama,
    qdrant,
    trtllm,
    triton,
    langextract,
    quic: quicHealth,
    goSearch,
    redis,
    postgres,
    rabbitmq,
    seaweedfs,
    couchdb,
    neo4j,
    nats,
  };

  // Core services: ollama + qdrant + redis + postgres must be healthy
  const coreOk = ollama.ok && qdrant.ok && redis.ok && postgres.ok;

  await persistServiceHealth({
    ollama,
    qdrant,
    redis,
    postgres,
    seaweedfs,
    rabbitmq,
    langextract,
    trtllm,
    triton,
    grpc: {
      ok: Boolean(grpc.available),
      latencyMs: 0,
      error: grpc.available ? undefined : 'Service unreachable',
    },
    couchdb,
    neo4j,
    nats,
    goSearch,
  });

  return json({
    status: coreOk ? 'healthy' : 'degraded',
    uptime: Math.round((Date.now() - startedAt) / 1000),
    time: new Date().toISOString(),
    checks,
    tiers: {
      core: {
        services: ['ollama', 'qdrant', 'redis', 'postgres'],
        allOk: coreOk,
        definition: 'Live, required, request path depends on it',
      },
      data: {
        services: ['seaweedfs', 'rabbitmq', 'langextract'],
        allOk: seaweedfs.ok && rabbitmq.ok && langextract.ok,
        definition: 'Live, supports storage/extraction/messaging',
      },
      inference: {
        services: ['trtllm', 'triton', 'grpc'],
        allOk: trtllm.ok || false,
        note: 'GPU inference backends — fall back to Ollama when unavailable',
        fallback: 'ollama',
      },
      future: {
        services: ['neo4j', 'couchdb', 'nats', 'quic', 'goSearch'],
        allOk: false,
        definition: 'Optional, dormant, env-only, stubbed, or planned next',
        items: {
          neo4j: {
            referenced: true,
            containerRunning: neo4j.ok,
            fallback: 'postgres graph tables',
            want: true,
          },
          couchdb: { referenced: true, containerRunning: couchdb.ok, fallback: null, want: true },
          nats: { referenced: false, containerRunning: nats.ok, fallback: null, want: false },
          quic: {
            referenced: true,
            containerRunning: quicHealth.ok,
            fallback: 'http',
            want: false,
          },
          goSearch: {
            referenced: false,
            containerRunning: goSearch.ok,
            fallback: null,
            want: false,
          },
        },
      },
    },
    breakers: {
      ollama: ollamaBreaker.getStatus(),
      qdrant: qdrantBreaker.getStatus(),
      redis: redisBreaker.getStatus(),
      recentEvents: breakerEventLog.slice(-5),
    },
    cache: cacheMetrics.snapshot(),
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
  }, { headers: cacheControl.short });
};

/** Handle per-service health sub-endpoint */
async function handleServiceHealth(service: string) {
  switch (service) {
    case 'ollama': {
      const result = await probe(`${ENV.OLLAMA_BASE_URL}/api/tags`, 5000);
      return json({ service: 'ollama', ...result }, { headers: cacheControl.short });
    }
    case 'redis': {
      const state = redisBreaker.getStatus();
      return json({ service: 'redis', ok: state.state === 'CLOSED', state }, { headers: cacheControl.short });
    }
    case 'qdrant': {
      const result = await probe(`${ENV.QDRANT_URL}`, 3000);
      return json({ service: 'qdrant', ...result }, { headers: cacheControl.short });
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
        }, { headers: cacheControl.short });
      } catch (err) {
        return json({
          service: 'database',
          ok: false,
          error: 'Service unreachable',
        }, { headers: cacheControl.short });
      }
    }
    case 'quic': {
      const result = await probe(ENV.QUIC_HEALTH_URL, 3000);
      return json({ service: 'quic', ...result, enabled: ENV.EMBEDDING_QUIC_ENABLED });
    }
    case 'go-search': {
      const goUrl = ENV.GO_SEARCH_URL || 'http://127.0.0.1:8096';
      const result = await probe(`${goUrl}/health`, 800);
      return json({ service: 'go-search', ...result, grpcUrl: ENV.GO_SEARCH_GRPC_URL });
    }
    case 'rabbitmq': {
      const result = await probeTcp(
        new URL(ENV.RABBITMQ_URL).hostname,
        parseInt(new URL(ENV.RABBITMQ_URL).port || '5672', 10),
        'rabbitmq'
      );
      return json({ service: 'rabbitmq', ...result });
    }
    case 'seaweedfs': {
      const result = await probe(
        `http://${ENV.MINIO_ENDPOINT}:${SEAWEED_MASTER_PORT}/cluster/status`,
        2000
      );
      return json({ service: 'seaweedfs', ...result, masterPort: SEAWEED_MASTER_PORT });
    }
    case 'couchdb': {
      const safeUrl = ENV.COUCHDB_URL.replace(/\/\/.*@/, '//');
      const result = await probe(safeUrl, 3000);
      return json({ service: 'couchdb', ...result });
    }
    case 'neo4j': {
      const host = new URL(ENV.NEO4J_URI.replace('bolt://', 'http://')).hostname;
      const result = await probe(`http://${host}:7474/`, 3000);
      return json({ service: 'neo4j', ...result });
    }
    case 'nats': {
      const result = await probeTcp(new URL(ENV.NATS_URL).hostname, parseInt(new URL(ENV.NATS_URL).port || '4222', 10), 'nats');
      return json({ service: 'nats', ...result });
    }
    default:
      return json({ error: `Unknown service: ${service}` }, { status: 400 });
  }
}

/** TCP port probe for services without an HTTP API (RabbitMQ AMQP, NATS) */
async function probeTcp(host: string, port: number, _name: string): Promise<CheckResult> {
  const start = performance.now();
  const { createConnection } = await import('net');
  return new Promise((resolve) => {
    const socket = createConnection({ host, port, timeout: 3000 });
    socket.on('connect', () => {
      socket.destroy();
      resolve({ ok: true, latencyMs: Math.round(performance.now() - start) });
    });
    socket.on('error', () => {
      resolve({
        ok: false,
        latencyMs: Math.round(performance.now() - start),
        error: 'Service unreachable',
      });
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ ok: false, latencyMs: Math.round(performance.now() - start), error: 'Timeout' });
    });
  });
}

/** Redis probe via ioredis PING */
async function probeRedis(): Promise<CheckResult> {
  const start = performance.now();
  try {
    const { getRedis } = await import('$lib/server/redis.js');
    const client = getRedis();
    await client.ping();
    return { ok: true, latencyMs: Math.round(performance.now() - start) };
  } catch {
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - start),
      error: 'Service unreachable',
    };
  }
}

/** Postgres probe via pool.query */
async function probePostgres(): Promise<CheckResult> {
  const start = performance.now();
  try {
    const { pool: pgPool } = await import('$lib/server/db/client');
    await pgPool.query('SELECT 1');
    return { ok: true, latencyMs: Math.round(performance.now() - start) };
  } catch {
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - start),
      error: 'Service unreachable',
    };
  }
}

async function persistServiceHealth(checks: Record<string, CheckResult>): Promise<void> {
  try {
    const [{ db }, { serviceCapabilities }, { eq }] = await Promise.all([
      import('$lib/server/db/client'),
      import('$lib/server/db/schema-postgres.js'),
      import('drizzle-orm'),
    ]);

    await Promise.all(
      Object.entries(checks).map(([serviceName, result]) =>
        db
          .update(serviceCapabilities)
          .set({
            lastHealthCheck: new Date(),
            lastHealthStatus: result.ok,
            lastLatencyMs: result.latencyMs,
          })
          .where(eq(serviceCapabilities.serviceName, serviceName))
      )
    );
  } catch (err) {
    // Best-effort persistence only; health endpoint should still respond.
    console.warn('[health] Service health persistence failed:', (err as Error).message);
  }
}
