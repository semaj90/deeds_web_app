/**
 * Dynamic Dispatcher — Route packets through recovery/validation/search based on identity state
 *
 * Decision tree (deterministic, rule-based v1):
 * 1. Identity lane check → quarantine route?
 * 2. Envelope validation check → validate route?
 * 3. Parity status check → sync route?
 * 4. Candidate stats check → expand/rerank/synthesize?
 *
 * This sits between identity-lane-router and MCP tool execution.
 * v2 can add HMM/logistic regression after collecting dispatch telemetry.
 */

import type { CanonicalEnvelope } from '../topology/canonical-id-hierarchy.js';

export type DispatchDecision =
  | 'quarantine_review'        // lost packet_key → human review
  | 'recover_identity'         // partial identity → reconstruct packet_key
  | 'validate_envelope'        // Zod validation failed → fix envelope
  | 'sync_qdrant'              // parity_status !== 'matched' → backfill Qdrant
  | 'sync_neo4j'               // neo4j_node_id missing → backfill Neo4j
  | 'expand_graph'             // low RRF score → k-hop topology expansion
  | 'rerank'                   // too many candidates → GPU reranker
  | 'synthesize'               // canonical + valid + ready → LLM synthesis
  | 'request_human_review';    // ambiguous → escalate

export interface DispatcherState {
  identity_lane: 'canonical' | 'recoverable' | 'quarantine' | 'mirror_orphan';
  zod_valid: boolean;
  zod_errors?: string[];
  parity_status?: 'matched' | 'diverged' | 'unknown';
  qdrant_synced?: boolean;
  neo4j_synced?: boolean;
  rrf_score?: number;
  candidates_count?: number;
  canonical_envelope?: CanonicalEnvelope;
}

/**
 * Dispatch policy: deterministic routing based on state
 *
 * Order matters: check hard blockers (quarantine) before soft warnings (parity).
 */
export function computeDispatchDecision(state: DispatcherState): DispatchDecision {
  // ── HARD BLOCKERS (cannot proceed) ──────────────────────────────────────────
  if (state.identity_lane === 'quarantine') {
    return 'quarantine_review';
  }

  if (state.identity_lane === 'recoverable') {
    return 'recover_identity';
  }

  // ── VALIDATION GATES ───────────────────────────────────────────────────────
  if (!state.zod_valid) {
    return 'validate_envelope';
  }

  // ── PARITY SYNC GATES ──────────────────────────────────────────────────────
  // Sync Qdrant first (vector search is primary retrieval path)
  if (state.qdrant_synced === false) {
    return 'sync_qdrant';
  }

  // Then Neo4j (topology expansion is secondary)
  if (state.neo4j_synced === false) {
    return 'sync_neo4j';
  }

  // ── RETRIEVAL OPTIMIZATION ────────────────────────────────────────────────
  // If RRF score is very low, topology expansion might help
  if (state.rrf_score !== undefined && state.rrf_score < 0.01) {
    return 'expand_graph';
  }

  // If too many candidates, GPU rerank to narrow down
  if (state.candidates_count !== undefined && state.candidates_count > 100) {
    return 'rerank';
  }

  // ── DEFAULT: READY FOR SYNTHESIS ───────────────────────────────────────────
  return 'synthesize';
}

/**
 * LangGraph conditional edge: select next node based on dispatch decision
 *
 * Usage in LangGraph:
 *   {
 *     source: 'identity_validation_node',
 *     target: dispatch_conditional_edge,
 *     conditional: (state) => routeByDispatch(state)
 *   }
 */
export function routeByDispatch(state: DispatcherState): string {
  const decision = computeDispatchDecision(state);

  // Map dispatch decisions to LangGraph node names
  const nodeMap: Record<DispatchDecision, string> = {
    'quarantine_review': 'quarantine_escalation',
    'recover_identity': 'identity_recovery_node',
    'validate_envelope': 'envelope_validation_node',
    'sync_qdrant': 'qdrant_sync_node',
    'sync_neo4j': 'neo4j_sync_node',
    'expand_graph': 'graph_expansion_node',
    'rerank': 'gpu_rerank_node',
    'synthesize': 'gemma4_synthesis_node',
    'request_human_review': 'escalation_node'
  };

  return nodeMap[decision] || 'synthesize';
}

/**
 * MCP tool surface for dispatcher decisions
 *
 * Expose only these stable tools; don't create a tool per script.
 */
export const DISPATCHER_MCP_TOOLS = [
  'identity.assign_lane',
  'identity.recover',
  'identity.promote',
  'identity.quarantine',
  'retrieval.search',
  'retrieval.rerank',
  'graph.expand',
  'mirror.sync_qdrant',
  'mirror.sync_neo4j',
  'envelope.validate',
  'answer.synthesize'
] as const;

export type DispatcherMcpTool = (typeof DISPATCHER_MCP_TOOLS)[number];

/**
 * Helper: translate dispatch decision to MCP tool call
 */
export function dispatchToMcpTool(decision: DispatchDecision): DispatcherMcpTool | null {
  const toolMap: Record<DispatchDecision, DispatcherMcpTool | null> = {
    'quarantine_review': 'identity.quarantine',
    'recover_identity': 'identity.recover',
    'validate_envelope': 'envelope.validate',
    'sync_qdrant': 'mirror.sync_qdrant',
    'sync_neo4j': 'mirror.sync_neo4j',
    'expand_graph': 'graph.expand',
    'rerank': 'retrieval.rerank',
    'synthesize': 'answer.synthesize',
    'request_human_review': null
  };

  return toolMap[decision];
}

/**
 * Telemetry: log dispatch decisions for later HMM/logistic regression training
 */
export interface DispatchTelemetry {
  timestamp: string;
  decision: DispatchDecision;
  state: DispatcherState;
  latency_ms: number;
  outcome?: 'success' | 'degraded' | 'failed';
}

export function logDispatchTelemetry(telemetry: DispatchTelemetry): void {
  console.log(
    `[dispatcher] ${telemetry.decision} (latency: ${telemetry.latency_ms}ms, ` +
      `lane: ${telemetry.state.identity_lane}, rrf: ${telemetry.state.rrf_score ?? 'N/A'})`
  );
  // TODO: persist to Postgres / Redis for training data collection
}
