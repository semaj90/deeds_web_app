/**
 * HMM Error Classifier
 *
 * Hidden Markov Model-style error state classification.
 * Groups error signals by (error_class, model_name) and selects a recovery packet_key.
 * CPU-only — no GPU, no LLM. State transitions are deterministic lookup tables.
 *
 * Hard rules:
 * - Always join on (error_class, model_name) pair — never error_class alone
 * - HMM picks recovery mode only — it does NOT do retrieval ranking
 * - packet_key is immutable — we select an existing recovery packet, never mutate
 */

import { db } from '$lib/server/db/client.js';
import { sql } from 'drizzle-orm';

export interface ErrorClusterGroup {
  id: number;
  error_class: string;
  model_name: string;
  task_id: string;
  packet_keys: string[];
  failure_count: number;
  last_seen: Date;
  recovery_packet_key: string | null;
  recovery_confidence: number | null;
}

export interface HmmTransition {
  likely_recovery_state: string;
  confidence: number;
}

export interface RecoveryResult {
  recoveryPacketKey: string;
  confidence: number;
}

/** Deterministic state transition table — error_class → recovery strategy name */
const HMM_TRANSITIONS: Record<string, string> = {
  timeout: 'cached_retrieval',
  oom: 'compressed_context',
  semantic_drift: 'similar_feature',
  cache_miss: 'fallback_postgres',
  parse_error: 'cached_retrieval',
  embedding_fail: 'fallback_postgres',
  grpc_unavailable: 'cached_retrieval',
  context_overflow: 'compressed_context',
};

/** Strategy name → confidence score (how reliable the recovery is) */
const STRATEGY_CONFIDENCE: Record<string, number> = {
  cached_retrieval: 0.85,
  compressed_context: 0.75,
  similar_feature: 0.70,
  fallback_postgres: 0.80,
  noop: 0.10,
};

export function computeHmmTransition(
  errorClass: string,
  _packetKeys: string[],
  _evidence: Record<string, unknown>
): HmmTransition {
  const recoveryState = HMM_TRANSITIONS[errorClass] ?? 'noop';
  const confidence = STRATEGY_CONFIDENCE[recoveryState] ?? 0.10;
  return { likely_recovery_state: recoveryState, confidence };
}

/**
 * Select the best recovery packet from a cluster's packet_keys.
 * Prefers packets with shorter keys (proxy for canonical identity).
 * In practice, a real impl would join to atlas_packets and rank by page_rank_score.
 */
async function selectRecoveryPacket(
  packetKeys: string[],
  _recoveryState: string
): Promise<string | null> {
  if (!packetKeys.length) return null;

  // Best effort: find the shortest/most canonical packet key
  // A production impl would query atlas_packets WHERE packet_key = ANY($1)
  // ORDER BY page_rank_score DESC LIMIT 1
  const sorted = [...packetKeys].sort((a, b) => a.length - b.length);
  return sorted[0];
}

/**
 * Main classifier entry point.
 * Looks up the top error cluster for (errorClass, modelName),
 * runs HMM transition, selects recovery packet, persists result.
 */
export async function classifyAndPickRecovery(
  errorClass: string,
  modelName: string,
  evidence: Record<string, unknown>
): Promise<RecoveryResult | null> {
  const rows = await db.execute(sql`
    SELECT id, error_class, model_name, task_id, packet_keys, failure_count,
           last_seen, recovery_packet_key, recovery_confidence
    FROM error_cluster_groups
    WHERE error_class = ${errorClass}
      AND model_name  = ${modelName}
    ORDER BY failure_count DESC
    LIMIT 1
  `);

  const cluster = rows.rows?.[0] as ErrorClusterGroup | undefined;
  if (!cluster) return null;

  const transition = computeHmmTransition(errorClass, cluster.packet_keys ?? [], evidence);

  const recoveryPacketKey = await selectRecoveryPacket(
    cluster.packet_keys ?? [],
    transition.likely_recovery_state
  );

  if (!recoveryPacketKey) return null;

  // Persist the recovery target back to the cluster row
  await db.execute(sql`
    UPDATE error_cluster_groups
    SET recovery_packet_key  = ${recoveryPacketKey},
        recovery_confidence  = ${transition.confidence}
    WHERE id = ${cluster.id}
  `);

  return { recoveryPacketKey, confidence: transition.confidence };
}
