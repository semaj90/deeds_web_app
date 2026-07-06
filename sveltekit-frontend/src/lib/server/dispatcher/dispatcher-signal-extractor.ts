/**
 * Dispatcher Signal Extractor
 * Extracts topology signals from dispatcher orchestration results
 * for integration into RRF blend formula
 */

import type { DispatcherOrchestrationResult } from './dispatcher-orchestrator.js';

/**
 * Canonical weight distribution for combining dispatcher signal scores into RRF lane weight
 * Must match TOPOLOGY_RRF_WEIGHTS in rrf-integration.ts for consistency
 */
export const DISPATCHER_RRF_WEIGHTS = {
  dispatch_decision_weight: 0.35,
  execution_efficiency: 0.35,
  synthesis_scope: 0.15,
  reliability_score: 0.15,
} as const;

/**
 * Type-safe dispatcher decision types with semantic meanings
 * These map directly to orchestrator routing decisions
 */
export const DISPATCHER_DECISIONS = [
  'synthesize',   // High-confidence synthesis path
  'sync_qdrant',  // Mirror sync succeeded
  'sync_neo4j',   // Topology sync succeeded
  'rerank',       // Reranking decision
  'validate',     // Validation-focused
  'sync_redis',   // Cache sync
  'recover',      // Recovery attempt
  'escalate',     // Low confidence, operator escalation
  'quarantine',   // Very low confidence, data quarantine
] as const;

export type DispatcherDecision = (typeof DISPATCHER_DECISIONS)[number];

/**
 * Decision weight mapping for RRF signal contribution
 * Type-safe record prevents typos and ensures completeness
 */
export const DECISION_WEIGHTS: Record<DispatcherDecision, number> = {
  synthesize: 1.0,
  sync_qdrant: 0.9,
  sync_neo4j: 0.85,
  rerank: 0.8,
  validate: 0.75,
  sync_redis: 0.7,
  recover: 0.6,
  escalate: 0.4,
  quarantine: 0.2,
} as const;

export interface DispatcherSignals {
  dispatch_decision: string;
  decision_confidence: number; // 0-1
  mirror_sync_count: number; // total mirrors synced successfully
  mirror_success_rate: number; // 0-1, successful syncs / total mirrors
  synthesis_path_length: number; // node count in execution path
  total_latency_ms: number;
  error_count: number;
}

export interface DispatcherSignalScore {
  dispatch_decision_weight: number; // 0-1, normalized decision confidence
  execution_efficiency: number; // 0-1, based on latency and success rate
  synthesis_scope: number; // 0-1, based on path length (more nodes = broader scope)
  reliability_score: number; // 0-1, based on mirror sync success
}

/**
 * Extract quantitative topology signals from dispatcher orchestration result
 * @param result Dispatcher orchestration result from executeDispatcherOrchestration()
 * @returns DispatcherSignals with normalized 0-1 scores
 */
export function extractDispatcherSignals(result: DispatcherOrchestrationResult): DispatcherSignals {
  // Count successful mirror syncs
  const mirrors = result.mirror_syncs;
  const mirrorSyncCount = (mirrors.qdrant.synced > 0 ? 1 : 0) +
                          (mirrors.neo4j.nodes_created > 0 ? 1 : 0) +
                          (mirrors.redis.invalidated > 0 ? 1 : 0);
  const totalMirrors = 3;
  const mirrorSuccessRate = mirrorSyncCount / totalMirrors;

  // Normalize dispatch decision confidence (default 0.8 if success, 0.3 if failure)
  const decisionConfidence = result.success ? 0.8 : 0.3;

  return {
    dispatch_decision: result.dispatch_decision,
    decision_confidence: decisionConfidence,
    mirror_sync_count: mirrorSyncCount,
    mirror_success_rate: mirrorSuccessRate,
    synthesis_path_length: result.synthesis_path.length,
    total_latency_ms: result.total_duration_ms,
    error_count: result.errors.length,
  };
}

/**
 * Compute normalized dispatcher signal scores for RRF blend
 * @param signals Extracted dispatcher signals
 * @returns Normalized scores ready for RRF weighting (0-1 range)
 */
export function computeDispatcherSignalScores(signals: DispatcherSignals): DispatcherSignalScore {
  // Decision confidence: use directly (already 0-1)
  const decisionWeight = Math.min(1, Math.max(0, signals.decision_confidence));

  // Execution efficiency: penalize high latency and failure
  // Target latency: 2000ms → score 1.0, >5000ms → score 0.3
  const latencyScore = Math.max(0.3, 1.0 - (signals.total_latency_ms - 2000) / 3000);
  const executionEfficiency = (latencyScore + signals.mirror_success_rate) / 2; // Average of latency + reliability

  // Synthesis scope: more nodes in path = broader/more thorough routing
  // 1-2 nodes → 0.5, 3-5 nodes → 0.8, 6+ nodes → 1.0
  const pathScore = Math.min(1, 0.4 + (signals.synthesis_path_length / 8));
  const synthesisScope = pathScore;

  // Reliability: mirror success rate with error penalty
  // Base on mirror_success_rate, subtract 0.1 per error (min 0)
  const reliabilityScore = Math.max(0, signals.mirror_success_rate - (signals.error_count * 0.1));

  return {
    dispatch_decision_weight: decisionWeight,
    execution_efficiency: Math.min(1, executionEfficiency),
    synthesis_scope: synthesisScope,
    reliability_score: reliabilityScore,
  };
}

/**
 * Map dispatcher decision type to semantic signal strength
 * Type-safe: only valid DISPATCHER_DECISION values accepted
 * @param decision Type-safe dispatcher decision
 * @returns Signal weight 0-1
 */
export function getDecisionSignalWeight(decision: DispatcherDecision): number {
  return DECISION_WEIGHTS[decision];
}

/**
 * Normalize dispatcher signals to RRF lane format
 * Creates a synthetic "lane" of candidates scored by dispatcher signals
 * @param signals Extracted dispatcher signals
 * @param candidateIds Array of candidate packet IDs to score
 * @returns Array of RRF-compatible hits with dispatcher signal scores
 */
export function dispatcherSignalsToRRFLane(
  signals: DispatcherSignals,
  candidateIds: string[]
): Array<{
  id: string;
  score: number; // 0-1 normalized score
  source: 'dispatcher_signal';
  metadata: {
    dispatch_decision: string;
    decision_confidence: number;
    mirror_success_rate: number;
  };
}> {
  const scores = computeDispatcherSignalScores(signals);

  // Combine all dispatcher scores using canonical weight distribution
  const combinedScore = (
    scores.dispatch_decision_weight * DISPATCHER_RRF_WEIGHTS.dispatch_decision_weight +
    scores.execution_efficiency * DISPATCHER_RRF_WEIGHTS.execution_efficiency +
    scores.synthesis_scope * DISPATCHER_RRF_WEIGHTS.synthesis_scope +
    scores.reliability_score * DISPATCHER_RRF_WEIGHTS.reliability_score
  );

  // Return one hit per candidate, all with same dispatcher score
  // This ensures dispatcher signal influences all retrieval results uniformly
  return candidateIds.map((id) => ({
    id,
    score: combinedScore,
    source: 'dispatcher_signal' as const,
    metadata: {
      dispatch_decision: signals.dispatch_decision,
      decision_confidence: signals.decision_confidence,
      mirror_success_rate: signals.mirror_success_rate,
    },
  }));
}
