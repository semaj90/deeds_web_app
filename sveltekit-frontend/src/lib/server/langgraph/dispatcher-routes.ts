/**
 * Dispatcher Conditional Edge Router
 * Maps dispatcher decision → LangGraph node handler
 */

import type { DispatcherState } from './dispatcher-nodes/types.js';

export const DISPATCHER_DECISION_TO_NODE: Record<string, string> = {
  score_gates: 'node_bitmap_gate_scoring',
  quarantine: 'node_escalate_quarantine',
  recover: 'node_recover_identity',
  validate: 'node_validate_envelope',
  sync_qdrant: 'node_sync_qdrant_mirror',
  sync_neo4j: 'node_sync_neo4j_mirror',
  expand_graph: 'node_expand_topology',
  rerank: 'node_rerank_candidates',
  synthesize: 'node_synthesize_answer',
  escalate: 'node_escalate_operator',
};

export function routeByDispatch(state: DispatcherState): string {
  const decision = state.dispatch_decision;

  if (!decision) {
    console.warn('[routeByDispatch] No dispatch decision found, routing to escalate');
    return DISPATCHER_DECISION_TO_NODE['escalate'];
  }

  const nodeId = DISPATCHER_DECISION_TO_NODE[decision];

  if (!nodeId) {
    console.warn(`[routeByDispatch] Unknown decision: ${decision}, routing to escalate`);
    return DISPATCHER_DECISION_TO_NODE['escalate'];
  }

  console.log(`[routeByDispatch] decision=${decision} → node=${nodeId}`);
  return nodeId;
}

/**
 * Node registry — all 10 nodes available for LangGraph execution
 */
export const DISPATCHER_NODES = {
  node_bitmap_gate_scoring: 'node_bitmap_gate_scoring',
  node_escalate_quarantine: 'node_escalate_quarantine',
  node_recover_identity: 'node_recover_identity',
  node_validate_envelope: 'node_validate_envelope',
  node_sync_qdrant_mirror: 'node_sync_qdrant_mirror',
  node_sync_neo4j_mirror: 'node_sync_neo4j_mirror',
  node_expand_topology: 'node_expand_topology',
  node_rerank_candidates: 'node_rerank_candidates',
  node_synthesize_answer: 'node_synthesize_answer',
  node_escalate_operator: 'node_escalate_operator',
} as const;

export type DispatcherNodeId = keyof typeof DISPATCHER_NODES;

export function isValidDispatcherNode(nodeId: string): nodeId is DispatcherNodeId {
  return nodeId in DISPATCHER_NODES;
}
