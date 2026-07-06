/**
 * Dispatcher Mirror Worker Services & Audit
 * Exports all services for dispatcher orchestration and audit
 */

// Mirror sync services
export { syncPacketsToQdrant, validateQdrantHealth } from './qdrant-mirror-sync.js';
export type { QdrantSyncResult } from './qdrant-mirror-sync.js';

export { syncPacketsToNeo4j, validateNeo4jHealth } from './neo4j-mirror-sync.js';
export type { Neo4jSyncResult } from './neo4j-mirror-sync.js';

export { invalidateRedisCache, warmRedisCache, validateRedisHealth } from './redis-cache-invalidate.js';
export type { CacheInvalidationResult } from './redis-cache-invalidate.js';

export {
  emitDispatcherEvents,
  emitOperatorEscalation,
  emitIdentityUpdate,
  emitMirrorSyncCompleted,
  validateRabbitMQHealth,
} from './rabbitmq-event-emit.js';
export type { DispatcherEvent, EventEmissionResult } from './rabbitmq-event-emit.js';

// Orchestration
export { executeDispatcherOrchestration } from './dispatcher-orchestrator.js';
export type { DispatcherOrchestrationContext, DispatcherOrchestrationResult } from './dispatcher-orchestrator.js';

// Event listener
export { startIdentityListener, validateListenerSetup } from './rabbitmq-identity-listener.js';

// Audit
export {
  persistDispatcherDecision,
  getRecentDecisions,
  getAuditStats,
  cleanupOldAuditLogs,
} from './dispatcher-audit-service.js';
export { dispatcherAuditLog } from './dispatcher-audit-schema.js';
export type { DispatcherAuditLog, DispatcherAuditLogInsert } from './dispatcher-audit-schema.js';

// Signal extraction and topology integration (Session 117)
export {
  extractDispatcherSignals,
  computeDispatcherSignalScores,
  getDecisionSignalWeight,
  dispatcherSignalsToRRFLane,
} from './dispatcher-signal-extractor.js';
export type { DispatcherSignals, DispatcherSignalScore } from './dispatcher-signal-extractor.js';

export {
  generateDispatcherTopologyHits,
  getDispatcherSignalBreakdown,
  applyDispatcherTopologyBoost,
  getDispatcherSignalLaneWeight,
  shouldUseDispatcherGuidedRetrieval,
} from './dispatcher-topology-service.js';
export type { TopologySignalContext } from './dispatcher-topology-service.js';
