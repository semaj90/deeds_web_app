/**
 * Executor Tree Module — Provides executor tree logic for packet.search tool
 *
 * This module contains the executor tree implementation that can be used by
 * the packet-search tool or other retrieval mechanisms.
 *
 * Features:
 * - Typed failure classification
 * - Executor selection with retry logic
 * - Result merging and deduplication
 * - Production telemetry support
 */

export type ExecutorFailureKind =
  | 'TRANSIENT_BACKEND'
  | 'TIMEOUT'
  | 'RATE_LIMIT'
  | 'INVALID_RESPONSE'
  | 'POLICY_REJECT'
  | 'PERMANENT_CONFIG';

export function isRetryableFailure(kind: ExecutorFailureKind): boolean {
  return kind === 'TRANSIENT_BACKEND' || kind === 'TIMEOUT' || kind === 'RATE_LIMIT';
}

export interface ExecutorTrace {
  request_id: string;
  executor_path: string[];
  executor_selected: string;
  retry_count: number;
  fallback_reason: string | null;
  candidate_count_in: number;
  candidate_count_out: number;
  latency_ms: number;
  source_refs: string[];
  bitfrost_cache_hit: boolean;
}

export interface ContextCandidate {
  packet_key: string;
  source_ref: string;
  feature_id: string;
  score: number;
  reason: string;
  summary: string;
  retrieval_lanes: Record<string, number>;
  rank: number;
  fusion_score?: number;
}

export function clampLimit(limit: unknown): number {
  const value = Number(limit ?? 8);
  if (!Number.isFinite(value)) return 8;
  return Math.min(32, Math.max(1, Math.floor(value)));
}
