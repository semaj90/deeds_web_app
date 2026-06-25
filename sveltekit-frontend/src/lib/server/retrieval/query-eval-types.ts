/**
 * Query Evaluation & Timing Types
 *
 * Global utility types for testing and evaluating query performance
 * across multiple datastores (Postgres, Qdrant, Neo4j, Redis, Go Retrieval).
 *
 * Used by ACE cache lookups, retrieval benchmarks, and latency monitoring.
 */

import type { UnifiedRetrievalResult } from '$lib/server/types/retrieval.js';
import type { SearchTiming } from '$lib/server/grpc/retrieval-client.js';

/**
 * Query execution on a single datastore.
 * Tracks timing, result count, and errors for performance analysis.
 */
export interface QueryExecution {
  /** Which datastore executed this query */
  source: 'postgres' | 'qdrant' | 'neo4j' | 'redis' | 'bifrost' | 'go-retrieval';
  /** Query text or parameters */
  query: string;
  /** Wall-clock execution time in milliseconds */
  executionMs: number;
  /** Result count */
  hitCount: number;
  /** Cache layer that served this result (if applicable) */
  cacheLayer?: 'L0' | 'L1' | 'L2' | 'L3';
  /** Time to first result (latency) */
  ttfbMs?: number;
  /** Whether the query succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Multi-datastore query evaluation.
 * Tracks parallel or sequential execution across multiple sources.
 */
export interface MultiDatastoreQueryEval {
  /** Unique evaluation ID */
  evalId: string;
  /** User query or search terms */
  query: string;
  /** Execution strategy */
  strategy: 'parallel' | 'sequential' | 'cached-first';
  /** Executions on each datastore */
  executions: QueryExecution[];
  /** Aggregated timing across all sources */
  timing: MultiDatastoreTimingBreakdown;
  /** Unified results from all sources, deduplicated */
  unifiedResults: UnifiedRetrievalResult[];
  /** How many results came from each source */
  resultsBySource: Record<string, number>;
  /** Whether this evaluation hit cache */
  cacheHit: boolean;
  /** Which source provided the fastest result */
  fastestSource?: string;
  /** Total wall-clock time for the entire evaluation */
  totalMs: number;
  /** Timestamp when evaluation started */
  startedAt: Date;
  /** Timestamp when evaluation completed */
  completedAt: Date;
}

/**
 * Timing breakdown for multi-datastore queries.
 * Separates orchestration overhead from actual query time.
 */
export interface MultiDatastoreTimingBreakdown {
  /** Time to dispatch queries to all datastores */
  dispatchMs: number;
  /** Fastest result arrival */
  firstResultMs: number;
  /** Time until all results received */
  allResultsMs: number;
  /** Time spent on deduplication and normalization */
  mergeMs: number;
  /** Time spent on reranking/scoring */
  rerankMs: number;
  /** Total overhead (orchestration, dedup, rerank) */
  overheadMs: number;
}

/**
 * Query execution log for ACE cache and performance monitoring.
 * Compact format for bulk storage and analysis.
 */
export interface QueryExecutionLog {
  /** Evaluation ID for correlation */
  evalId: string;
  /** Query text (truncated to 200 chars) */
  query: string;
  /** All timing measurements in one place */
  timing: SearchTiming & {
    /** Dispatch/orchestration overhead */
    orchestrationMs?: number;
    /** Total end-to-end wall-clock time */
    wallClockMs?: number;
  };
  /** Success/failure status */
  status: 'success' | 'partial' | 'failure';
  /** Error details if failed */
  errorMessage?: string;
  /** Number of results returned */
  resultCount: number;
  /** Sources queried */
  sources: string[];
  /** Which cache layer(s) were checked */
  cacheLayers: ('L0' | 'L1' | 'L2' | 'L3')[];
  /** Whether cache was hit */
  cacheHit: boolean;
  /** Timestamp for log entry */
  timestamp: Date;
}

/**
 * ACE cache lookup evaluation.
 * Tracks performance of ACE-specific lookups (stage timing, blend rerank, etc).
 */
export interface ACECacheLookupEval {
  /** ACE context ID */
  contextId: string;
  /** Current ACE stage */
  stage: 'A0' | 'A0.5' | 'A1' | 'A2' | 'A3';
  /** Original query */
  query: string;
  /** Cache key used for lookup */
  cacheKey: string;
  /** Whether cache hit occurred */
  cacheHit: boolean;
  /** Time spent on cache lookup */
  cacheLookupMs: number;
  /** Results returned */
  results: UnifiedRetrievalResult[];
  /** Metadata about which sources contributed */
  contributingSourcesMs: Record<string, number>;
  /** Karpathy blend rerank timing (if Stage A0.5+) */
  karpathyRerankMs?: number;
  /** Total execution time */
  totalMs: number;
  /** Whether lookup succeeded */
  success: boolean;
}

/**
 * Bulk query evaluation report.
 * Aggregates multiple evaluations for performance analysis.
 */
export interface QueryEvaluationReport {
  /** Report ID */
  reportId: string;
  /** Time range covered */
  period: {
    startedAt: Date;
    endedAt: Date;
  };
  /** All evaluations in report */
  evaluations: MultiDatastoreQueryEval[];
  /** Aggregate statistics */
  stats: {
    totalQueries: number;
    averageExecutionMs: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    failureRate: number;
    cacheHitRate: number;
    averageResultCount: number;
  };
  /** Performance by source */
  sourceStats: Record<
    string,
    {
      queryCount: number;
      averageMs: number;
      hitRate: number;
      successRate: number;
    }
  >;
}

/**
 * Helper to evaluate a query against multiple datastores.
 * Usage:
 *   const result = await evaluateQuery(query, ['qdrant', 'postgres', 'neo4j']);
 *   console.log(`Fastest: ${result.fastestSource} (${result.timing.firstResultMs}ms)`);
 */
export type QueryEvaluator = (
  query: string,
  sources: Array<'postgres' | 'qdrant' | 'neo4j' | 'redis' | 'bifrost' | 'go-retrieval'>,
  options?: {
    strategy?: 'parallel' | 'sequential' | 'cached-first';
    timeout?: number;
    limit?: number;
  }
) => Promise<MultiDatastoreQueryEval>;

/**
 * Helper to log query execution for ACE cache analysis.
 * Usage:
 *   await logQueryExecution(queryEvalResult);
 */
export type QueryExecutionLogger = (
  queryEval: MultiDatastoreQueryEval | ACECacheLookupEval
) => Promise<void>;
