/**
 * Unified Health Endpoint — aggregates all infrastructure status in a single call.
 *
 * Sprint 3: Infrastructure Hardening — parallel probes + circuit breaker states + embedding stats.
 *
 * GET /api/health → { status, uptime, checks, breakers, embedding }
 *
 * Optional services (TensorRT, Triton, LangExtract, QUIC, RabbitMQ,
 * CouchDB, Neo4j, NATS, go-search) have no guessed/placeholder URL default
 * in env.server.ts — an unconfigured optional service reports
 * status: 'not_configured' here rather than attempting a connection
 * against an invented localhost URL or a fake credential.
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
import { getParentAtlasRuntimeProfileManifest } from '$lib/server/runtime-profile.js';
import { pingValkey } from '$lib/server/cache/valkey-client.js';

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

type ProbeStatus = 'ok' | 'error' | 'not_configured' | 'disabled';

interface CheckResult {
  ok: boolean;
  status: ProbeStatus;
  required: boolean;
  latencyMs: number;
  error?: string;
}

function notConfigured(required = false): CheckResult {
  return { ok: false, status: 'not_configured', required, latencyMs: 0 };
}

function disabledResult(): CheckResult {
  return { ok: true, status: 'disabled', required: false, latencyMs: 0 };
}

function okResult(latencyMs: number, required = false): CheckResult {
  return { ok: true, status: 'ok', required, latencyMs };
}

function errorResult(latencyMs: number, error: string, required = false): CheckResult {
  return { ok: false, status: 'error', required, latencyMs, error };
}

/**
 * Parse and validate a service URL without inventing one. Returns null for
 * unset/unparseable input — callers must treat that as "not configured",
 * never fall back to a guessed host or embed a placeholder credential.
 */
function sanitizeServiceUrl(value: string | undefined | null): URL | null {
  const normalized = String(value ?? '').trim();
  if (!normalized) return null;
  try {
    return new URL(normalized);
  } catch {
    return null;
  }
}

/**
 * Strip embedded userinfo (username:password@) from a URL before it's ever
 * used as a probe target or could end up in a log/response — CouchDB and
 * RabbitMQ URLs commonly carry credentials inline.
 */
function stripUrlCredentials(url: URL): string {
  const copy = new URL(url.toString());
  if (copy.username) copy.username = '';
  if (copy.password) copy.password = '';
  return copy.toString();
}

function tryParseNeo4jHttpUrl(raw: string | undefined | null): URL | null {
  const normalized = String(raw ?? '').trim();
  if (!normalized) return null;
  const httpUrl = normalized.replace('bolt://', 'http://');
  return sanitizeServiceUrl(httpUrl);
}

async function probeTcpUrl(
  raw: string | undefined | null,
  fallbackPort: number,
  required = false
): Promise<CheckResult> {
  const parsed = sanitizeServiceUrl(raw);
  if (!parsed) return notConfigured(required);
  return probeTcp(parsed.hostname, parseInt(parsed.port || String(fallbackPort), 10), required);
}

async function probe(url: string, timeoutMs = 5000, required = false): Promise<CheckResult> {
  const start = performance.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok
      ? okResult(Math.round(performance.now() - start), required)
      : errorResult(Math.round(performance.now() - start), `HTTP ${res.status}`, required);
  } catch (err) {
    return errorResult(Math.round(performance.now() - start), 'Service unreachable', required);
  }
}

/** Probe a URL that may be unset — returns not_configured instead of attempting fetch(). */
async function probeIfConfigured(
  raw: string | undefined | null,
  buildUrl: (base: string) => string,
  timeoutMs = 3000,
  required = false
): Promise<CheckResult> {
  const parsed = sanitizeServiceUrl(raw);
  if (!parsed) return notConfigured(required);
  return probe(buildUrl(parsed.toString()), timeoutMs, required);
}

export const GET: RequestHandler = async ({ url, locals }) => {
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? 'Invalid service' }, { status: 400 });
  }
  const { service } = parsed.data;
  const runtimeProfile = getParentAtlasRuntimeProfileManifest();

  if (service) {
    return handleServiceHealth(service);
  }

  const seaweedHost = ENV.SEAWEED_ENDPOINT || ENV.MINIO_ENDPOINT;
  const seaweedMasterUrl = seaweedHost
    ? `http://${seaweedHost}:${SEAWEED_MASTER_PORT}/cluster/status`
    : null;

  const ollamaRequired = runtimeProfile.services.ollama.state === 'required';
  const qdrantRequired = runtimeProfile.services.qdrant.state === 'required';
  const redisRequired = runtimeProfile.services.redis.state === 'required';
  const postgresRequired = runtimeProfile.services.postgres.state === 'required';

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
    ENV.OLLAMA_BASE_URL
      ? probe(`${ENV.OLLAMA_BASE_URL}/api/tags`, 5000, ollamaRequired)
      : Promise.resolve(notConfigured(ollamaRequired)),
    runtimeProfile.services.qdrant.state === 'disabled'
      ? Promise.resolve(disabledResult())
      : probe(`${ENV.QDRANT_URL}`, 3000, qdrantRequired),
    probeIfConfigured(ENV.TENSORRT_URL, (base) => `${base}health`, 3000),
    probeIfConfigured(ENV.TRITON_URL, (base) => `${base}v2/health/ready`, 3000),
    probeIfConfigured(ENV.LANGEXTRACT_URL, (base) => `${base}health`, 3000),
    checkGrpcHealth().catch(() => ({ available: false, enabled: false, url: '' })),
    probeIfConfigured(ENV.QUIC_HEALTH_URL, (base) => base, 3000),
    probeIfConfigured(ENV.GO_SEARCH_URL, (base) => `${base}health`, 800),
    // --- Data-tier probes ---
    runtimeProfile.services.redis.state === 'disabled'
      ? Promise.resolve(disabledResult())
      : probeRedis(redisRequired),
    probePostgres(postgresRequired),
    probeTcpUrl(ENV.RABBITMQ_URL, 5672),
    seaweedMasterUrl
      ? probe(seaweedMasterUrl, 2000)
      : Promise.resolve(notConfigured()),
    (() => {
      const couchdbUrl = sanitizeServiceUrl(ENV.COUCHDB_URL);
      return couchdbUrl ? probe(stripUrlCredentials(couchdbUrl), 3000) : Promise.resolve(notConfigured());
    })(),
    runtimeProfile.services.neo4j.state === 'disabled'
      ? Promise.resolve(disabledResult())
      : (() => {
          const neo4jUrl = tryParseNeo4jHttpUrl(ENV.NEO4J_URI);
          if (!neo4jUrl) return Promise.resolve(notConfigured());
          return probe(`http://${neo4jUrl.hostname}:7474/`, 3000);
        })(),
    probeTcpUrl(ENV.NATS_URL, 4222),
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

  // Core services: only those in a "required" runtime-profile state must be healthy.
  // A required service that failed to connect is unhealthy; an optional service
  // that's simply unconfigured (status 'not_configured') never counts against coreOk.
  const coreOk =
    (!ollamaRequired || ollama.ok) &&
    (!qdrantRequired || qdrant.ok) &&
    (!redisRequired || redis.ok) &&
    (!postgresRequired || postgres.ok);

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
      status: grpc.available ? 'ok' : 'not_configured',
      required: false,
      latencyMs: 0,
      error: grpc.available ? undefined : undefined,
    },
    couchdb,
    neo4j,
    nats,
    goSearch,
  });

  return json(
    {
      status: coreOk ? 'healthy' : 'degraded',
      runtimeProfile: {
        profile: runtimeProfile.profile,
        source: runtimeProfile.source,
        manifestVersion: runtimeProfile.manifestVersion,
        services: runtimeProfile.services,
        features: runtimeProfile.features,
        notes: runtimeProfile.notes,
      },
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
          natsUrl: ENV.NATS_URL ?? null,
        },
        inFlight: getInFlightCount(),
      },
      transport: {
        tier1_grpc: { enabled: ENV.EMBEDDING_GRPC_ENABLED, url: ENV.EMBEDDING_GRPC_URL },
        tier2_quic: { enabled: ENV.EMBEDDING_QUIC_ENABLED, url: ENV.NATS_URL ?? null },
        tier3_http_batch: {
          enabled: Boolean(ENV.OLLAMA_BASE_URL),
          url: ENV.OLLAMA_BASE_URL ? `${ENV.OLLAMA_BASE_URL}/api/embed` : null,
        },
        tier4_http_seq: {
          enabled: Boolean(ENV.OLLAMA_BASE_URL),
          url: ENV.OLLAMA_BASE_URL ? `${ENV.OLLAMA_BASE_URL}/api/embeddings` : null,
        },
      },
    },
    { headers: cacheControl.short }
  );
};

/** Handle per-service health sub-endpoint */
async function handleServiceHealth(service: string) {
  switch (service) {
    case 'ollama': {
      if (!ENV.OLLAMA_BASE_URL) {
        return json({ service: 'ollama', ...notConfigured() }, { headers: cacheControl.short });
      }
      const result = await probe(`${ENV.OLLAMA_BASE_URL}/api/tags`, 5000);
      return json({ service: 'ollama', ...result }, { headers: cacheControl.short });
    }
    case 'redis': {
      const state = redisBreaker.getStatus();
      return json(
        { service: 'redis', ok: state.state === 'CLOSED', state },
        { headers: cacheControl.short }
      );
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
        return json(
          { service: 'database', ...okResult(Math.round(performance.now() - start), true) },
          { headers: cacheControl.short }
        );
      } catch (err) {
        return json(
          { service: 'database', ...errorResult(0, 'Service unreachable', true) },
          { headers: cacheControl.short }
        );
      }
    }
    case 'quic': {
      if (!ENV.QUIC_HEALTH_URL) {
        return json(
          { service: 'quic', ...notConfigured(), enabled: ENV.EMBEDDING_QUIC_ENABLED },
          { headers: cacheControl.short }
        );
      }
      const result = await probe(ENV.QUIC_HEALTH_URL, 3000);
      return json(
        { service: 'quic', ...result, enabled: ENV.EMBEDDING_QUIC_ENABLED },
        { headers: cacheControl.short }
      );
    }
    case 'go-search': {
      if (!ENV.GO_SEARCH_URL) {
        return json(
          { service: 'go-search', ...notConfigured(), grpcUrl: ENV.GO_SEARCH_GRPC_URL ?? null },
          { headers: cacheControl.short }
        );
      }
      const result = await probe(`${ENV.GO_SEARCH_URL}/health`, 800);
      return json(
        { service: 'go-search', ...result, grpcUrl: ENV.GO_SEARCH_GRPC_URL ?? null },
        { headers: cacheControl.short }
      );
    }
    case 'rabbitmq': {
      const result = await probeTcpUrl(ENV.RABBITMQ_URL, 5672);
      return json({ service: 'rabbitmq', ...result }, { headers: cacheControl.short });
    }
    case 'seaweedfs': {
      const seaweedHost = ENV.SEAWEED_ENDPOINT || ENV.MINIO_ENDPOINT;
      if (!seaweedHost) {
        return json(
          { service: 'seaweedfs', ...notConfigured(), masterPort: SEAWEED_MASTER_PORT },
          { headers: cacheControl.short }
        );
      }
      const result = await probe(`http://${seaweedHost}:${SEAWEED_MASTER_PORT}/cluster/status`, 2000);
      return json(
        { service: 'seaweedfs', ...result, masterPort: SEAWEED_MASTER_PORT },
        { headers: cacheControl.short }
      );
    }
    case 'couchdb': {
      const parsedUrl = sanitizeServiceUrl(ENV.COUCHDB_URL);
      if (!parsedUrl) {
        return json({ service: 'couchdb', ...notConfigured() }, { headers: cacheControl.short });
      }
      const result = await probe(stripUrlCredentials(parsedUrl), 3000);
      return json({ service: 'couchdb', ...result }, { headers: cacheControl.short });
    }
    case 'neo4j': {
      const parsedUrl = tryParseNeo4jHttpUrl(ENV.NEO4J_URI);
      if (!parsedUrl) {
        return json({ service: 'neo4j', ...notConfigured() }, { headers: cacheControl.short });
      }
      const result = await probe(`http://${parsedUrl.hostname}:7474/`, 3000);
      return json({ service: 'neo4j', ...result }, { headers: cacheControl.short });
    }
    case 'nats': {
      const result = await probeTcpUrl(ENV.NATS_URL, 4222);
      return json({ service: 'nats', ...result }, { headers: cacheControl.short });
    }
    default:
      return json({ error: `Unknown service: ${service}` }, { status: 400 });
  }
}

/** TCP port probe for services without an HTTP API (RabbitMQ AMQP, NATS) */
async function probeTcp(host: string, port: number, required = false): Promise<CheckResult> {
  const start = performance.now();
  const { createConnection } = await import('net');
  return new Promise((resolve) => {
    const socket = createConnection({ host, port, timeout: 3000 });
    socket.on('connect', () => {
      socket.destroy();
      resolve(okResult(Math.round(performance.now() - start), required));
    });
    socket.on('error', () => {
      resolve(errorResult(Math.round(performance.now() - start), 'Service unreachable', required));
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(errorResult(Math.round(performance.now() - start), 'Timeout', required));
    });
  });
}

/** Redis probe via ioredis PING */
async function probeRedis(required = false): Promise<CheckResult> {
  const start = performance.now();
  try {
    const ok = await pingValkey();
    return ok
      ? okResult(Math.round(performance.now() - start), required)
      : errorResult(Math.round(performance.now() - start), 'Service unreachable', required);
  } catch {
    return errorResult(Math.round(performance.now() - start), 'Service unreachable', required);
  }
}

/** Postgres probe via pool.query */
async function probePostgres(required = false): Promise<CheckResult> {
  const start = performance.now();
  try {
    const { pool: pgPool } = await import('$lib/server/db/client');
    await pgPool.query('SELECT 1');
    return okResult(Math.round(performance.now() - start), required);
  } catch {
    return errorResult(Math.round(performance.now() - start), 'Service unreachable', required);
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
