/**
 * Parent Atlas Retrieval Contracts
 * Canonical interfaces for retrieval requests, results, and policies
 * No database connections, no SvelteKit dependencies
 */

import type { RankedPacket } from './packet.js';
import type { AceContext, RlmContext } from './context.js';
import type { RetrievalTrace } from './provenance.js';

/**
 * Retrieval use case — determines policy and context assembly
 */
export type RetrievalUseCase =
  | 'developer_chat'      // ACP: conversational assistant for developers
  | 'production_legal'    // Production app: legal document retrieval
  | 'code_navigation'     // IDE: symbol search, file browser
  | 'agent_context'       // Agent: compact context for tool calling
  | 'rlm_context';        // Iterative: external working memory for reasoning

/**
 * Retrieval request — consumer-facing API
 */
export interface RetrievalRequest {
  /** Query text */
  query: string;

  /** Use case determines retrieval and context policy */
  useCase: RetrievalUseCase;

  /** Number of final results (default 10) */
  topK?: number;

  /** Constrain results to specific source refs (e.g., ['src/lib/server/*']) */
  sourceScope?: string[];

  /** Filter by packet types (e.g., ['code', 'test', 'doc']) */
  packetTypes?: string[];

  /** Bounded graph expansion depth (default 2, max 4) */
  graphDepth?: number;

  /** Token budget for context assembly (default use-case specific) */
  tokenBudget?: number;

  /** Require all results have valid source_ref (default true) */
  requireSourceRefs?: boolean;

  /** Optional session/user context for personalization */
  sessionId?: string;
  userId?: string;
}

/**
 * Ranked candidate from retrieval
 */
export interface RankedCandidate extends RankedPacket {
  /** Retrieval stage that produced this score */
  retrievedVia: 'bm25' | 'qdrant' | 'graph' | 'xgboost' | 'crossencoder';

  /** Scores from each ranking stage (for analysis) */
  scores?: {
    semantic?: number;
    bm25?: number;
    topology?: number;
    xgboost?: number;
    crossencoder?: number;
  };
}

/**
 * Assembled context — policy-specific output
 */
export type AssembledContext = AceContext | RlmContext;

/**
 * Retrieval result — consumer-facing output
 */
export interface RetrievalResult {
  /** Original query */
  query: string;

  /** Use case that was applied */
  useCase: RetrievalUseCase;

  /** Ranked candidates */
  candidates: RankedCandidate[];

  /** Context assembled for the use case */
  context: AssembledContext;

  /** Execution trace (timing, stages, decisions) */
  trace: RetrievalTrace;
}

/**
 * Retrieval facade — single canonical interface
 */
export interface RetrievalFacade {
  /**
   * Execute unified retrieval with policy selection
   * @param request Retrieval request with use-case specific policy
   * @returns Retrieval result with ranked candidates and assembled context
   */
  search(request: RetrievalRequest): Promise<RetrievalResult>;

  /**
   * Health check
   * @returns true if all services are available
   */
  health(): Promise<boolean>;
}

/**
 * Retrieval policy — internal routing and parameter selection
 */
export interface RetrievalPolicy {
  /** Use case this policy serves */
  useCase: RetrievalUseCase;

  /** BM25 candidate limit (recall stage) */
  bm25Limit: number;

  /** Qdrant ANN limit (recall stage) */
  qdrantLimit: number;

  /** RRF/dedup candidate limit */
  rffLimit: number;

  /** Graph expansion limit (after XGBoost) */
  graphLimit: number;

  /** CrossEncoder reranker limit (final stage) */
  crossencoderLimit: number;

  /** Final output limit */
  outputLimit: number;

  /** Whether to perform graph expansion */
  enableGraphExpansion: boolean;

  /** Max graph depth (1-4) */
  graphDepth: number;

  /** Whether to apply CrossEncoder reranking */
  enableCrossencoder: boolean;

  /** CrossEncoder weight in final score (0-1) */
  crossencoderWeight: number;

  /** Whether to require valid source_refs (hard gate) */
  requireSourceRefs: boolean;

  /** Context assembly type */
  contextPolicy: 'ace' | 'rlm';

  /** Default token budget */
  defaultTokenBudget: number;
}

/**
 * Policy registry — maps use cases to policies
 */
export interface PolicyRegistry {
  /**
   * Get policy for a use case
   * @param useCase Retrieval use case
   * @returns Policy configuration
   */
  getPolicy(useCase: RetrievalUseCase): RetrievalPolicy;

  /**
   * Register or override a policy
   * @param useCase Use case to configure
   * @param policy Policy configuration
   */
  registerPolicy(useCase: RetrievalUseCase, policy: RetrievalPolicy): void;
}
