/**
 * /api/cache/bitfrost-effectiveness — BitFrost L1/L2/L3 hit rate measurement
 *
 * Measures the effectiveness of the 3-tier cache system:
 * - L1: Redis exact-match (5ms, 560× speedup)
 * - L2: Qdrant semantic (100ms, 28× speedup)
 * - L3: Ollama cold (2.8s baseline)
 *
 * GET — returns hit rate statistics
 * POST { action: 'reset' } — reset counters (admin only)
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRedis } from '$lib/server/redis.js';

interface BitFrostStats {
  l1_exact_hits: number;
  l1_exact_misses: number;
  l1_hit_rate: number;
  l1_avg_latency_ms: number;

  l2_semantic_hits: number;
  l2_semantic_misses: number;
  l2_hit_rate: number;
  l2_avg_latency_ms: number;

  l3_cold_fallbacks: number;
  l3_avg_latency_ms: number;

  combined_hit_rate: number;
  combined_avg_latency_ms: number;
  estimated_token_reduction_percent: number;

  timestamp: string;
  measurement_period_hours: number;
}

const STATS_KEY = 'bitfrost:effectiveness:stats';
const MEASUREMENT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

async function getOrInitializeStats(): Promise<BitFrostStats> {
  try {
    const redis = getRedis();
    const existing = await redis.get(STATS_KEY);
    if (existing) {
      return JSON.parse(existing) as BitFrostStats;
    }
  } catch {
    /* Redis unavailable, return default */
  }

  return {
    l1_exact_hits: 0,
    l1_exact_misses: 0,
    l1_hit_rate: 0,
    l1_avg_latency_ms: 0,

    l2_semantic_hits: 0,
    l2_semantic_misses: 0,
    l2_hit_rate: 0,
    l2_avg_latency_ms: 0,

    l3_cold_fallbacks: 0,
    l3_avg_latency_ms: 2800, // baseline Gemma4 on RTX 3060 Ti

    combined_hit_rate: 0,
    combined_avg_latency_ms: 0,
    estimated_token_reduction_percent: 0,

    timestamp: new Date().toISOString(),
    measurement_period_hours: 24,
  };
}

async function recordL1Hit(latencyMs: number): Promise<void> {
  try {
    const redis = getRedis();
    const stats = await getOrInitializeStats();
    stats.l1_exact_hits++;
    stats.l1_avg_latency_ms = (stats.l1_avg_latency_ms + latencyMs) / 2;
    stats.l1_hit_rate =
      stats.l1_exact_hits / (stats.l1_exact_hits + stats.l1_exact_misses + 1);
    stats.timestamp = new Date().toISOString();
    await redis.setex(STATS_KEY, 86400, JSON.stringify(stats));
  } catch {
    /* Telemetry-only, don't interrupt flow */
  }
}

async function recordL1Miss(): Promise<void> {
  try {
    const redis = getRedis();
    const stats = await getOrInitializeStats();
    stats.l1_exact_misses++;
    stats.l1_hit_rate =
      stats.l1_exact_hits / (stats.l1_exact_hits + stats.l1_exact_misses + 1);
    stats.timestamp = new Date().toISOString();
    await redis.setex(STATS_KEY, 86400, JSON.stringify(stats));
  } catch {
    /* Telemetry-only */
  }
}

async function recordL2Hit(latencyMs: number): Promise<void> {
  try {
    const redis = getRedis();
    const stats = await getOrInitializeStats();
    stats.l2_semantic_hits++;
    stats.l2_avg_latency_ms = (stats.l2_avg_latency_ms + latencyMs) / 2;
    stats.l2_hit_rate =
      stats.l2_semantic_hits / (stats.l2_semantic_hits + stats.l2_semantic_misses + 1);
    stats.timestamp = new Date().toISOString();
    await redis.setex(STATS_KEY, 86400, JSON.stringify(stats));
  } catch {
    /* Telemetry-only */
  }
}

async function recordL2Miss(): Promise<void> {
  try {
    const redis = getRedis();
    const stats = await getOrInitializeStats();
    stats.l2_semantic_misses++;
    stats.l2_hit_rate =
      stats.l2_semantic_hits / (stats.l2_semantic_hits + stats.l2_semantic_misses + 1);
    stats.timestamp = new Date().toISOString();
    await redis.setex(STATS_KEY, 86400, JSON.stringify(stats));
  } catch {
    /* Telemetry-only */
  }
}

async function recordL3Fallback(latencyMs: number): Promise<void> {
  try {
    const redis = getRedis();
    const stats = await getOrInitializeStats();
    stats.l3_cold_fallbacks++;
    stats.l3_avg_latency_ms = (stats.l3_avg_latency_ms + latencyMs) / 2;
    stats.timestamp = new Date().toISOString();
    await redis.setex(STATS_KEY, 86400, JSON.stringify(stats));
  } catch {
    /* Telemetry-only */
  }
}

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const stats = await getOrInitializeStats();

  // Calculate combined metrics
  const totalRequests =
    stats.l1_exact_hits +
    stats.l1_exact_misses +
    stats.l2_semantic_hits +
    stats.l2_semantic_misses +
    stats.l3_cold_fallbacks;

  const totalHits = stats.l1_exact_hits + stats.l2_semantic_hits;
  stats.combined_hit_rate = totalRequests > 0 ? totalHits / totalRequests : 0;

  // Estimate average latency weighted by hit rate
  const l1Weight = (stats.l1_exact_hits / (totalHits || 1)) * stats.l1_avg_latency_ms;
  const l2Weight = (stats.l2_semantic_hits / (totalHits || 1)) * stats.l2_avg_latency_ms;
  const l3Weight =
    (stats.l3_cold_fallbacks / (totalRequests || 1)) * stats.l3_avg_latency_ms;
  stats.combined_avg_latency_ms = l1Weight + l2Weight + l3Weight;

  // Estimate token reduction (cached: ~3,500 tokens vs raw: ~15,000 tokens)
  // Each hit saves ~11,500 tokens
  const tokensSpent = totalRequests * 15000;
  const tokensSaved = totalHits * 11500;
  stats.estimated_token_reduction_percent = Math.round(
    (tokensSaved / tokensSpent) * 100
  );

  return json({
    success: true,
    bitfrost: stats,
    targets: {
      l1_hit_rate: { target: '30-50%', actual: `${(stats.l1_hit_rate * 100).toFixed(1)}%` },
      l2_hit_rate: { target: '40-60%', actual: `${(stats.l2_hit_rate * 100).toFixed(1)}%` },
      combined_hit_rate: {
        target: '90-95%',
        actual: `${(stats.combined_hit_rate * 100).toFixed(1)}%`,
      },
      token_reduction: {
        target: '75%',
        actual: `${stats.estimated_token_reduction_percent}%`,
      },
    },
  });
};

export const POST: RequestHandler = async ({ request, locals }) => {
  if (locals.user?.role !== 'admin') {
    return json({ error: 'Admin only' }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  if (body.action === 'reset') {
    try {
      const redis = getRedis();
      await redis.del(STATS_KEY);
      return json({ success: true, message: 'BitFrost stats reset' });
    } catch (err) {
      return json(
        { error: 'Failed to reset stats', details: (err as Error).message },
        { status: 500 }
      );
    }
  }

  // Log L1/L2/L3 events from telemetry
  if (body.action === 'record') {
    const { layer, hit, latency_ms } = body as {
      layer: 'L1' | 'L2' | 'L3';
      hit?: boolean;
      latency_ms?: number;
    };

    try {
      if (layer === 'L1') {
        if (hit) await recordL1Hit(latency_ms ?? 5);
        else await recordL1Miss();
      } else if (layer === 'L2') {
        if (hit) await recordL2Hit(latency_ms ?? 100);
        else await recordL2Miss();
      } else if (layer === 'L3') {
        await recordL3Fallback(latency_ms ?? 2800);
      }
      return json({ success: true });
    } catch (err) {
      return json(
        { error: 'Failed to record stat', details: (err as Error).message },
        { status: 500 }
      );
    }
  }

  return json({ error: 'Unknown action' }, { status: 400 });
};