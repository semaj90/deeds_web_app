/**
 * Go Retrieval Facade — Unified Orchestrator Integration
 *
 * Wires the unified retrieval orchestrator into Go Retrieval HTTP API.
 * Exposes a single /search endpoint that orchestrates:
 * 1. Embedding (embeddinggemma)
 * 2. Qdrant ANN search
 * 3. TurboVec prefilter
 * 4. Postgres truth join
 * 5. Unified ranking (6-signal blend)
 * 6. Gemma4 summarization (optional)
 *
 * Go Retrieval service (:8100) calls this facade to coordinate all services.
 * Clients call Go Retrieval HTTP API instead of managing five services.
 */

import { ENV } from '$lib/server/env.server.js';
import {
  executeUnifiedRetrieval,
  executeUnifiedRetrievalWithSummarization,
  type RetrievalRequest,
  type RetrievalResult
} from './unified-orchestrator.js';
import { validateCanonicalEnvelope, type CanonicalEnvelope } from '$lib/server/topology/canonical-id-hierarchy.js';
import { createPermissionManager, type PermissionManager } from '$lib/server/topology/permission-manager.js';
import { integrateDispatcher } from '$lib/server/dispatch/dispatcher-integration.js';

export interface GoRetrievalFacadeRequest {
  query: string;
  limit?: number;
  topK?: number;
  top_k?: number;
  useRRF?: boolean;
  use_rrf?: boolean;
  useLexical?: boolean;
  use_lexical?: boolean;
  includeSummary?: boolean;
  include_summary?: boolean;
  summaryMaxTokens?: number;
  summary_max_tokens?: number;
  summaryTemperature?: number;
  summary_temperature?: number;
  filters?: Record<string, unknown>;
  caseId?: string;
  case_id?: string;
}

export interface GoRetrievalFacadeResponse {
  results: Array<{
    id: string;
    score: number;
    file_path: string;
    relative_path: string;
    symbol: string;
    kind: string;
    ranks: Record<string, number>;
    identity_lane?: 'canonical' | 'recoverable' | 'quarantine';
    canonical_envelope?: CanonicalEnvelope;
  }>;
  summary?: {
    text: string;
    confidence: number;
    extracted_entities: string[];
    key_relations: Array<{ from: string; relation: string; to: string }>;
  };
  timing: {
    embedding_ms: number;
    qdrant_search_ms: number;
    turbovec_transform_ms: number;
    postgres_join_ms: number;
    total_ms: number;
  };
  stages_completed: string[];
  fallback_used: boolean;
  identity_validation?: {
    candidates_before: number;
    candidates_after: number;
    quarantined: number;
    recovery_lane_count: number;
  };
  dispatch?: {
    decision: string;
    node_id: string;
    mcp_tool: string | null;
    should_proceed_to_synthesis: boolean;
    latency_ms: number;
  };
  metadata: {
    query: string;
    query_embedding_dim: number;
    qdrant_candidates: number;
    turbovec_candidates: number;
    postgres_join_count: number;
    top_k: number;
  };
}

/**
 * Normalize Go Retrieval request to unified orchestrator format
 */
function normalizeRequest(req: GoRetrievalFacadeRequest): RetrievalRequest {
  return {
    query: req.query,
    limit: req.limit ?? req.topK ?? req.top_k ?? 10,
    useRRF: req.useRRF ?? req.use_rrf ?? true,
    useLexical: req.useLexical ?? req.use_lexical ?? false
  };
}

/**
 * Normalize unified orchestrator response to Go Retrieval format
 */
function normalizeResponse(
  result: RetrievalResult & { summary?: any },
  query: string,
  fallback: boolean
): GoRetrievalFacadeResponse {
  return {
    results: result.candidates.map((c) => ({
      id: c.id,
      score: c.score,
      file_path: c.path,
      relative_path: c.path,
      symbol: c.symbol,
      kind: c.kind,
      ranks: c.ranks
    })),
    summary: result.summary
      ? {
          text: result.summary.summary,
          confidence: result.summary.confidence,
          extracted_entities: result.summary.extracted_entities,
          key_relations: result.summary.key_relations
        }
      : undefined,
    timing: {
      embedding_ms: result.timing.embedding ?? 0,
      qdrant_search_ms: result.timing.qdrant_search ?? 0,
      turbovec_transform_ms: result.timing.turbovec_transform ?? 0,
      postgres_join_ms: result.timing.postgres_join ?? 0,
      total_ms: result.timing.total
    },
    stages_completed: result.stages_completed,
    fallback_used: result.fallback_used || fallback,
    metadata: {
      query,
      query_embedding_dim: 768,
      qdrant_candidates: result.candidates.length,
      turbovec_candidates: result.candidates.length,
      postgres_join_count: result.candidates.length,
      top_k: result.candidates.length
    }
  };
}

/**
 * Execute unified retrieval via Go Retrieval facade with identity validation
 * Main entry point for Go Retrieval HTTP API
 *
 * Steps:
 * 1. Execute unified retrieval (standard 6-signal RRF)
 * 2. Validate each candidate has canonical envelope
 * 3. Filter by recovery lanes (canonical + recoverable only)
 * 4. Classify into identity lanes for ACE error recovery routing
 */
export async function executeGoRetrievalSearch(
  request: GoRetrievalFacadeRequest,
  includeSummary?: boolean
): Promise<GoRetrievalFacadeResponse> {
  let fallback = false;
  const identityValidation = {
    candidates_before: 0,
    candidates_after: 0,
    quarantined: 0,
    recovery_lane_count: 0
  };

  try {
    const unified = normalizeRequest(request);
    const shouldSummarize = includeSummary ?? request.includeSummary ?? request.include_summary ?? false;

    const summaryOptions = shouldSummarize
      ? {
          max_tokens: request.summaryMaxTokens ?? request.summary_max_tokens ?? 128,
          temperature: request.summaryTemperature ?? request.summary_temperature ?? 0.3
        }
      : undefined;

    const result = shouldSummarize
      ? await executeUnifiedRetrievalWithSummarization(unified, undefined, summaryOptions)
      : await executeUnifiedRetrieval(unified);

    // ── Identity Validation Gate ──────────────────────────────────────────────
    identityValidation.candidates_before = result.candidates.length;

    // Validate each candidate and classify into recovery lanes
    const validated = result.candidates
      .map((c: any) => {
        // Build minimal CanonicalEnvelope from candidate
        const envelope: Partial<CanonicalEnvelope> = {
          repository_id: c.id || '',
          directory_id: c.path || '',
          file_id: c.path || '',
          module_id: c.symbol || '',
          symbol_id: c.symbol || '',
          feature_id: c.id || '',
          packet_key: c.id || '',
          chunk_id: c.id || '',
          source_ref: c.path || ''
        };

        const validation = validateCanonicalEnvelope(envelope as CanonicalEnvelope);
        return {
          ...c,
          identity_lane: validation.recovery_lane,
          validation_errors: validation.errors,
          is_valid: validation.valid
        };
      })
      .filter((c: any) => {
        // Only return canonical or recoverable lanes (no quarantine)
        if (c.identity_lane === 'canonical' || c.identity_lane === 'recoverable') {
          return true;
        }
        identityValidation.quarantined++;
        return false;
      });

    identityValidation.candidates_after = validated.length;
    identityValidation.recovery_lane_count = validated.filter((c: any) => c.identity_lane === 'recoverable').length;

    console.log(
      `[identity-validation] ${identityValidation.candidates_before} → ${identityValidation.candidates_after} ` +
        `(quarantined: ${identityValidation.quarantined}, recovery: ${identityValidation.recovery_lane_count})`
    );

    // ── Dispatcher Routing Gate ───────────────────────────────────────────────
    // Compute dispatch decision based on identity lanes + parity status
    let dispatchResult;
    try {
      dispatchResult = await integrateDispatcher(validated, {
        caseId: request.case_id ?? request.caseId,
        userId: undefined // Extract from context in future sessions
      });

      console.log(
        `[dispatcher] decision=${dispatchResult.decision} ` +
          `node=${dispatchResult.nodeId} ` +
          `proceed=${dispatchResult.shouldProceedToSynthesis} ` +
          `latency=${dispatchResult.telemetry.latency_ms}ms`
      );
    } catch (err) {
      console.warn('[dispatcher] integration failed (non-blocking):', err);
      dispatchResult = undefined;
    }

    // ── Reconstruct response with validated candidates ────────────────────────
    const response = normalizeResponse(result, request.query, fallback);
    response.results = validated.map((c: any) => ({
      id: c.id,
      score: c.score,
      file_path: c.path,
      relative_path: c.path,
      symbol: c.symbol,
      kind: c.kind,
      ranks: c.ranks,
      identity_lane: c.identity_lane
    }));
    response.identity_validation = identityValidation;

    if (dispatchResult) {
      response.dispatch = {
        decision: dispatchResult.decision,
        node_id: dispatchResult.nodeId,
        mcp_tool: dispatchResult.mcpTool,
        should_proceed_to_synthesis: dispatchResult.shouldProceedToSynthesis,
        latency_ms: dispatchResult.telemetry.latency_ms
      };
    }

    return response;
  } catch (err) {
    console.error('[go-retrieval-facade] execution failed:', err);
    fallback = true;

    // Return graceful degradation
    return {
      results: [],
      summary: undefined,
      timing: {
        embedding_ms: 0,
        qdrant_search_ms: 0,
        turbovec_transform_ms: 0,
        postgres_join_ms: 0,
        total_ms: 0
      },
      stages_completed: [],
      fallback_used: true,
      identity_validation: identityValidation,
      metadata: {
        query: request.query,
        query_embedding_dim: 0,
        qdrant_candidates: 0,
        turbovec_candidates: 0,
        postgres_join_count: 0,
        top_k: 0
      }
    };
  }
}

/**
 * Health check for Go Retrieval facade
 * Verifies all 5 services are operational
 */
export async function checkGoRetrievalHealth(): Promise<{
  ok: boolean;
  services: Record<string, boolean>;
  details: Record<string, string>;
}> {
  const services: Record<string, boolean> = {};
  const details: Record<string, string> = {};

  // Check Ollama (embedding)
  try {
    const res = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(2000) });
    services.ollama = res.ok;
    details.ollama = res.ok ? 'OK' : `HTTP ${res.status}`;
  } catch (err) {
    services.ollama = false;
    details.ollama = (err as Error).message;
  }

  // Check Qdrant
  try {
    const res = await fetch('http://127.0.0.1:6333/collections', { signal: AbortSignal.timeout(2000) });
    services.qdrant = res.ok;
    details.qdrant = res.ok ? 'OK' : `HTTP ${res.status}`;
  } catch (err) {
    services.qdrant = false;
    details.qdrant = (err as Error).message;
  }

  // Check TurboVec
  try {
    const res = await fetch('http://127.0.0.1:8791/health', { signal: AbortSignal.timeout(2000) });
    services.turbovec = res.ok;
    details.turbovec = res.ok ? 'OK' : `HTTP ${res.status}`;
  } catch (err) {
    services.turbovec = false;
    details.turbovec = (err as Error).message;
  }

  // Check Postgres
  try {
    const { Pool } = await import('pg');
    const pool = new Pool({
      host: ENV.POSTGRES_HOST,
      port: ENV.POSTGRES_PORT,
      user: ENV.POSTGRES_USER,
      password: ENV.POSTGRES_PASSWORD,
      database: ENV.POSTGRES_DB,
      connectionTimeoutMillis: 2000,
      idle_in_transaction_session_timeout: 2000
    });
    const res = await pool.query('SELECT 1');
    services.postgres = res.rows.length > 0;
    details.postgres = services.postgres ? 'OK' : 'Query failed';
    pool.end().catch(() => {});
  } catch (err) {
    services.postgres = false;
    details.postgres = (err as Error).message;
  }

  // Check Gemma4
  try {
    const res = await fetch('http://127.0.0.1:8090/v1/models', { signal: AbortSignal.timeout(2000) });
    services.gemma4 = res.ok;
    details.gemma4 = res.ok ? 'OK' : `HTTP ${res.status}`;
  } catch (err) {
    services.gemma4 = false;
    details.gemma4 = (err as Error).message;
  }

  const ok = Object.values(services).every((s) => s);

  return {
    ok,
    services,
    details
  };
}

export default {
  executeGoRetrievalSearch,
  checkGoRetrievalHealth
};
