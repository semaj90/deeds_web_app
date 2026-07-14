/**
 * src/lib/server/retrieval/index.ts — Public retrieval types barrel
 *
 * Exports unified search/retrieval types and utilities for:
 * - Go Retrieval Service (gRPC) queries
 * - Datastore queries (Postgres, Qdrant, Neo4j, Redis, Bifrost)
 * - Multi-lane retrieval orchestration (RAG, KAG, DAG)
 * - ACE cache lookups and evaluation logging
 *
 * Usage in ACE or cache systems:
 *   import type { GoRetrievalSearchHit, UnifiedRetrievalResult } from '$lib/server/retrieval';
 *   const results = await goRetrievalQuery(...);
 *   const unified = results.map(r => normalizeResult(r));
 */

// ── Go Retrieval Service (gRPC client types) ────────────────────────────────
export type {
  GoRetrievalSearchHit,
  GoRetrievalSearchResponse,
  GoRetrievalSearchParams,
} from './go-retrieval-client.js';

// ── Unified retrieval result (canonical normalization across all sources) ────
export type {
  RetrievalKind,
  RetrievalSourceSystem,
  RetrievalCacheLayer,
  RankExplain,
  UnifiedRetrievalResult,
} from '$lib/server/types/retrieval.js';

// ── gRPC retrieval client (evidence search) ────────────────────────────────
export type {
  EvidenceSearchParams,
  SearchResult,
  GraphNeighbor,
  DocumentContext,
  ContextBundle,
  SearchTiming,
  EvidenceSearchResponse,
  RetrievedCodebaseChunk,
  SearchChunksResponse,
  RetrievalClusterContext,
  ClusterSummaryLookupResponse,
} from '$lib/server/grpc/retrieval-client.js';

// ── ACE retrieval logging and evaluation ────────────────────────────────────
export * from '$lib/server/features/rag/ace-retrieval-logger.js';

// ── Canonical feature-envelope rerank bridge ────────────────────────────────
export type {
  CanonicalRerankEnvelope,
  CanonicalRerankResult,
  CanonicalRerankProvenance,
} from './canonical-rerank-executor.js';
export {
  DEFAULT_CANONICAL_RERANK_WEIGHTS,
  buildCanonicalRerankCacheKey,
  canonicalEnvelopeToRerankCandidate,
  envelopeToMixedbreadCandidate,
  rerankedCandidateToCanonicalEnvelope,
  rerankCanonicalFeatureEnvelopes,
  MixedbreadCanonicalReranker,
} from './canonical-rerank-executor.js';

// ── Query evaluation and timing (multi-datastore testing) ────────────────────
export type {
  QueryExecution,
  MultiDatastoreQueryEval,
  MultiDatastoreTimingBreakdown,
  QueryExecutionLog,
  ACECacheLookupEval,
  QueryEvaluationReport,
  QueryEvaluator,
  QueryExecutionLogger,
} from './query-eval-types.js';
