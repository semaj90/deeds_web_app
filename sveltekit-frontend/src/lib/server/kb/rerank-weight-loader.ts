/**
 * rerank-weight-loader.ts
 *
 * Loads rerank weights from memory/kb/weights/rerank-profile.json.
 * Falls back to hardcoded defaults if the file is missing or malformed.
 *
 * No DB writes. No external I/O beyond the local file read.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { RerankWeights, CandidateFeatures } from './module-cartridge-types.js';

// ── Defaults ──────────────────────────────────────────────────────────────────
// Matches the ACE scoring spine:
//   semantic_vector × 0.60 + tag_score × 0.12 + ast_graph × 0.10 + som_boost × 0.08 + hyperedge × 0.10
// But expressed as per-feature contributions for candidate-level scoring.

export const DEFAULT_WEIGHTS: RerankWeights = {
  pagerank:        0.40,
  semantic:        0.30,
  tag_match:       0.12,
  export_match:    0.08,
  route_proximity: 0.05,
  som_boost:       0.05,
  recency:         0.00,
};

// ── Loader ────────────────────────────────────────────────────────────────────

let _cached: RerankWeights | null = null;

/**
 * Load rerank weights from memory/kb/weights/rerank-profile.json.
 * Uses process.cwd() (sveltekit-frontend/) as the root.
 * Safe to call repeatedly — result is cached after first load.
 */
export function loadRerankWeights(forceReload = false): RerankWeights {
  if (_cached && !forceReload) return _cached;

  const weightsPath = join(process.cwd(), 'memory', 'kb', 'weights', 'rerank-profile.json');
  try {
    if (!existsSync(weightsPath)) {
      _cached = { ...DEFAULT_WEIGHTS };
      return _cached;
    }
    const raw  = readFileSync(weightsPath, 'utf-8');
    const disk = JSON.parse(raw) as Partial<RerankWeights>;
    _cached    = { ...DEFAULT_WEIGHTS, ...disk };
  } catch {
    _cached = { ...DEFAULT_WEIGHTS };
  }
  return _cached;
}

// ── Scorer ────────────────────────────────────────────────────────────────────

/**
 * Score a retrieval candidate given feature values and weights.
 *
 * All dimensions are normalised to [0, 1] before weighting so that
 * raw magnitude differences (e.g. pagerank 0–10 vs semantic 0–1) don't
 * dominate the blend.
 *
 * Returns a value in [0, 1].
 */
export function scoreCandidate(
  features: CandidateFeatures,
  weights?: RerankWeights,
): number {
  const w = weights ?? loadRerankWeights();

  // pagerank: raw Karpathy blend is typically 0–10, normalise to [0,1]
  const pr  = Math.min(1, (features.pagerank ?? 0) / 10) * w.pagerank;

  // semantic: already [0,1] from cosine similarity
  const sem = Math.min(1, Math.max(0, features.semantic_score ?? 0)) * w.semantic;

  // tag_match: count → normalise assuming 5 matches = full score
  const tag = Math.min(1, (features.tag_matches ?? 0) / 5) * w.tag_match;

  // export_match: count → normalise assuming 3 matches = full score
  const exp = Math.min(1, (features.export_matches ?? 0) / 3) * w.export_match;

  // route_proximity: 0 hops = 1.0, 10 hops = 0.0
  const rte = Math.max(0, 1 - (features.route_proximity ?? 10) / 10) * w.route_proximity;

  // som_distance: 0 = same cell (1.0), 10+ = unrelated (0.0)
  const som = Math.max(0, 1 - (features.som_distance ?? 10) / 10) * w.som_boost;

  // recency: 0 days = 1.0, 365 days = 0.0
  const rec = Math.max(0, 1 - (features.days_since_modified ?? 365) / 365) * w.recency;

  return pr + sem + tag + exp + rte + som + rec;
}

// ── Weight introspection ──────────────────────────────────────────────────────

/** Return a human-readable breakdown of a scored candidate for debugging */
export function explainScore(
  features: CandidateFeatures,
  weights?: RerankWeights,
): Record<string, number> {
  const w = weights ?? loadRerankWeights();
  return {
    pagerank:        Math.min(1, (features.pagerank ?? 0) / 10) * w.pagerank,
    semantic:        Math.min(1, Math.max(0, features.semantic_score ?? 0)) * w.semantic,
    tag_match:       Math.min(1, (features.tag_matches ?? 0) / 5) * w.tag_match,
    export_match:    Math.min(1, (features.export_matches ?? 0) / 3) * w.export_match,
    route_proximity: Math.max(0, 1 - (features.route_proximity ?? 10) / 10) * w.route_proximity,
    som_boost:       Math.max(0, 1 - (features.som_distance ?? 10) / 10) * w.som_boost,
    recency:         Math.max(0, 1 - (features.days_since_modified ?? 365) / 365) * w.recency,
  };
}
