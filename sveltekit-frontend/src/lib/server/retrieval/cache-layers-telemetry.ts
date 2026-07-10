/**
 * Phase 3C: Cache Layers Telemetry Collection
 *
 * Non-blocking recording of cache orchestration decisions to Redis.
 * Metrics flow: Decision → Redis async (no await) → Prometheus export
 *
 * Goals:
 * - Record cache hit/miss ratios per layer
 * - Track orchestration latency distribution
 * - Export metrics to Prometheus :9090
 * - Zero blocking of retrieval path
 */

import Redis from 'ioredis';
import type { CacheLayersOrchestrationResult } from './cache-layers-orchestrator.js';

interface CacheDecisionMetric {
  timestamp: number;
  decision: string;
  total_orchestration_ms: number;
  layer2_latency_ms: number;
  layer3_latency_ms: number;
  layer4_latency_ms: number;
  layer2_hit: boolean;
  layer3_hit: boolean;
  layer4_hit: boolean;
  query_hash: string;
}

interface CacheLayerMetrics {
  total_decisions: number;
  layer1_direct_count: number;
  layer2_adapter_count: number;
  layer3_exact_count: number;
  layer4_semantic_count: number;
  layer2_hit_rate: number;
  layer3_hit_rate: number;
  layer4_hit_rate: number;
  avg_orchestration_ms: number;
  p95_orchestration_ms: number;
  p99_orchestration_ms: number;
}

let redisClient: Redis | null = null;

function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || 'redis',
      lazyConnect: true,
      enableOfflineQueue: false,
      retryStrategy: () => null
    });
  }
  return redisClient;
}

/**
 * Record cache decision to Redis (non-blocking, fire-and-forget)
 * No await - returns immediately
 */
export function recordCacheDecision(
  result: CacheLayersOrchestrationResult,
  queryHash: string
): void {
  // Fire-and-forget: don't await, don't block retrieval
  const metric: CacheDecisionMetric = {
    timestamp: Date.now(),
    decision: result.decision,
    total_orchestration_ms: result.total_orchestration_ms,
    layer2_latency_ms: result.layer2_adapter?.latency_ms ?? 0,
    layer3_latency_ms: result.layer3_exact?.latency_ms ?? 0,
    layer4_latency_ms: result.layer4_semantic?.latency_ms ?? 0,
    layer2_hit: result.layer2_adapter?.hit ?? false,
    layer3_hit: result.layer3_exact?.hit ?? false,
    layer4_hit: result.layer4_semantic?.hit ?? false,
    query_hash: queryHash
  };

  // Async operation - don't await
  recordMetricAsync(metric).catch((err) => {
    // Silent failure - telemetry must never block retrieval
    console.warn('[cache-telemetry] Recording failed (non-blocking):', err);
  });
}

/**
 * Async recording (internal, never awaited from retrieval path)
 */
async function recordMetricAsync(metric: CacheDecisionMetric): Promise<void> {
  const redis = getRedisClient();

  try {
    if (!redis.isOpen) {
      await redis.connect();
    }

    // Record individual decision to sorted set (for time-series analysis)
    const key = `cache:decisions:${metric.decision}`;
    await redis.zadd(key, metric.timestamp, JSON.stringify(metric));

    // Trim to last 1000 decisions per layer (6-hour window at normal traffic)
    await redis.zremrangebyrank(key, 0, -1001);

    // Update counters for metrics aggregation
    await redis.hincrby('cache:metrics:counters', metric.decision, 1);
    await redis.hincrby('cache:metrics:counters', 'total', 1);

    // Record layer hit rates
    if (metric.layer2_hit) await redis.hincrby('cache:metrics:hits', 'layer2', 1);
    if (metric.layer3_hit) await redis.hincrby('cache:metrics:hits', 'layer3', 1);
    if (metric.layer4_hit) await redis.hincrby('cache:metrics:hits', 'layer4', 1);

    // Record orchestration latencies (for percentile calculation)
    await redis.rpush('cache:metrics:latencies', metric.total_orchestration_ms.toString());
    await redis.ltrim('cache:metrics:latencies', -10000, -1); // Keep last 10K

    // Set TTL for all keys (24 hours)
    await redis.expire(key, 86400);
    await redis.expire('cache:metrics:counters', 86400);
    await redis.expire('cache:metrics:hits', 86400);
    await redis.expire('cache:metrics:latencies', 86400);
  } catch (err) {
    // Suppress errors - telemetry failures must not affect retrieval
    console.warn('[cache-telemetry] Async recording error:', err);
  }
}

/**
 * Aggregate metrics for Prometheus export (called periodically, not on hot path)
 */
export async function getCacheMetricsForPrometheus(): Promise<CacheLayerMetrics> {
  const redis = getRedisClient();

  try {
    if (!redis.isOpen) {
      await redis.connect();
    }

    // Fetch counters
    const counters = await redis.hgetall('cache:metrics:counters');
    const total = parseInt(counters.total || '0');
    const layer1Count = parseInt(counters.layer1_direct || '0');
    const layer2Count = parseInt(counters.layer2_adapter || '0');
    const layer3Count = parseInt(counters.layer3_exact || '0');
    const layer4Count = parseInt(counters.layer4_semantic || '0');

    // Fetch hit rates
    const hits = await redis.hgetall('cache:metrics:hits');
    const layer2Hits = parseInt(hits.layer2 || '0');
    const layer3Hits = parseInt(hits.layer3 || '0');
    const layer4Hits = parseInt(hits.layer4 || '0');

    // Fetch latencies
    const latencies = await redis.lrange('cache:metrics:latencies', 0, -1);
    const latencyMs = latencies.map((l) => parseInt(l, 10));

    // Calculate percentiles
    const sortedLatencies = latencyMs.sort((a, b) => a - b);
    const avgMs = latencyMs.length > 0 ? latencyMs.reduce((a, b) => a + b, 0) / latencyMs.length : 0;
    const p95Ms =
      latencyMs.length > 0
        ? sortedLatencies[Math.floor(sortedLatencies.length * 0.95)]
        : 0;
    const p99Ms =
      latencyMs.length > 0
        ? sortedLatencies[Math.floor(sortedLatencies.length * 0.99)]
        : 0;

    return {
      total_decisions: total,
      layer1_direct_count: layer1Count,
      layer2_adapter_count: layer2Count,
      layer3_exact_count: layer3Count,
      layer4_semantic_count: layer4Count,
      layer2_hit_rate: layer2Count > 0 ? layer2Hits / layer2Count : 0,
      layer3_hit_rate: layer3Count > 0 ? layer3Hits / layer3Count : 0,
      layer4_hit_rate: layer4Count > 0 ? layer4Hits / layer4Count : 0,
      avg_orchestration_ms: Math.round(avgMs * 10) / 10,
      p95_orchestration_ms: p95Ms,
      p99_orchestration_ms: p99Ms
    };
  } catch (err) {
    console.error('[cache-telemetry] Failed to aggregate metrics:', err);
    // Return zeros on error
    return {
      total_decisions: 0,
      layer1_direct_count: 0,
      layer2_adapter_count: 0,
      layer3_exact_count: 0,
      layer4_semantic_count: 0,
      layer2_hit_rate: 0,
      layer3_hit_rate: 0,
      layer4_hit_rate: 0,
      avg_orchestration_ms: 0,
      p95_orchestration_ms: 0,
      p99_orchestration_ms: 0
    };
  }
}

/**
 * Prometheus metrics endpoint (called by scraper, not on hot path)
 */
export async function getPrometheusMetrics(): Promise<string> {
  const metrics = await getCacheMetricsForPrometheus();

  const lines = [
    '# HELP cache_layers_decisions_total Total cache layer decisions',
    '# TYPE cache_layers_decisions_total gauge',
    `cache_layers_decisions_total{layer="all"} ${metrics.total_decisions}`,
    `cache_layers_decisions_total{layer="layer1_direct"} ${metrics.layer1_direct_count}`,
    `cache_layers_decisions_total{layer="layer2_adapter"} ${metrics.layer2_adapter_count}`,
    `cache_layers_decisions_total{layer="layer3_exact"} ${metrics.layer3_exact_count}`,
    `cache_layers_decisions_total{layer="layer4_semantic"} ${metrics.layer4_semantic_count}`,
    '',
    '# HELP cache_layers_hit_rate Cache hit rate by layer',
    '# TYPE cache_layers_hit_rate gauge',
    `cache_layers_hit_rate{layer="layer2_adapter"} ${metrics.layer2_hit_rate}`,
    `cache_layers_hit_rate{layer="layer3_exact"} ${metrics.layer3_hit_rate}`,
    `cache_layers_hit_rate{layer="layer4_semantic"} ${metrics.layer4_hit_rate}`,
    '',
    '# HELP cache_layers_orchestration_ms Orchestration latency in milliseconds',
    '# TYPE cache_layers_orchestration_ms gauge',
    `cache_layers_orchestration_ms{percentile="avg"} ${metrics.avg_orchestration_ms}`,
    `cache_layers_orchestration_ms{percentile="p95"} ${metrics.p95_orchestration_ms}`,
    `cache_layers_orchestration_ms{percentile="p99"} ${metrics.p99_orchestration_ms}`
  ];

  return lines.join('\n');
}

/**
 * Cleanup (call on app shutdown)
 */
export async function closeTelemetry(): Promise<void> {
  if (redisClient && redisClient.isOpen) {
    await redisClient.quit();
    redisClient = null;
  }
}
