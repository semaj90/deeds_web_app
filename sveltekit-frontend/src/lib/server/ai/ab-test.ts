/**
 * A/B Test Rollout Framework — bucket users to model variants and log win rates.
 *
 * Each experiment has a set of variants with percentage allocations that sum
 * to 100.  Bucket assignment is deterministic (hash of userId + experimentId)
 * so the same user always sees the same variant within a window.
 *
 * Win-rate tracking is stored in a Redis ZSET (`ab:wins:<experimentId>`)
 * alongside impression counts (`ab:impr:<experimentId>`) so the dashboard
 * can compute per-variant CTR without hitting the DB.
 *
 * Depends on: model-router.ts (RoutingDecision), cache-invalidation.ts (optional)
 *
 * Usage:
 *   const variant = await getVariant('legal-model-test', userId);
 *   // variant.model → 'gemma4-legal-vlm:latest' or 'gemma3:270m'
 *   await recordImpression('legal-model-test', variant.variantId);
 *   // ... run inference ...
 *   await recordWin('legal-model-test', variant.variantId, { durationMs, feedbackScore });
 */

import { getRedis } from '$lib/server/redis.js';
import type { RoutingDecision } from './model-router.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AbVariant {
  variantId: string;
  /** Human-readable label for dashboards */
  label: string;
  /** Ollama model tag */
  model: string;
  /** % share of traffic — all variants must sum to 100 */
  pct: number;
  /** Optional backend hint (overrides model-router's default) */
  backendHint?: RoutingDecision['backend'];
  /** Optional temperature override */
  temperature?: number;
}

export interface AbExperiment {
  experimentId: string;
  description: string;
  variants: AbVariant[];
  /** Experiment is active (false = all traffic to control) */
  active: boolean;
  /** Window for bucket re-randomisation (default '7d') */
  windowDays?: number;
}

export interface BucketResult {
  experimentId: string;
  variantId: string;
  label: string;
  model: string;
  temperature?: number;
  backendHint?: RoutingDecision['backend'];
  /** Whether this is the control (first variant) */
  isControl: boolean;
}

export interface WinRateRow {
  variantId: string;
  label: string;
  impressions: number;
  wins: number;
  winRate: number;
  avgDurationMs: number;
  avgFeedbackScore: number;
}

// ─── Experiment registry ──────────────────────────────────────────────────────

const EXPERIMENTS: Map<string, AbExperiment> = new Map([
  [
    'legal-model-test',
    {
      experimentId: 'legal-model-test',
      description: 'Compare gemma4-legal-vlm (full) vs gemma3:270m (fast) for legal Q&A',
      active: true,
      variants: [
        { variantId: 'control', label: 'Legal VLM (full)', model: 'gemma4-legal-vlm:latest', pct: 70 },
        { variantId: 'fast',    label: 'Gemma3 270M (fast)', model: 'gemma3:270m', pct: 30 },
      ],
    },
  ],
  [
    'turbo-vs-ollama',
    {
      experimentId: 'turbo-vs-ollama',
      description: 'TurboQuant (:8090) vs Ollama (:11434) latency comparison',
      active: true,
      variants: [
        { variantId: 'turboquant', label: 'TurboQuant', model: 'gemma4-legal-vlm:latest', pct: 50, backendHint: 'turboquant' },
        { variantId: 'ollama',     label: 'Ollama',     model: 'gemma4-legal-vlm:latest', pct: 50, backendHint: 'ollama' },
      ],
    },
  ],
]);

export function registerExperiment(exp: AbExperiment): void {
  const total = exp.variants.reduce((s, v) => s + v.pct, 0);
  if (Math.abs(total - 100) > 0.01) {
    throw new Error(`Experiment ${exp.experimentId}: variant percentages must sum to 100 (got ${total})`);
  }
  EXPERIMENTS.set(exp.experimentId, exp);
}

export function getExperiment(experimentId: string): AbExperiment | undefined {
  return EXPERIMENTS.get(experimentId);
}

export function listExperiments(): AbExperiment[] {
  return Array.from(EXPERIMENTS.values());
}

// ─── Bucket assignment ────────────────────────────────────────────────────────

/**
 * Deterministically assign a user to a variant.
 * Uses a fast FNV-1a hash so no I/O is required for the assignment itself.
 */
export async function getVariant(
  experimentId: string,
  userId: string
): Promise<BucketResult | null> {
  const exp = EXPERIMENTS.get(experimentId);
  if (!exp || !exp.active || exp.variants.length === 0) return null;

  // Rolling window: re-bucket after `windowDays` days
  const windowDays = exp.windowDays ?? 7;
  const windowIndex = Math.floor(Date.now() / (windowDays * 86_400_000));
  const seed = `${experimentId}:${userId}:${windowIndex}`;
  const bucket = fnv1a(seed) % 100;

  let cumulative = 0;
  for (const variant of exp.variants) {
    cumulative += variant.pct;
    if (bucket < cumulative) {
      return {
        experimentId,
        variantId: variant.variantId,
        label: variant.label,
        model: variant.model,
        temperature: variant.temperature,
        backendHint: variant.backendHint,
        isControl: variant === exp.variants[0],
      };
    }
  }

  // Fallback to last variant (handles floating-point edge)
  const last = exp.variants[exp.variants.length - 1];
  return {
    experimentId,
    variantId: last.variantId,
    label: last.label,
    model: last.model,
    temperature: last.temperature,
    backendHint: last.backendHint,
    isControl: false,
  };
}

// ─── Impression + win tracking ────────────────────────────────────────────────

const REDIS_TTL = 30 * 86_400; // 30 days

/** Record that a user was shown a variant (call once per request). */
export async function recordImpression(
  experimentId: string,
  variantId: string
): Promise<void> {
  try {
    const redis = getRedis();
    const key = `ab:impr:${experimentId}`;
    await redis.zincrby(key, 1, variantId);
    await redis.expire(key, REDIS_TTL);
  } catch {
    // Non-fatal — tracking loss is acceptable
  }
}

export interface WinMetrics {
  durationMs?: number;
  feedbackScore?: number; // 0–1 (thumbs down=0, thumbs up=1)
}

/** Record a positive outcome for a variant. */
export async function recordWin(
  experimentId: string,
  variantId: string,
  metrics: WinMetrics = {}
): Promise<void> {
  try {
    const redis = getRedis();
    const winsKey = `ab:wins:${experimentId}`;
    const durKey  = `ab:dur:${experimentId}`;
    const fbKey   = `ab:fb:${experimentId}`;

    await redis.zincrby(winsKey, 1, variantId);
    await redis.expire(winsKey, REDIS_TTL);

    if (metrics.durationMs !== undefined) {
      // Store as ZSET with auto-accumulated score (ZINCRBY adds, not replaces)
      // Real mean = score / impressions; computed in getWinRates()
      await redis.zincrby(durKey, metrics.durationMs, variantId);
      await redis.expire(durKey, REDIS_TTL);
    }
    if (metrics.feedbackScore !== undefined) {
      await redis.zincrby(fbKey, metrics.feedbackScore, variantId);
      await redis.expire(fbKey, REDIS_TTL);
    }
  } catch {
    // Non-fatal
  }
}

/** Read win rates for an experiment (used by dashboard endpoints). */
export async function getWinRates(experimentId: string): Promise<WinRateRow[]> {
  const exp = EXPERIMENTS.get(experimentId);
  if (!exp) return [];

  try {
    const redis = getRedis();
    const [imprData, winsData, durData, fbData] = await Promise.all([
      redis.zrangebyscore(`ab:impr:${experimentId}`, '-inf', '+inf', 'WITHSCORES'),
      redis.zrangebyscore(`ab:wins:${experimentId}`, '-inf', '+inf', 'WITHSCORES'),
      redis.zrangebyscore(`ab:dur:${experimentId}`,  '-inf', '+inf', 'WITHSCORES'),
      redis.zrangebyscore(`ab:fb:${experimentId}`,   '-inf', '+inf', 'WITHSCORES'),
    ]);

    const toMap = (data: string[]): Map<string, number> => {
      const m = new Map<string, number>();
      for (let i = 0; i < data.length - 1; i += 2) {
        m.set(data[i], parseFloat(data[i + 1]));
      }
      return m;
    };

    const impr = toMap(imprData);
    const wins = toMap(winsData);
    const dur  = toMap(durData);
    const fb   = toMap(fbData);

    return exp.variants.map((v) => {
      const impressions = impr.get(v.variantId) ?? 0;
      const w = wins.get(v.variantId) ?? 0;
      return {
        variantId: v.variantId,
        label: v.label,
        impressions,
        wins: w,
        winRate: impressions > 0 ? w / impressions : 0,
        avgDurationMs: impressions > 0 ? (dur.get(v.variantId) ?? 0) / impressions : 0,
        avgFeedbackScore: impressions > 0 ? (fb.get(v.variantId) ?? 0) / impressions : 0,
      };
    });
  } catch {
    return exp.variants.map((v) => ({
      variantId: v.variantId,
      label: v.label,
      impressions: 0,
      wins: 0,
      winRate: 0,
      avgDurationMs: 0,
      avgFeedbackScore: 0,
    }));
  }
}

// ─── FNV-1a hash (no crypto dep required) ─────────────────────────────────────

function fnv1a(str: string): number {
  let hash = 2_166_136_261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16_777_619) >>> 0; // keep 32-bit unsigned
  }
  return hash % 100; // already in 0–99 range; callers use modulo 100
}
