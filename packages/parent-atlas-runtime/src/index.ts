/**
 * Parent Atlas Runtime Package
 * Infrastructure-backed implementation (database adapters, pipeline orchestration)
 *
 * Exports:
 * - Adapters for each retrieval stage (BM25, Qdrant, identity resolution, RRF)
 * - Pipeline orchestration (complete RetrievalFacade implementation)
 * - Telemetry and tracing
 *
 * Zero contract dependencies on consumers. Adapters are pure functions or classes.
 * Consumers import from @deeds/parent-atlas-core (contracts) and @deeds/parent-atlas-client (HTTP/MCP).
 */

// Adapters
export { searchPostgresBM25, scoreBM25, filterBySourceScope, validateBM25Results } from './adapters/postgres-bm25.adapter.js';
export type { Postgres25TextSearchOptions, BM25Candidate } from './adapters/postgres-bm25.adapter.js';

export { searchQdrantANN, validateQdrantResults, filterQdrantBySourceScope, mergeBM25AndQdrant, hashQueryForCache } from './adapters/qdrant-recall.adapter.js';
export type { QdrantRecallOptions, QdrantRecallResult, EmbeddingCache } from './adapters/qdrant-recall.adapter.js';

export {
  resolveCanonicalIdentity,
  validatePacketLineage,
  blendDuplicateScores,
  reportDuplicateMetrics
} from './adapters/identity-resolver.js';
export type { CandidateForIdentityResolution, IdentityResolutionResult, DuplicateReport } from './adapters/identity-resolver.js';

export { fuseWithRRF, validateRRFResults, computeRRFMetrics } from './adapters/rrf-fusion.adapter.js';
export type { RRFCandidateInput, RRFFusedCandidate, RRFMetrics } from './adapters/rrf-fusion.adapter.js';

// Facade & Orchestration
export { ParentAtlasRetrievalFacade, createRetrievalFacade } from './facade/retrieval-facade.js';
export type { RetrievalFacadeConfig } from './facade/retrieval-facade.js';

// Re-export core contracts for convenience
export type { RetrievalFacade, RetrievalRequest, RetrievalResult, RetrievalPolicy, RankedCandidate } from '@deeds/parent-atlas-core';
export { getPolicyRegistry, setPolicyRegistry, DEFAULT_POLICIES } from '@deeds/parent-atlas-core';
