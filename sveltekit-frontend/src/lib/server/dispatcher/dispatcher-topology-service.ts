/**
 * Dispatcher Topology Service
 * Wires dispatcher orchestration results into RRF blend topology signals
 * Provides clean interface for retrieval pipeline to use dispatcher decisions
 */

import type { DispatcherOrchestrationResult } from './dispatcher-orchestrator.js';
import { extractDispatcherSignals, computeDispatcherSignalScores, DISPATCHER_RRF_WEIGHTS } from './dispatcher-signal-extractor.js';
import type { ContextHit } from '../retrieval/rrf-combiner.js';

export interface TopologySignalContext {
  dispatcherResult: DispatcherOrchestrationResult;
  candidateCount: number;
  queryPacketKey?: string;
  maxHits?: number; // Max dispatcher signal hits to generate (default 20)
}

/**
 * Generate topology signal hits from dispatcher orchestration result
 * for inclusion in RRF blend at Session 117 integration point
 *
 * @param context Context with dispatcher result and candidate info
 * @returns Array of ContextHit[] ready for RRF combineViaRRF()
 */
export function generateDispatcherTopologyHits(context: TopologySignalContext): ContextHit[] {
  if (!context.dispatcherResult || context.candidateCount === 0) {
    return [];
  }

  const signals = extractDispatcherSignals(context.dispatcherResult);
  const scores = computeDispatcherSignalScores(signals);

  // Compute combined dispatcher signal weight (0-1) using canonical weight distribution
  const dispatcherWeight = (
    scores.dispatch_decision_weight * DISPATCHER_RRF_WEIGHTS.dispatch_decision_weight +
    scores.execution_efficiency * DISPATCHER_RRF_WEIGHTS.execution_efficiency +
    scores.synthesis_scope * DISPATCHER_RRF_WEIGHTS.synthesis_scope +
    scores.reliability_score * DISPATCHER_RRF_WEIGHTS.reliability_score
  );

  // Generate sampled hits to avoid candidate pool bloat
  // For large candidate pools, use top-K sampling instead of one-hit-per-candidate
  const maxHits = context.maxHits ?? 20; // Default to 20 hits
  const hitsToGenerate = Math.min(maxHits, context.candidateCount);

  // Sample evenly across candidate pool when candidateCount > maxHits
  const step = context.candidateCount / hitsToGenerate;
  const hits: ContextHit[] = [];

  for (let i = 0; i < hitsToGenerate; i++) {
    const candidateIndex = Math.floor(i * step);
    hits.push({
      id: `dispatcher:signal:${candidateIndex}`, // Synthetic ID for RRF tracking
      source: 'dispatcher_signal' as const,
      score: dispatcherWeight,
      text: context.dispatcherResult.dispatch_decision,
      metadata: {
        dispatch_decision: context.dispatcherResult.dispatch_decision,
        dispatch_confidence: context.dispatcherResult.dispatch_confidence ?? 0.5,
        mirror_sync_count: signals.mirror_sync_count,
        mirror_success_rate: signals.mirror_success_rate,
        synthesis_path_length: signals.synthesis_path_length,
        total_latency_ms: signals.total_latency_ms,
        execution_efficiency: scores.execution_efficiency,
        synthesis_scope: scores.synthesis_scope,
        reliability_score: scores.reliability_score,
      },
    });
  }

  return hits;
}

/**
 * Extract dispatcher signals for monitoring and observability
 * Returns JSON-serializable signal breakdown for audit/analytics
 *
 * @param result Dispatcher orchestration result
 * @returns Signal breakdown object
 */
export function getDispatcherSignalBreakdown(result: DispatcherOrchestrationResult) {
  const signals = extractDispatcherSignals(result);
  const scores = computeDispatcherSignalScores(signals);

  return {
    signals,
    scores,
    combined_weight: (
      scores.dispatch_decision_weight * DISPATCHER_RRF_WEIGHTS.dispatch_decision_weight +
      scores.execution_efficiency * DISPATCHER_RRF_WEIGHTS.execution_efficiency +
      scores.synthesis_scope * DISPATCHER_RRF_WEIGHTS.synthesis_scope +
      scores.reliability_score * DISPATCHER_RRF_WEIGHTS.reliability_score
    ),
  };
}

/**
 * Compute topology signal boost for specific packet
 * Used when dispatcher decision targets specific packet cluster
 *
 * @param packetId Target packet ID
 * @param result Dispatcher orchestration result
 * @param baseScore Base RRF score before boost
 * @returns Boosted score with dispatcher topology adjustment
 */
export function applyDispatcherTopologyBoost(
  packetId: string,
  result: DispatcherOrchestrationResult,
  baseScore: number
): number {
  if (!result.success) {
    return baseScore * 0.9; // Penalize failed orchestrations slightly
  }

  const signals = extractDispatcherSignals(result);
  const scores = computeDispatcherSignalScores(signals);

  // Apply dispatcher confidence boost (up to +20% to base score)
  const confidenceBoost = scores.dispatch_decision_weight * 0.2;

  // Apply execution efficiency boost (up to +15%)
  const efficiencyBoost = scores.execution_efficiency * 0.15;

  // Apply reliability boost (up to +10%)
  const reliabilityBoost = scores.reliability_score * 0.1;

  const totalBoost = confidenceBoost + efficiencyBoost + reliabilityBoost;
  return Math.min(1.0, baseScore + totalBoost); // Cap at 1.0
}

/**
 * Generate RRF lane weight for dispatcher signal
 * Called during RRF combineViaRRF() to determine signal contribution
 *
 * @param result Dispatcher orchestration result
 * @returns RRF lane weight (0-1)
 */
export function getDispatcherSignalLaneWeight(result: DispatcherOrchestrationResult): number {
  const signals = extractDispatcherSignals(result);

  // Weight dispatcher signal based on decision confidence and execution success
  // Range: 0.3 (failed orchestration) to 1.0 (perfect execution)
  const baseWeight = signals.decision_confidence;
  const reliabilityFactor = signals.mirror_success_rate;
  const successFactor = result.success ? 1.0 : 0.5;

  return Math.min(1.0, baseWeight * reliabilityFactor * successFactor);
}

/**
 * Determine if dispatcher result should suppress default retrieval
 * (e.g., if dispatcher escalated to operator, maybe skip normal ANN)
 *
 * @param result Dispatcher orchestration result
 * @returns true if retrieval should use dispatcher-guided path only
 */
export function shouldUseDispatcherGuidedRetrieval(result: DispatcherOrchestrationResult): boolean {
  // Dispatcher takes priority if it routed to escalation or quarantine
  return ['escalate', 'quarantine'].includes(result.dispatch_decision);
}
