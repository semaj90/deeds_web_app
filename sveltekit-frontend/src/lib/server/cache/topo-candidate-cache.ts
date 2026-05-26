/**
 * topo-candidate-cache.ts
 *
 * Redis quick-hit cache for topo_class ANN candidate sets.
 *
 * Key schema:
 *   ace:topo:{topoClass}:{queryHash}  — top stableKey+score pairs for a query
 *   topo:class:index:{topoClass}      — sorted set of stableKeys by authority score
 *
 * Flow:
 *   classifyQuery(query) → topoClass
 *   → Redis GET ace:topo:{class}:{hash}
 *   → HIT  → reuse cached candidates + report prefilter stats
 *   → MISS → Qdrant topo_class filter → ANN sweep
 *            → SETEX ace:topo:{class}:{hash} (TTL 5 min)
 *
 * The cache stores only stableKey + score (not full chunk payloads) to
 * keep per-key size small (~200 bytes for 8 candidates).
 */

import { createHash } from 'node:crypto';
import { getRedis } from '$lib/server/redis.js';
import { TOPO_CLASS_LABEL } from '$lib/server/tensor/topology-byte-mapper.js';
import type { TopoClass } from '$lib/server/tensor/topology-byte-mapper.js';

const CANDIDATE_TTL = 300;   // 5 min — short enough to stay warm, long enough to be useful
const MAX_CANDIDATES = 16;   // max stableKeys stored per (class, queryHash) pair

export interface TopoCandidateEntry {
  stableKey:  string;
  score:      number;
  path?:      string;
}

export interface TopoCacheLookup {
  hit:             boolean;
  candidates:      TopoCandidateEntry[];
  topoClass:       TopoClass;
  topoLabel:       string;
  queryHash:       string;
  /** Estimate of Qdrant candidates before prefilter (null on hit — we never called Qdrant) */
  qdrantCandidatesEstimate: number | null;
}

// ── Key builders ──────────────────────────────────────────────────────────────

function candidateKey(topoClass: TopoClass, queryHash: string, karpathyRev?: string): string {
  return `ace:topo:${topoClass}:${queryHash}${karpathyRev ? `:${karpathyRev}` : ''}`;
}

export function queryHash(query: string): string {
  return createHash('sha256').update(query.trim().toLowerCase()).digest('hex').slice(0, 16);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Look up cached candidates for a (topoClass, query) pair.
 * Returns null when Redis is unavailable.
 */
export async function getTopoCandidates(
  topoClass: TopoClass,
  query: string,
  karpathyRev?: string,
): Promise<TopoCandidateEntry[] | null> {
  try {
    const redis = getRedis();
    const hash  = queryHash(query);
    const raw   = await redis.get(candidateKey(topoClass, hash, karpathyRev));
    if (!raw) return null;
    return JSON.parse(raw) as TopoCandidateEntry[];
  } catch {
    return null;
  }
}

/**
 * Persist candidates for a (topoClass, query) pair.
 * Silently skips on Redis failure.
 */
export async function setTopoCandidates(
  topoClass: TopoClass,
  query: string,
  candidates: TopoCandidateEntry[],
  karpathyRev?: string,
): Promise<void> {
  try {
    const redis = getRedis();
    const hash  = queryHash(query);
    const key   = candidateKey(topoClass, hash, karpathyRev);
    const payload = JSON.stringify(candidates.slice(0, MAX_CANDIDATES));
    await redis.setex(key, CANDIDATE_TTL, payload);
  } catch {
    // Non-fatal — fall back to Qdrant on next call
  }
}

/**
 * Invalidate all cached candidate sets for a topo class.
 * Call after a re-index that changes topo_class assignments.
 */
export async function invalidateTopoClass(topoClass: TopoClass): Promise<number> {
  try {
    const redis  = getRedis();
    const cursor = { next: '0' };
    let deleted  = 0;
    do {
      const [next, keys] = await redis.scan(
        cursor.next, 'MATCH', `ace:topo:${topoClass}:*`, 'COUNT', '100'
      );
      cursor.next = next;
      if (keys.length > 0) {
        deleted += await redis.del(...keys);
      }
    } while (cursor.next !== '0');
    return deleted;
  } catch {
    return 0;
  }
}

/**
 * Build the prefilter stats block for the TRACE retrieval timeline.
 */
export function buildTopoPrefilterStats(params: {
  used:                     boolean;
  topoClass:                TopoClass;
  cacheHit:                 boolean;
  candidateCountAfter:      number;
  qdrantCollectionEstimate: number | null;
  queryHash:                string;
  cartridge?:               'warm' | 'cold' | 'miss';
  degraded?:                boolean;
  degradedMessage?:         string;
  operatorRecovery?:        string[];
}): TopoPrefilterStats {
  return {
    used:               params.used,
    queryClass:         TOPO_CLASS_LABEL[params.topoClass] ?? 'unclassified',
    topoClass:          params.topoClass,
    cacheHit:           params.cacheHit,
    candidateCount:     params.candidateCountAfter,
    candidateReduction: params.qdrantCollectionEstimate != null
      ? `${params.qdrantCollectionEstimate.toLocaleString()} → ${params.candidateCountAfter}`
      : null,
    queryHash:          params.queryHash,
    cartridge:          params.cartridge,
    degraded:           params.degraded,
    degradedMessage:    params.degradedMessage,
    operatorRecovery:   params.operatorRecovery,
  };
}

export interface TopoPrefilterStats {
  used:               boolean;
  queryClass:         string;
  topoClass:          TopoClass;
  cacheHit:           boolean;
  candidateCount:     number;
  /** Human-readable reduction string, e.g. "32753 → 83" */
  candidateReduction: string | null;
  queryHash:          string;
  cartridge?:         'warm' | 'cold' | 'miss';
  degraded?:          boolean;
  degradedMessage?:   string;
  operatorRecovery?:  string[];
}
