/**
 * Named HNSW ef profiles for Qdrant search-time tuning.
 *
 * Qdrant's HNSW index stores pre-built graph edges (m=16 by default).
 * At query time `hnsw_ef` controls how many candidate nodes are explored
 * before returning the top-k results:
 *
 *   higher ef → more graph traversal → better recall → higher latency
 *   lower ef  → fewer nodes visited  → faster        → may miss edge cases
 *
 * The ef values below were chosen relative to the collection default (128):
 *   interactive — half, for <50ms p99 on hot queries
 *   balanced    — collection default, production baseline
 *   thorough    — 2×, for background jobs / evaluation where latency is secondary
 *
 * Usage:
 *   import { HNSW_EF_PROFILES, efForProfile } from './hnsw-ef-profiles.js';
 *
 *   const ef = efForProfile('thorough');
 *   await qdrant._denseSearch({ ..., efSearch: ef });
 */

export type HnswEfProfile = 'interactive' | 'balanced' | 'thorough';

export const HNSW_EF_PROFILES: Record<HnswEfProfile, number> = {
  /** Low-latency interactive queries — half the collection default. */
  interactive: 64,
  /** Collection default — good recall/latency trade-off for most queries. */
  balanced: 128,
  /** High-recall background / evaluation queries — 2× collection default. */
  thorough: 256,
} as const;

/**
 * Return the ef value for a named profile.
 * Falls back to `balanced` for unknown strings so callers don't crash on stale config.
 */
export function efForProfile(profile: HnswEfProfile | string): number {
  return HNSW_EF_PROFILES[profile as HnswEfProfile] ?? HNSW_EF_PROFILES.balanced;
}

/**
 * Infer an appropriate ef profile from the request context.
 *
 * Rules:
 *  - Explicitly forced profile (e.g. from query param or header) → use it
 *  - Large limit (> 50) → thorough (background-style query)
 *  - Small limit (≤ 5) → interactive (autocomplete / instant suggestions)
 *  - Otherwise → balanced
 */
export function inferEfProfile(opts: {
  forced?: HnswEfProfile | string;
  limit?: number;
}): HnswEfProfile {
  if (opts.forced && opts.forced in HNSW_EF_PROFILES) {
    return opts.forced as HnswEfProfile;
  }
  const limit = opts.limit ?? 10;
  if (limit > 50) return 'thorough';
  if (limit <= 5) return 'interactive';
  return 'balanced';
}
