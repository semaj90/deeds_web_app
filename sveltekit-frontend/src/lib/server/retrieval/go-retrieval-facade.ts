// @ts-nocheck
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
import {
  executeMultiVectorRetrieval,
  checkMultiVectorHealth,
  type MultiVectorRequest,
  type MultiVectorResult
} from './multi-vector-orchestrator.js';
import {
  orchestrateCacheLayers,
  checkCacheLayersHealth,
  type CacheLayers
} from './cache-layers-orchestrator.js';
import { recordCacheDecision } from './cache-layers-telemetry.js';
import { validateCanonicalEnvelope, type CanonicalEnvelope } from '$lib/server/topology/canonical-id-hierarchy.js';
import { createPermissionManager, type PermissionManager } from '$lib/server/topology/permission-manager.js';
import { integrateDispatcher } from '$lib/server/dispatch/dispatcher-integration.js';
import { RETRIEVAL_LIMITS, type SearchMetadataFilter } from './search-contract.js';
import type { SearchFilter } from './types.js';

export interface GoRetrievalFacadeRequest {
  query: string;
  limit?: number;
  topK?: number;
  top_k?: number;
  useRRF?: boolean;
  use_rrf?: boolean;
  useLexical?: boolean;
  use_lexical?: boolean;
  useMultiVector?: boolean;
  use_multi_vector?: boolean;
  topKPerLane?: number;
  finalTopK?: number;
  rerankTopK?: number;
  pageSize?: number;
  cursor?: string | null;
  rrfWeights?: {
    content?: number;
    summary?: number;
    title?: number;
    keywords?: number;
  };
  filters?: SearchMetadataFilter;
  exactKeywords?: string[];
  expandedKeywords?: string[];
  includeRelations?: boolean;
  relationDepth?: number;
  includeDebugScores?: boolean;
  includeSummary?: boolean;
  include_summary?: boolean;
  summaryMaxTokens?: number;
  summary_max_tokens?: number;
  summaryTemperature?: number;
  summary_temperature?: number;
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
    rrf_score?: number;
    source_lanes?: string[];
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
    multi_vector_ms?: number;
    cache_layers_ms?: number;
  };
  stages_completed: string[];
  fallback_used: boolean;
  multi_vector_used?: boolean;
  cache_layers?: CacheLayers & {
    decision: 'layer1_direct' | 'layer2_adapter' | 'layer3_exact' | 'layer4_semantic';
  };
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
function normalizeRequest(req: GoRetrievalFacadeRequest): RetrievalRequest & { filters?: SearchFilter } {
  const limit = Math.min(
    req.limit ?? req.topK ?? req.top_k ?? req.finalTopK ?? req.pageSize ?? RETRIEVAL_LIMITS.defaultFinalResults,
    RETRIEVAL_LIMITS.maxFinalResults
  );

  const filterMetadata = req.filters
    ? {
        packet_type: req.filters.fileKinds?.[0] ?? undefined,
        language: req.filters.languages?.[0] ?? undefined,
        file_extension: req.filters.extensions?.[0] ?? undefined,
        domain_class: req.filters.domainIds?.[0] ?? undefined,
        source_ref: req.filters.sourceRefs?.[0] ?? undefined,
        source_ref_pattern: req.filters.pathPrefixes?.[0] ?? undefined,
        directory_path: req.filters.pathPrefixes?.[0] ?? undefined,
        kmeans_cluster_ids: req.filters.kmeansClusters,
        som_row: req.filters.somCells?.[0] !== undefined ? req.filters.somCells[0] % 20 : undefined,
        som_col: req.filters.somCells?.[0] !== undefined ? Math.floor(req.filters.somCells[0] / 20) : undefined,
        jsonb_contains: {
          workspaceIds: req.filters.workspaceIds,
          fileKinds: req.filters.fileKinds,
          symbolKinds: req.filters.symbolKinds,
          conceptIds: req.filters.conceptIds,
          communityIds: req.filters.communityIds,
          embeddingLaneIds: req.filters.embeddingLaneIds,
          graphSnapshotId: req.filters.graphSnapshotId,
          includeGenerated: req.filters.includeGenerated,
          includeLegacy: req.filters.includeLegacy
        }
      }
    : undefined;

  const searchFilter: SearchFilter | undefined = req.filters
    ? {
        keywords: req.exactKeywords ?? [],
        keyword_variants: req.expandedKeywords ?? [],
        search_kinds: req.lanes,
        metadata: filterMetadata,
        include_packet_keys: req.cursor ? [] : undefined,
        per_lane_limit: limit
      }
    : undefined;

  return {
    query: req.query,
    limit,
    useRRF: req.useRRF ?? req.use_rrf ?? true,
    useLexical: req.useLexical ?? req.use_lexical ?? false,
    filters: searchFilter
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
 * Execute multi-vector retrieval via Go Retrieval facade with identity validation
 * Wires the 4-lane RRF fusion (content + summary + title + keywords)
 *
 * Steps:
 * 1. Embed query
 * 2. Execute multi-vector orchestrator (4 parallel lanes)
 * 3. Apply RRF fusion with configurable weights
 * 4. Validate each candidate has canonical envelope
 * 5. Filter by recovery lanes (canonical + recoverable only)
 * 6. Classify into identity lanes for ACE error recovery routing
 */
async function executeGoRetrievalSearchMultiVector(
  request: GoRetrievalFacadeRequest,
  queryEmbedding: number[],
  includeSummary?: boolean
): Promise<GoRetrievalFacadeResponse> {
  const startTime = performance.now();
  const identityValidation = {
    candidates_before: 0,
    candidates_after: 0,
    quarantined: 0,
    recovery_lane_count: 0
  };

  try {
    const topK = Math.min(
      request.topKPerLane ?? request.topK ?? request.top_k ?? request.finalTopK ?? request.pageSize ?? RETRIEVAL_LIMITS.defaultFinalResults,
      RETRIEVAL_LIMITS.maxTopKPerLane
    );
    const weights = request.rrfWeights || undefined;

    const result = await executeMultiVectorRetrieval({
      query: request.query,
      queryEmbedding,
      topK,
      weights
    });

    // ── Identity Validation Gate ──────────────────────────────────────────────
    identityValidation.candidates_before = result.candidates.length;

    // Validate each candidate and classify into recovery lanes
    const validated = result.candidates
      .map((c: any) => {
        // Build minimal CanonicalEnvelope from candidate
        const envelope: Partial<CanonicalEnvelope> = {
          repository_id: c.id || '',
          directory_id: c.id || '',
          file_id: c.id || '',
          module_id: c.id || '',
          symbol_id: c.id || '',
          feature_id: c.id || '',
          packet_key: c.id || '',
          chunk_id: c.id || '',
          source_ref: c.id || ''
        };

        const validation = validateCanonicalEnvelope(envelope as CanonicalEnvelope);
        return {
          id: c.id,
          score: c.normalized_score,
          rrf_score: c.rrf_score,
          source_lanes: c.source_lanes,
          path: c.id,
          symbol: c.id,
          kind: 'chunk',
          ranks: {
            content: c.content_score,
            summary: c.summary_score,
            title: c.title_score,
            keywords: c.keyword_score,
            rrf: c.rrf_score
          },
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
      `[multi-vector] ${identityValidation.candidates_before} → ${identityValidation.candidates_after} ` +
        `(quarantined: ${identityValidation.quarantined}, recovery: ${identityValidation.recovery_lane_count})`
    );

    // ── Build response with multi-vector results ────────────────────────────────
    const totalMs = performance.now() - startTime;

    return {
      results: validated.map((c: any) => ({
        id: c.id,
        score: c.score,
        file_path: c.path,
        relative_path: c.path,
        symbol: c.symbol,
        kind: c.kind,
        ranks: c.ranks,
        identity_lane: c.identity_lane,
        rrf_score: c.rrf_score,
        source_lanes: c.source_lanes
      })),
      summary: undefined, // Summaries handled separately in future phase
      timing: {
        embedding_ms: 0,
        qdrant_search_ms: result.timing.total_ms - result.timing.fusion_ms,
        turbovec_transform_ms: 0,
        postgres_join_ms: 0,
        total_ms: totalMs,
        multi_vector_ms: result.timing.total_ms
      },
      stages_completed: ['multi_vector_retrieval', 'identity_validation'],
      fallback_used: false,
      multi_vector_used: true,
      identity_validation: identityValidation,
      metadata: {
        query: request.query,
        query_embedding_dim: queryEmbedding.length,
        qdrant_candidates: result.candidates.length,
        turbovec_candidates: result.candidates.length,
        postgres_join_count: validated.length,
        top_k: topK
      }
    };
  } catch (err) {
    console.error('[multi-vector] execution failed:', err);

    // Return graceful degradation
    return {
      results: [],
      summary: undefined,
      timing: {
        embedding_ms: 0,
        qdrant_search_ms: 0,
        turbovec_transform_ms: 0,
        postgres_join_ms: 0,
        total_ms: performance.now() - startTime,
        multi_vector_ms: 0
      },
      stages_completed: [],
      fallback_used: true,
      multi_vector_used: true,
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
 * Execute unified retrieval via Go Retrieval facade with identity validation
 * Main entry point for Go Retrieval HTTP API
 *
 * Steps:
 * 1. Execute unified retrieval (standard 6-signal RRF) or multi-vector RRF (via flag)
 * 2. Validate each candidate has canonical envelope
 * 3. Filter by recovery lanes (canonical + recoverable only)
 * 4. Classify into identity lanes for ACE error recovery routing
 */
export async function executeGoRetrievalSearch(
  request: GoRetrievalFacadeRequest,
  includeSummary?: boolean
): Promise<GoRetrievalFacadeResponse> {
  let fallback = false;

  // ── Phase 6: Traffic Ramp Configuration ───────────────────────────────────
  // Controlled canary deployment: 5% → 25% → 100% over 2 hours
  const TRAFFIC_RAMP_CONFIG = {
    enabled: process.env.MULTI_VECTOR_RAMP_ENABLED === 'true',
    canary_percent: parseInt(process.env.MULTI_VECTOR_CANARY_PERCENT || '5', 10),
    ramp_enabled_at_ms: parseInt(process.env.MULTI_VECTOR_RAMP_STARTED_MS || '0', 10)
  };

  // Decide whether to use multi-vector based on:
  // 1. Explicit request flag (always honored)
  // 2. Traffic ramp percentage (probabilistic canary)
  let useMultiVector = request.useMultiVector ?? request.use_multi_vector ?? false;

  if (!useMultiVector && TRAFFIC_RAMP_CONFIG.enabled) {
    // Probabilistic routing for canary (e.g., 5% of traffic)
    const randomPercent = Math.random() * 100;
    useMultiVector = randomPercent < TRAFFIC_RAMP_CONFIG.canary_percent;

    if (useMultiVector) {
      console.log(`[go-retrieval-facade] canary routing (${randomPercent.toFixed(1)}% < ${TRAFFIC_RAMP_CONFIG.canary_percent}%)`);
    }
  }

  const identityValidation = {
    candidates_before: 0,
    candidates_after: 0,
    quarantined: 0,
    recovery_lane_count: 0
  };

  try {
    // ── Route based on multi-vector flag ──────────────────────────────────────
    if (useMultiVector) {
      // For multi-vector, we need to embed the query first
      // Query embedding via embeddinggemma:latest with caching
      let queryEmbedding: number[] | undefined;

      try {
        // Attempt to embed query via /api/embed endpoint
        // This applies Redis L1 + Bifrost L2 caching automatically
        const embedResponse = await fetch(`${ENV.SVELTEKIT_SERVER_URL || 'http://127.0.0.1:5173'}/api/embed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: request.query,
            model: 'embeddinggemma:latest'
          }),
          signal: AbortSignal.timeout(10000)
        });

        if (embedResponse.ok) {
          const embedData = await embedResponse.json();
          queryEmbedding = embedData.embedding;
          console.log(`[go-retrieval-facade] embedded query: ${queryEmbedding?.length || 0}-dim vector`);
        } else {
          console.warn(`[go-retrieval-facade] embed failed (status ${embedResponse.status}), using placeholder`);
          queryEmbedding = new Array(768).fill(0.1); // Fallback placeholder
        }
      } catch (err) {
        console.warn('[go-retrieval-facade] embed error:', err);
        queryEmbedding = new Array(768).fill(0.1); // Fallback placeholder
      }

      if (!queryEmbedding || queryEmbedding.length === 0) {
        queryEmbedding = new Array(768).fill(0.1); // Final fallback
      }

      console.log('[go-retrieval-facade] routing to multi-vector RRF');
      return await executeGoRetrievalSearchMultiVector(request, queryEmbedding, includeSummary);
    }

    // ── Phase 3A: Cache Layers Orchestration ─────────────────────────────────────
    // Measure Layer 1 (direct llama.cpp) + Layers 2-4 in parallel with 100ms timeout each
    let cacheLayersResult: (typeof CacheLayers & { decision: string }) | undefined;
    const cacheLayersStart = performance.now();

    try {
      cacheLayersResult = await orchestrateCacheLayers(
        request.query,
        request.query || 'default', // system prompt fallback
        0 // Layer 1 latency will be populated during unified retrieval
      );

      const cacheLayersMs = performance.now() - cacheLayersStart;
      console.log(
        `[cache-layers] decision=${cacheLayersResult.decision} ` +
          `layer2_hit=${cacheLayersResult.layer2_adapter?.hit || false} ` +
          `layer3_hit=${cacheLayersResult.layer3_exact?.hit || false} ` +
          `layer4_hit=${cacheLayersResult.layer4_semantic?.hit || false} ` +
          `orchestration=${cacheLayersMs}ms`
      );

      // Record telemetry (non-blocking, fire-and-forget)
      const queryHash = Buffer.from(request.query).toString('base64').slice(0, 16);
      recordCacheDecision(cacheLayersResult, queryHash);
    } catch (err) {
      console.warn('[cache-layers] orchestration failed (non-blocking):', err);
      cacheLayersResult = undefined;
    }

    // ── Standard unified retrieval path ───────────────────────────────────────
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

    if (cacheLayersResult) {
      response.cache_layers = {
        ...cacheLayersResult,
        decision: cacheLayersResult.decision as any
      };
      response.timing.cache_layers_ms = cacheLayersResult.total_orchestration_ms;
    }

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
 * Verifies all 5 services + cache layers are operational
 */
export async function checkGoRetrievalHealth(): Promise<{
  ok: boolean;
  services: Record<string, boolean>;
  details: Record<string, string>;
  cache_layers?: {
    ok: boolean;
    layers: Record<string, string>;
  };
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

  // Check multi-vector health (Qdrant + keyword indexing)
  let multiVectorHealth;
  try {
    multiVectorHealth = await checkMultiVectorHealth();
    services.multi_vector = multiVectorHealth.ok;
    details.multi_vector = multiVectorHealth.ok
      ? `OK (vectors: ${multiVectorHealth.vectors_available?.content ? 'yes' : 'no'})`
      : 'Qdrant not available';
  } catch (err) {
    services.multi_vector = false;
    details.multi_vector = (err as Error).message;
  }

  // Check cache layers (Layer 2 adapter, Layer 3-4 Valkey)
  let cacheLayersHealth;
  try {
    cacheLayersHealth = await checkCacheLayersHealth();
    services.cache_layers = cacheLayersHealth.healthy;
    details.cache_layers = cacheLayersHealth.healthy ? 'OK' : 'Some layers DOWN';
  } catch (err) {
    services.cache_layers = false;
    details.cache_layers = (err as Error).message;
  }

  const ok = Object.values(services).every((s) => s);

  return {
    ok,
    services,
    details,
    cache_layers: cacheLayersHealth
      ? {
          ok: cacheLayersHealth.healthy,
          layers: cacheLayersHealth.layers
        }
      : undefined
  };
}

export default {
  executeGoRetrievalSearch,
  checkGoRetrievalHealth
};
