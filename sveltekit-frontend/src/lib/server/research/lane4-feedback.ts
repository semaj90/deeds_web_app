/**
 * lane4-feedback.ts — Lane 4: Research hit logging → trust-score RL loop
 *
 * Records successful Lane 3 chunk retrievals (chunks_web_search hits) to
 * Redis accumulators, then periodically refreshes a source-bias snapshot
 * that blends with per-pipeline RL policy weights.
 *
 * Redis keys:
 *   research:hitscore:{pipeline}:{source}   FLOAT  — cumulative weighted score
 *   research:hitn:{pipeline}:{source}       INT    — raw hit count
 *   research:hits_pending                   INT    — hits since last bias refresh
 *   rlpolicy:source_bias                    JSON   — latest SourceBiasSnapshot
 *
 * Source trust priority (mirrors codeintel-datastore.ts trust sort):
 *   official_docs > github_issue > github_code > github_repo > web_page > reddit_post
 *
 * Feedback loop:
 *   Lane 3 hit → recordResearchHits() → Redis accumulators
 *     → maybeRefreshBias() (threshold: 50 new hits)
 *       → computeSourceBias() → rlpolicy:source_bias
 *         → getCachedSourceBias() read by search-pattern analytics
 */

import { getRedis } from '$lib/server/redis.js';
import type { ResearchSource } from './web-research-ingester.js';

// ── Constants ─────────────────────────────────────────────────────────────────

export const HITSCORE_PFX  = 'research:hitscore:';
export const HITN_PFX      = 'research:hitn:';
export const HITS_PENDING  = 'research:hits_pending';
export const SOURCE_BIAS_KEY = 'rlpolicy:source_bias';

const BIAS_TTL          = 2 * 60 * 60;   // 2 h — matches rlpolicy TTL
const REFRESH_THRESHOLD = 50;             // recompute after N new hits

// ── Trust weights ─────────────────────────────────────────────────────────────

/** Intrinsic authority weight per source (1.0 = most authoritative) */
export const SOURCE_TRUST: Record<ResearchSource, number> = {
  official_docs: 1.00,
  github_issue:  0.90,
  github_code:   0.80,
  github_repo:   0.70,
  web_page:      0.60,
  reddit_post:   0.50,
};

export const KNOWN_SOURCES: ResearchSource[] = [
  'official_docs',
  'github_issue',
  'github_code',
  'github_repo',
  'web_page',
  'reddit_post',
];

export const KNOWN_PIPELINES = ['ace', 'kag', 'dag', 'rag', 'codebase'] as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SourceBiasEntry {
  avgScore:  number;
  hitCount:  number;
  /** Combined bias = avg_score × SOURCE_TRUST, clamped to [0.5, 1.5] */
  bias:      number;
}

export interface SourceBiasSnapshot {
  sources:   Record<ResearchSource, SourceBiasEntry>;
  /** Per-pipeline blended bias (weighted avg of source biases by hit count) */
  pipelines: Record<string, number>;
  updatedAt: string;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Record a batch of successful Lane 3 hits. Fire-and-forget — never throws.
 *
 * Increments Redis accumulators for each hit:
 *   hitscore  += hit.score × SOURCE_TRUST[hit.source]
 *   hitn      += 1
 *   hits_pending += hits.length
 *
 * Then conditionally triggers a bias recompute via maybeRefreshBias().
 */
export function recordResearchHits(
  hits:     Array<{ source: ResearchSource; score: number }>,
  pipeline: string,
): void {
  if (!hits.length) return;

  const redis = getRedis();
  const pipe  = redis.pipeline();

  for (const hit of hits) {
    const trust    = SOURCE_TRUST[hit.source] ?? 0.6;
    const weighted = hit.score * trust;
    pipe.incrbyfloat(`${HITSCORE_PFX}${pipeline}:${hit.source}`, weighted);
    pipe.incr(`${HITN_PFX}${pipeline}:${hit.source}`);
  }

  pipe.incrby(HITS_PENDING, hits.length);
  pipe.exec().catch(() => {});

  // Non-blocking conditional refresh
  maybeRefreshBias();
}

/**
 * Compute source-bias snapshot from current Redis accumulators.
 * Returns null if no hits have been recorded yet.
 * Writes result to rlpolicy:source_bias (TTL = 2h).
 */
export async function computeSourceBias(): Promise<SourceBiasSnapshot | null> {
  const redis = getRedis();
  const sources: Partial<Record<ResearchSource, SourceBiasEntry>> = {};
  let totalHits = 0;

  for (const src of KNOWN_SOURCES) {
    let totalScore = 0;
    let count      = 0;

    for (const pl of KNOWN_PIPELINES) {
      const [scoreRaw, countRaw] = await redis.mget(
        `${HITSCORE_PFX}${pl}:${src}`,
        `${HITN_PFX}${pl}:${src}`,
      );
      totalScore += parseFloat(scoreRaw ?? '0');
      count      += parseInt(countRaw  ?? '0', 10);
    }

    totalHits += count;
    const avgScore = count > 0 ? totalScore / count : 0;
    const trust    = SOURCE_TRUST[src];
    // Clamp to [0.5, 1.5] so no source is totally suppressed or over-weighted
    const bias = count > 0
      ? Math.min(1.5, Math.max(0.5, avgScore * trust))
      : trust;

    sources[src] = { avgScore, hitCount: count, bias };
  }

  if (totalHits === 0) return null;

  // Per-pipeline: weighted avg of source biases scaled by hit count
  const pipelines: Record<string, number> = {};
  for (const pl of KNOWN_PIPELINES) {
    let weightedSum = 0;
    let hitSum      = 0;
    for (const src of KNOWN_SOURCES) {
      const countRaw = await redis.get(`${HITN_PFX}${pl}:${src}`);
      const c        = parseInt(countRaw ?? '0', 10);
      weightedSum   += c * (sources[src]?.bias ?? 1.0);
      hitSum        += c;
    }
    pipelines[pl] = hitSum > 0 ? weightedSum / hitSum : 1.0;
  }

  const snapshot: SourceBiasSnapshot = {
    sources:   sources as Record<ResearchSource, SourceBiasEntry>,
    pipelines,
    updatedAt: new Date().toISOString(),
  };

  await redis.set(SOURCE_BIAS_KEY, JSON.stringify(snapshot), 'EX', BIAS_TTL).catch(() => {});
  return snapshot;
}

/** Fast path: read the cached source-bias snapshot. Returns null on miss or error. */
export async function getCachedSourceBias(): Promise<SourceBiasSnapshot | null> {
  try {
    const raw = await getRedis().get(SOURCE_BIAS_KEY);
    return raw ? (JSON.parse(raw) as SourceBiasSnapshot) : null;
  } catch {
    return null;
  }
}

/**
 * Check pending hit count; if above threshold, reset counter and recompute bias.
 * Fire-and-forget — never throws.
 */
export function maybeRefreshBias(): void {
  getRedis()
    .get(HITS_PENDING)
    .then(async (raw) => {
      if (parseInt(raw ?? '0', 10) < REFRESH_THRESHOLD) return;
      // Reset first to prevent concurrent refreshes
      await getRedis().set(HITS_PENDING, '0').catch(() => {});
      await computeSourceBias().catch(() => {});
    })
    .catch(() => {});
}
