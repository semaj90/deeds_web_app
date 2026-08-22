/**
 * atlas-core — Canonical packet identity, RPC contracts, and validation
 *
 * Central hub for all packet-related types and operations used across the codebase.
 * Prevents duplication, ensures consistent contracts, and enables Rust/Go/Python integration.
 */

// Packet identity (core spine)
export * from './packet/index.js';

// Evidence pipeline
export * from './evidence/index.js';

// Shared types and utilities
export * from './types/index.js';

// RPC contracts (future)
// export * from './rpc/index.js';

// Ranking (Phase 85 P1)
export { rankSupersedes } from './ranking/supersedes-ranker.js';
export type { ArtifactDecision, RankerInput, RankerOutput } from './ranking/supersedes-ranker.js';

// Validation (Phase 2.5)
export { executeGanDeepAudit, analyzeTokenSavings, generateAgenticRecommendations, auditProductionHardening } from './validation/gan-deep-audit.js';
export { GanAuditOrchestrator } from './validation/gan-audit-integration.js';
export { createGanAuditDependencies, createMinimalGanAuditDependencies } from './validation/gan-audit-client-factory.js';
export type { GanDeepAuditConfig, GanDeepAuditResult } from './validation/gan-deep-audit.js';
export type { GanAuditDependencies } from './validation/gan-audit-integration.js';

// Retrieval (Phase 2.5)
export { searchFeatureRegistry, generateTokenSavingsRecommendation } from './retrieval/feature-registry-search.js';
export { analyzeRetrievalCoverage, detectRetrievalGaps, generateRetrievalRecommendations } from './retrieval/gan-retrieval-analysis.js';
export type { SearchablePacket, RetrievalGap, SearchQualityMetrics } from './retrieval/gan-retrieval-analysis.js';

// Packet ingestion (Phase 85 P5)
export { PacketReader } from './packet-reader.js';
export type { Packet, PacketReaderOptions } from './packet-reader.js';

// Policy task routing (Phase 85 P5)
export { classifyPacketTask, getTaskRoute, groupPacketsByTask, TASK_ROUTES } from './policy-task-router.js';
export type { PolicyTaskType, PolicyTask, TaskRoute } from './policy-task-router.js';

// Workstation orchestrator (Phase 85 P5-P9)
export { WorkstationOrchestrator } from './workstation-orchestrator.js';
export type { WorkstationConfig, WorkstationResult } from './workstation-orchestrator.js';

// GPU/CPU boundary (future)
// export * from './gpu/index.js';
