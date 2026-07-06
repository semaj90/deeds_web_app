/**
 * Dispatcher Telemetry Integration Index
 * Wires all 9 dispatcher nodes with telemetry collection
 * Exported for use in dispatcher-graph.ts
 */

export {
  emitDispatcherTelemetry,
  withDispatcherTelemetry,
  createNodeTelemetryCollector,
  aggregateDispatcherTelemetry,
  type DispatcherTelemetryEvent,
  type DispatcherTelemetryResult,
} from './dispatcher-telemetry-wrapper.js';

export {
  AcpTelemetryCollector,
  type AcpTelemetryConfig,
  type RoutingDecision,
  type ToolCall,
  type AsyncOp,
  type TelemetryEvent,
  identifySlowOps,
  aggregateToolStats,
  aggregateAsyncOpStats,
} from './acp-mcp-telemetry.js';

/**
 * 9 Dispatcher nodes with telemetry instrumentation required:
 *
 * 1. node_escalate_quarantine — quarantine decision for unrecoverable packets
 * 2. node_recover_identity — identity recovery from partial/lost packets
 * 3. node_validate_envelope — canonical envelope validation (Zod)
 * 4. node_sync_qdrant_mirror — synchronize to Qdrant vector index
 * 5. node_sync_neo4j_mirror — synchronize to Neo4j topology
 * 6. node_expand_topology — k-hop graph expansion
 * 7. node_rerank_candidates — Karpathy blend reranking
 * 8. node_synthesize_answer — LLM synthesis (gRPC to Gemma4)
 * 9. node_escalate_operator — operator escalation for manual review
 *
 * Each node handler should be wrapped with:
 *   withDispatcherTelemetry(nodeId, handler, redis, postgres)
 *
 * This captures:
 * - Execution duration (p50/p95/p99)
 * - Routing decisions + confidence
 * - gRPC call traces (service, method, latency, status)
 * - Tool invocations (name, params_hash, duration, success/failure)
 * - Cache hits (Redis, Qdrant, Neo4j)
 */

export const DISPATCHER_NODES_WITH_TELEMETRY = [
  'node_escalate_quarantine',
  'node_recover_identity',
  'node_validate_envelope',
  'node_sync_qdrant_mirror',
  'node_sync_neo4j_mirror',
  'node_expand_topology',
  'node_rerank_candidates',
  'node_synthesize_answer',
  'node_escalate_operator',
] as const;

export type DispatcherNodeWithTelemetry = (typeof DISPATCHER_NODES_WITH_TELEMETRY)[number];
