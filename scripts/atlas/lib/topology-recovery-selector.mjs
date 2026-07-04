#!/usr/bin/env node
import { normalizeToMax, blendRecoveryScore } from './scoring-normalize.mjs';

/**
 * Topology-aware recovery packet selector
 *
 * Given an HMM-classified error state and the failing packet_key, finds the
 * best recovery packet from atlas_packets using:
 *   1. Community locality  — same community_id as the failing packet
 *   2. PageRank authority  — highest page_rank_score within that community
 *   3. Summary relevance   — lexical match between summary and state keywords
 *   4. Determinism         — same (error_class, model_name, community_id) → same key
 *
 * Falls back: same feature_id → same source_ref prefix → global PageRank top-1
 *
 * No GPU, no LLM, no Qdrant. CPU-only Postgres join + simple scoring.
 */

// State → recovery keyword set for lexical scoring against summary text
const STATE_KEYWORDS = {
  schema_mismatch:      ['migration', 'drizzle', 'schema', 'table', 'column', 'relation'],
  missing_dependency:   ['import', 'module', 'package', 'install', 'alias', 'lib'],
  stale_cache:          ['cache', 'bitfrost', 'redis', 'invalidate', 'warm', 'ttl'],
  retrieval_miss:       ['qdrant', 'chunk', 'embedding', 'index', 'retrieval', 'search'],
  worker_timeout:       ['timeout', 'worker', 'gemma', 'abort', 'batch', 'inference'],
  codec_failure:        ['msgpack', 'decode', 'bytea', 'codec', 'binary', 'serialize'],
  audit_recommendation: ['refactor', 'consolidate', 'architecture', 'review', 'improve'],
  unknown:              ['error', 'inspect', 'operator', 'evidence', 'signal'],
};

/**
 * Score a summary string against a state's keyword set.
 * Returns 0.0–1.0 (fraction of keywords found).
 */
function scoreSummary(summary, state) {
  if (!summary) return 0;
  const keywords = STATE_KEYWORDS[state] ?? STATE_KEYWORDS.unknown;
  const lower = summary.toLowerCase();
  const hits = keywords.filter(kw => lower.includes(kw)).length;
  return hits / keywords.length;
}

/**
 * Select the best recovery packet_key for a classified error cluster.
 *
 * @param {object} opts
 * @param {import('pg').Pool} opts.pool  - Postgres pool
 * @param {string} opts.errorClass       - error_class from error_signal_stream
 * @param {string} opts.modelName        - model_name from error_signal_stream
 * @param {string} opts.state            - HMM-decoded ErrorState
 * @param {string[]} opts.failingKeys    - packet_keys that failed (to exclude)
 * @returns {Promise<{packet_key: string, confidence: number, reason: string} | null>}
 */
export async function selectRecoveryPacket({ pool, errorClass, modelName, state, failingKeys = [] }) {
  const keywords = STATE_KEYWORDS[state] ?? STATE_KEYWORDS.unknown;

  // Step 1: find community_id of the first failing packet (if any)
  let communityId = null;
  let featureId = null;
  let sourcePrefix = null;

  if (failingKeys.length > 0) {
    const anchor = await pool.query(
      `SELECT community_id, feature_id, source_ref
       FROM atlas_packets
       WHERE packet_key = $1
       LIMIT 1`,
      [failingKeys[0]]
    );
    if (anchor.rows.length > 0) {
      communityId = anchor.rows[0].community_id;
      featureId   = anchor.rows[0].feature_id;
      // e.g. 'sveltekit-frontend/src/lib/server/auth.ts' → 'sveltekit-frontend/src/lib/server'
      sourcePrefix = anchor.rows[0].source_ref?.split('/').slice(0, -1).join('/') ?? null;
    }
  }

  // Build exclusion list
  const excludeClause = failingKeys.length > 0
    ? `AND p.packet_key NOT IN (${failingKeys.map((_, i) => `$${i + 2}`).join(', ')})`
    : '';

  // Step 2: candidate query — community → feature → global fallback
  // LEFT JOIN codebase_chunk_index to resolve summary when atlas_packets.summary is null
  // (most packets have summaries only in codebase_chunk_index, not in atlas_packets.summary)
  const summaryExpr = `COALESCE(p.summary, cci.summary)`;
  const joinExpr = `LEFT JOIN codebase_chunk_index cci
       ON (cci.relative_path = p.source_ref
           OR cci.relative_path = 'sveltekit-frontend/' || p.source_ref
           OR p.source_ref = 'sveltekit-frontend/' || cci.relative_path)`;

  const whereClause = communityId != null
    ? `WHERE p.community_id = $1 AND p.page_rank_score IS NOT NULL ${excludeClause}`
    : featureId
    ? `WHERE p.feature_id = $1 AND p.page_rank_score IS NOT NULL ${excludeClause}`
    : `WHERE p.page_rank_score IS NOT NULL ${excludeClause}`;

  const paramBase = communityId != null ? communityId
    : featureId ?? null;

  const params = paramBase != null
    ? [paramBase, ...failingKeys]
    : [...failingKeys];

  const finalParams = params.length > 0 ? params : [];
  const finalWhere = params.length > 0
    ? whereClause
    : `WHERE p.page_rank_score IS NOT NULL ${excludeClause}`;

  let candidates;
  try {
    candidates = await pool.query(
      `SELECT p.packet_key, ${summaryExpr} AS summary, p.page_rank_score,
              p.community_id, p.feature_id, p.source_ref
       FROM atlas_packets p
       ${joinExpr}
       ${finalWhere}
       ORDER BY p.page_rank_score DESC NULLS LAST
       LIMIT 20`,
      finalParams
    );
  } catch {
    // Fallback: no community/feature filter, still join for summaries
    candidates = await pool.query(
      `SELECT p.packet_key, ${summaryExpr} AS summary, p.page_rank_score,
              p.community_id, p.feature_id, p.source_ref
       FROM atlas_packets p
       ${joinExpr}
       WHERE p.page_rank_score IS NOT NULL
       ORDER BY p.page_rank_score DESC NULLS LAST
       LIMIT 20`
    );
  }

  if (candidates.rows.length === 0) return null;

  // Step 3: score each candidate using canonical normalization helpers
  const prValues = candidates.rows.map(r => parseFloat(r.page_rank_score ?? 0));
  const scored = candidates.rows.map(row => {
    const pr      = parseFloat(row.page_rank_score ?? 0);
    const prNorm  = normalizeToMax(pr, prValues);
    const sumScore = scoreSummary(row.summary, state);
    const blend   = blendRecoveryScore(prNorm, sumScore);
    return { ...row, blend };
  });

  // Deterministic tie-break: sort by blend DESC then packet_key ASC (lexicographic)
  scored.sort((a, b) => b.blend - a.blend || a.packet_key.localeCompare(b.packet_key));

  const best = scored[0];
  const locality = communityId != null ? `community:${communityId}`
    : featureId ? `feature:${featureId}`
    : 'global';

  return {
    packet_key: best.packet_key,
    confidence: parseFloat(best.blend.toFixed(4)),
    reason: `state=${state} locality=${locality} pr=${best.page_rank_score ?? 'n/a'} summary_match=${scoreSummary(best.summary, state).toFixed(2)}`,
  };
}

/**
 * Batch-select recovery packets for multiple clusters.
 * Returns Map<clusterKey, {packet_key, confidence, reason} | null>
 */
export async function selectRecoveryPacketsBatch(pool, clusters) {
  const results = new Map();
  // Sequential — each query is a small indexed lookup
  for (const c of clusters) {
    const result = await selectRecoveryPacket({
      pool,
      errorClass:  c.error_class,
      modelName:   c.model_name,
      state:       c.state,
      failingKeys: c.packet_keys ?? [],
    });
    results.set(c.key, result);
  }
  return results;
}
