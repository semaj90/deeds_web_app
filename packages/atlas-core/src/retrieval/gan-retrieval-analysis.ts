/**
 * GAN Retrieval Analysis
 *
 * Integrates Go Retrieval search results with GAN deep audit for comprehensive
 * retrieval coverage analysis. Answers:
 * - Which packets are searchable via BM25 + RRF?
 * - What search performance (latency, relevance) do we achieve?
 * - Are there gaps (packets indexed in Postgres but not found via Go search)?
 * - What's the search quality distribution across domains?
 */

import type { GanValidationResult } from '../validation/gan-audit-integration.js';


type SqlExecutionResult<Row> =
  | Row[]
  | {
      rows?: Row[];
    };

interface DrizzleLikeDb {
  execute<Row = Record<string, unknown>>(query: unknown): Promise<SqlExecutionResult<Row>>;
}

interface GoSearchResult {
  id?: string;
  sourceRef?: string;
  bm25Score?: number;
  denseScore?: number;
  rrfScore?: number;
}

interface GoSearchBridge {
  searchGoService(
    query: string,
    options: { limit: number }
  ): Promise<GoSearchResult[]>;
}

interface RetrievalAuditPacketRow {
  packet_key: string;
  feature_id: string;
  source_ref: string;
  summary: string | null;
  directory_path: string | null;
}

interface RetrievalGapPacketRow {
  packet_key: string;
  summary: string | null;
  embedding: unknown | null;
  ganValidated: boolean | null;
  ganValidationError: string | null;
  ganWarnings: unknown;
}

function rowsFromResult<Row>(result: SqlExecutionResult<Row>): Row[] {
  return Array.isArray(result) ? result : result.rows ?? [];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export type AtlasSpecLayer =
  | 'identity_lineage'
  | 'retrieval'
  | 'graph_expansion'
  | 'candidate_cache'
  | 'context_compiler'
  | 'model_execution_cache'
  | 'offline_learning';

export interface AtlasSpecRef {
  spec_ref: string;
  requirement: string;
  layer: AtlasSpecLayer;
  invariant: string;
  source_refs: string[];
}

export interface RetrievalRecommendation {
  code:
    | 'SEARCHABILITY_COVERAGE'
    | 'RRF_QUALITY'
    | 'LATENCY_CACHE_WARMING'
    | 'DOMAIN_COVERAGE'
    | 'CRITICAL_GAPS'
    | 'RRF_TUNING';
  priority: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  spec_refs: string[];
  next_action: string;
}

/**
 * Parent Atlas architectural boundaries.
 *
 * These are intentionally independent of any model runtime:
 * - Bitfrost/Redis warms candidate evidence; it is not a second context window.
 * - The context compiler is the only layer that admits candidate evidence into prompt tokens.
 * - llama-server KV/prompt cache is ephemeral execution acceleration, never canonical memory.
 * - QLoRA is an offline learning/policy lane, never per-query memory swapping.
 */
export const PARENT_ATLAS_SPEC_REFS = {
  retrievalCascade: {
    spec_ref: 'openspec:parent-atlas-agentic-completion#requirement:layered-retrieval',
    requirement: 'Layered retrieval',
    layer: 'retrieval',
    invariant:
      'Exact/sourceRef, lexical, dense, and graph evidence are staged and measured independently before fusion.',
    source_refs: [
      'todo:C:\\Users\\james\\Videos\\deeds-web-app\\MASTER-FEATURE-TODO-2026-05-20.md#line:355',
    ],
  },
  bitfrostCandidateCache: {
    spec_ref: 'openspec:parent-atlas-agentic-completion#requirement:query-aware-warming',
    requirement: 'Query-aware candidate-cache warming',
    layer: 'candidate_cache',
    invariant:
      'Redis/Bitfrost may prefetch candidate evidence, but cache presence never implies prompt inclusion.',
    source_refs: [
      'todo:C:\\Users\\james\\Videos\\deeds-web-app\\MASTER-FEATURE-TODO-2026-05-20.md#line:354',
    ],
  },
  contextCompiler: {
    spec_ref: 'openspec:parent-atlas-agentic-completion#requirement:context-is-compiled',
    requirement: 'Context is compiled',
    layer: 'context_compiler',
    invariant:
      'Only the context compiler may promote retrieved/warmed evidence into bounded model-visible tokens.',
    source_refs: [
      'todo:C:\\Users\\james\\Videos\\deeds-web-app\\MASTER-FEATURE-TODO-2026-05-20.md#line:354',
      'todo:C:\\Users\\james\\Videos\\deeds-web-app\\MASTER-FEATURE-TODO-2026-05-20.md#line:355',
    ],
  },
  kvEphemeral: {
    spec_ref: 'openspec:parent-atlas-agentic-completion#requirement:kv-cache-is-ephemeral',
    requirement: 'KV cache is ephemeral',
    layer: 'model_execution_cache',
    invariant:
      'llama-server KV/prompt cache accelerates inference only and must never be the canonical memory/evidence store.',
    source_refs: [],
  },
  qloraOffline: {
    spec_ref: 'openspec:parent-atlas-agentic-completion#requirement:offline-learning',
    requirement: 'QLoRA is offline learning',
    layer: 'offline_learning',
    invariant:
      'QLoRA consumes versioned repair/retrieval datasets offline and is never used as live memory swapping.',
    source_refs: [
      'todo:C:\\Users\\james\\Videos\\deeds-web-app\\MASTER-FEATURE-TODO-2026-05-20.md#line:381',
    ],
  },
  sourceRefSpine: {
    spec_ref: 'openspec:parent-atlas-agentic-completion#requirement:canonical-authority',
    requirement: 'Canonical identity and provenance spine',
    layer: 'identity_lineage',
    invariant:
      'feature_id identifies the logical feature; source_ref records evidence/provenance and may move without changing feature identity.',
    source_refs: [
      'todo:C:\\Users\\james\\Videos\\deeds-web-app\\MASTER-FEATURE-TODO-2026-05-20.md#line:381',
    ],
  },
} as const satisfies Record<string, AtlasSpecRef>;


export interface SearchablePacket {
  packet_key: string;
  feature_id: string;
  source_ref: string;
  bm25_score: number; // Sparse (BM25) relevance
  dense_score: number; // Dense (Qdrant) relevance
  rrf_score: number; // Reciprocal Rank Fusion blend
  searchable: boolean; // true if both BM25 and dense available
  found_via: 'bm25' | 'dense' | 'both' | 'none';
  latency_ms: number;
}

export interface RetrievalGap {
  packet_key: string;
  feature_id: string;
  source_ref: string;
  reason: 'missing_index' | 'missing_embedding' | 'invalid_tokens' | 'low_confidence';
  severity: 'critical' | 'high' | 'medium' | 'low';
  remediation: string;
}

export interface SearchQualityMetrics {
  total_packets_audited: number;
  searchable_packets: number;
  searchable_percentage: number;
  average_rrf_score: number;
  gaps_found: number;
  critical_gaps: number;
  search_latency_p50_ms: number;
  search_latency_p95_ms: number;
  search_latency_p99_ms: number;
  domain_distribution: Record<string, { searchable: number; total: number }>;
}

export interface GanRetrievalAnalysisResult extends GanValidationResult {
  retrieval_analysis?: SearchQualityMetrics;
  searchable_packets?: SearchablePacket[];
  retrieval_gaps?: RetrievalGap[];
  /** Backward-compatible human-readable recommendations. */
  retrieval_recommendations?: string[];
  /** Typed recommendations with OpenSpec traceability. */
  retrieval_recommendation_records?: RetrievalRecommendation[];
  /** Architecture invariants used by this analysis. */
  spec_refs?: AtlasSpecRef[];
}

/**
 * Analyze which packets are searchable via Go retrieval service
 */
export async function analyzeRetrievalCoverage(
  auditResult: GanValidationResult,
  goSearchBridge?: GoSearchBridge,
  db?: DrizzleLikeDb
): Promise<SearchQualityMetrics> {
  const metrics: SearchQualityMetrics = {
    total_packets_audited: auditResult.processed,
    searchable_packets: 0,
    searchable_percentage: 0,
    average_rrf_score: 0,
    gaps_found: 0,
    critical_gaps: 0,
    search_latency_p50_ms: 0,
    search_latency_p95_ms: 0,
    search_latency_p99_ms: 0,
    domain_distribution: {},
  };

  if (!goSearchBridge || !db) {
    return metrics; // Graceful degradation
  }

  try {
    const { sql } = await import('drizzle-orm');

    // Sample packets for retrieval testing
    const sampleSize = Math.min(50, auditResult.processed);
    const packets = await db.execute<RetrievalAuditPacketRow>(sql`
      SELECT
        packet_key,
        feature_id,
        source_ref,
        summary,
        directory_path
      FROM atlas_packets
      WHERE ganValidated = true
      ORDER BY packet_key ASC
      LIMIT ${sampleSize}
    `);

    const rows = rowsFromResult(packets);
    const searchResults: SearchablePacket[] = [];
    const latencies: number[] = [];

    for (const packet of rows) {
      const startMs = performance.now();

      try {
        // Search via Go service
        const result = await goSearchBridge.searchGoService(packet.summary || packet.feature_id, {
          limit: 5,
        });

        const latencyMs = Math.round(performance.now() - startMs);
        latencies.push(latencyMs);

        // Self-retrieval must score the matching packet, not result[0].
        // Otherwise a different top result can make the packet look searchable/non-searchable
        // for the wrong reason.
        const selfResult = result.find(
          (resultItem) =>
            resultItem.id === packet.packet_key || resultItem.sourceRef === packet.source_ref
        );

        const bm25Score = Number(selfResult?.bm25Score ?? 0);
        const denseScore = Number(selfResult?.denseScore ?? 0);
        const rrfScore = Number(selfResult?.rrfScore ?? 0);
        const viaBm25 = bm25Score > 0;
        const viaDense = denseScore > 0;

        const foundVia: SearchablePacket['found_via'] =
          viaBm25 && viaDense ? 'both' : viaBm25 ? 'bm25' : viaDense ? 'dense' : 'none';

        searchResults.push({
          packet_key: packet.packet_key,
          feature_id: packet.feature_id,
          source_ref: packet.source_ref,
          bm25_score: bm25Score,
          dense_score: denseScore,
          rrf_score: rrfScore,
          // "searchable" means the packet can be retrieved by at least one lane.
          // Keep per-lane availability in found_via so coverage and fusion health
          // are not collapsed into one boolean.
          searchable: Boolean(selfResult) && (viaBm25 || viaDense),
          found_via: foundVia,
          latency_ms: latencyMs,
        });
      } catch (err) {
        console.warn(`[GAN Retrieval] Search failed for ${packet.feature_id}: ${errorMessage(err)}`);
        // Include failure as non-searchable
        searchResults.push({
          packet_key: packet.packet_key,
          feature_id: packet.feature_id,
          source_ref: packet.source_ref,
          bm25_score: 0,
          dense_score: 0,
          rrf_score: 0,
          searchable: false,
          found_via: 'none',
          latency_ms: Math.round(performance.now() - startMs),
        });
      }
    }

    // Calculate metrics
    metrics.searchable_packets = searchResults.filter((r) => r.searchable).length;
    metrics.searchable_percentage =
      searchResults.length > 0
        ? Math.round((metrics.searchable_packets / searchResults.length) * 100)
        : 0;

    if (searchResults.length > 0) {
      const validScores = searchResults.filter((r) => r.rrf_score > 0).map((r) => r.rrf_score);
      metrics.average_rrf_score =
        validScores.length > 0
          ? validScores.reduce((a, b) => a + b, 0) / validScores.length
          : 0;
    }

    // Latency percentiles
    if (latencies.length > 0) {
      latencies.sort((a, b) => a - b);
      const p50Idx = Math.floor(latencies.length * 0.5);
      const p95Idx = Math.floor(latencies.length * 0.95);
      const p99Idx = Math.floor(latencies.length * 0.99);

      metrics.search_latency_p50_ms = latencies[p50Idx] || 0;
      metrics.search_latency_p95_ms = latencies[p95Idx] || 0;
      metrics.search_latency_p99_ms = latencies[p99Idx] || 0;
    }

    // Domain distribution
    for (const result of searchResults) {
      const domain = inferDomain(result.feature_id);
      if (!metrics.domain_distribution[domain]) {
        metrics.domain_distribution[domain] = { searchable: 0, total: 0 };
      }
      metrics.domain_distribution[domain].total++;
      if (result.searchable) {
        metrics.domain_distribution[domain].searchable++;
      }
    }
  } catch (err) {
    console.warn(`[GAN Retrieval] Coverage analysis failed: ${errorMessage(err)}`);
  }

  return metrics;
}

/**
 * Detect retrieval gaps (packets not findable via Go search)
 */
export async function detectRetrievalGaps(
  searchResults: SearchablePacket[],
  db?: DrizzleLikeDb
): Promise<RetrievalGap[]> {
  const gaps: RetrievalGap[] = [];

  if (!db) return gaps;

  try {
    const { sql } = await import('drizzle-orm');

    // Find packets not searchable
    const nonSearchable = searchResults.filter((r) => !r.searchable);

    for (const packet of nonSearchable) {
      // Query Postgres for diagnostic info
      const packetDetail = await db.execute<RetrievalGapPacketRow>(sql`
        SELECT
          packet_key,
          summary,
          embedding,
          ganValidated,
          ganValidationError,
          ganWarnings
        FROM atlas_packets
        WHERE packet_key = ${packet.packet_key}
        LIMIT 1
      `);

      const detail = rowsFromResult(packetDetail)[0];

      if (!detail) {
        gaps.push({
          packet_key: packet.packet_key,
          feature_id: packet.feature_id,
          source_ref: packet.source_ref,
          reason: 'missing_index',
          severity: 'critical',
          remediation: 'Packet missing from postgres; run backfill-qdrant-vectors.mts',
        });
      } else if (!detail.embedding) {
        gaps.push({
          packet_key: packet.packet_key,
          feature_id: packet.feature_id,
          source_ref: packet.source_ref,
          reason: 'missing_embedding',
          severity: 'high',
          remediation: 'Generate embedding via embeddinggemma; backfill atlas_packets.embedding',
        });
      } else if (!detail.summary || detail.summary.length < 10) {
        gaps.push({
          packet_key: packet.packet_key,
          feature_id: packet.feature_id,
          source_ref: packet.source_ref,
          reason: 'invalid_tokens',
          severity: 'medium',
          remediation: 'Summary too short for BM25 indexing; backfill via Gemma4 summarization',
        });
      } else if (detail.ganValidationError) {
        gaps.push({
          packet_key: packet.packet_key,
          feature_id: packet.feature_id,
          source_ref: packet.source_ref,
          reason: 'low_confidence',
          severity: 'low',
          remediation: `Failed GAN validation (${detail.ganValidationError}); fix identity fields`,
        });
      }
    }
  } catch (err) {
    console.warn(`[GAN Retrieval] Gap detection failed: ${errorMessage(err)}`);
  }

  return gaps;
}

/**
 * Generate retrieval-focused recommendations
 */
export async function generateRetrievalRecommendations(
  metrics: SearchQualityMetrics,
  gaps: RetrievalGap[]
): Promise<string[]> {
  const recommendations: string[] = [];

  // Recommendation 1: Searchability coverage
  if (metrics.searchable_percentage < 50) {
    recommendations.push(
      `Only ${metrics.searchable_percentage}% of packets are searchable via Go retrieval. ` +
        `Prioritize backfilling embeddings and summaries for top-100 features by authority.`
    );
  } else if (metrics.searchable_percentage < 80) {
    recommendations.push(
      `${metrics.searchable_percentage}% searchability achieved. ` +
        `Target 95%+ by addressing ${gaps.length} gaps (mostly missing embeddings).`
    );
  }

  // Recommendation 2: RRF score quality
  if (metrics.average_rrf_score < 0.5) {
    recommendations.push(
      `Average RRF (Reciprocal Rank Fusion) score is ${metrics.average_rrf_score.toFixed(2)}. ` +
        `Improve BM25 indexing by enriching summaries with domain-specific keywords. ` +
        `Dense (Qdrant) scores are low; review embedding model quality.`
    );
  }

  // Recommendation 3: Latency optimization
  if (metrics.search_latency_p95_ms > 500) {
    recommendations.push(
      `Search latency p95=${metrics.search_latency_p95_ms}ms. ` +
        `Optimize via: (1) Redis query caching, (2) index pruning, (3) Go service scaling.`
    );
  }

  // Recommendation 4: Domain-specific gaps
  for (const [domain, dist] of Object.entries(metrics.domain_distribution)) {
    const coverage = Math.round((dist.searchable / dist.total) * 100);
    if (coverage < 60) {
      recommendations.push(
        `${domain} domain: only ${coverage}% searchable. ` +
          `Review ${domain}-specific indexing strategy.`
      );
    }
  }

  // Recommendation 5: Critical gaps
  const criticalGaps = gaps.filter((g) => g.severity === 'critical');
  if (criticalGaps.length > 0) {
    recommendations.push(
      `${criticalGaps.length} critical retrieval gaps detected (missing indexes/embeddings). ` +
        `Address before production rollout.`
    );
  }

  // Recommendation 6: RRF tuning
  if (metrics.average_rrf_score > 0) {
    recommendations.push(
      `RRF blend (sparse BM25 + dense vector) effective at ${metrics.average_rrf_score.toFixed(2)} avg score. ` +
        `Fine-tune weighting (currently 50/50) based on domain-specific accuracy tests.`
    );
  }

  return recommendations;
}


/**
 * Generate machine-readable recommendations with spec_ref traceability.
 *
 * The string recommendation API above is retained for compatibility, while this
 * function provides the form Parent Atlas can put directly onto a Kanban card,
 * execution manifest, or OpenSpec evidence record.
 */
export function generateRetrievalRecommendationRecords(
  metrics: SearchQualityMetrics,
  gaps: RetrievalGap[]
): RetrievalRecommendation[] {
  const out: RetrievalRecommendation[] = [];

  if (metrics.searchable_percentage < 80) {
    out.push({
      code: 'SEARCHABILITY_COVERAGE',
      priority: metrics.searchable_percentage < 50 ? 'critical' : 'high',
      message: `${metrics.searchable_percentage}% of audited packets are self-retrievable.`,
      spec_refs: [
        PARENT_ATLAS_SPEC_REFS.retrievalCascade.spec_ref,
        PARENT_ATLAS_SPEC_REFS.sourceRefSpine.spec_ref,
      ],
      next_action:
        'Backfill or repair the missing retrieval lane(s), preserving packet_key + feature_id + source_ref lineage.',
    });
  }

  if (metrics.average_rrf_score < 0.5) {
    out.push({
      code: 'RRF_QUALITY',
      priority: 'high',
      message: `Average RRF score is ${metrics.average_rrf_score.toFixed(2)}.`,
      spec_refs: [PARENT_ATLAS_SPEC_REFS.retrievalCascade.spec_ref],
      next_action:
        'Measure BM25 and dense recall separately before tuning fusion weights; do not hide a broken lane behind RRF.',
    });
  }

  if (metrics.search_latency_p95_ms > 500) {
    out.push({
      code: 'LATENCY_CACHE_WARMING',
      priority: 'medium',
      message: `Retrieval p95 latency is ${metrics.search_latency_p95_ms}ms.`,
      spec_refs: [
        PARENT_ATLAS_SPEC_REFS.bitfrostCandidateCache.spec_ref,
        PARENT_ATLAS_SPEC_REFS.contextCompiler.spec_ref,
      ],
      next_action:
        'Warm sourceRef/feature/AST/dense-neighbor candidates in Redis/Bitfrost, then let the context compiler admit only ranked evidence into prompt tokens.',
    });
  }

  for (const [domain, dist] of Object.entries(metrics.domain_distribution)) {
    const coverage = dist.total > 0 ? Math.round((dist.searchable / dist.total) * 100) : 0;
    if (coverage < 60) {
      out.push({
        code: 'DOMAIN_COVERAGE',
        priority: 'medium',
        message: `${domain} domain self-retrieval coverage is ${coverage}%.`,
        spec_refs: [PARENT_ATLAS_SPEC_REFS.retrievalCascade.spec_ref],
        next_action:
          `Audit ${domain} lexical terms, embedding recall, and graph neighbors independently before changing global retrieval policy.`,
      });
    }
  }

  const criticalGaps = gaps.filter((g) => g.severity === 'critical');
  if (criticalGaps.length > 0) {
    out.push({
      code: 'CRITICAL_GAPS',
      priority: 'critical',
      message: `${criticalGaps.length} critical retrieval gaps were detected.`,
      spec_refs: [
        PARENT_ATLAS_SPEC_REFS.sourceRefSpine.spec_ref,
        PARENT_ATLAS_SPEC_REFS.retrievalCascade.spec_ref,
      ],
      next_action:
        'Repair canonical lineage/index coverage first; candidate caches and model KV cache must not mask missing canonical evidence.',
    });
  }

  if (metrics.average_rrf_score > 0) {
    out.push({
      code: 'RRF_TUNING',
      priority: 'low',
      message: `RRF is active with average score ${metrics.average_rrf_score.toFixed(2)}.`,
      spec_refs: [PARENT_ATLAS_SPEC_REFS.retrievalCascade.spec_ref],
      next_action:
        'Tune fusion on labeled recall/MRR/nDCG fixtures rather than assuming a fixed 50/50 weighting is optimal.',
    });
  }

  return out;
}

/**
 * Spec refs that should be persisted with every retrieval-analysis run.
 */
export function getRetrievalAnalysisSpecRefs(): AtlasSpecRef[] {
  return [
    PARENT_ATLAS_SPEC_REFS.sourceRefSpine,
    PARENT_ATLAS_SPEC_REFS.retrievalCascade,
    PARENT_ATLAS_SPEC_REFS.bitfrostCandidateCache,
    PARENT_ATLAS_SPEC_REFS.contextCompiler,
    PARENT_ATLAS_SPEC_REFS.kvEphemeral,
    PARENT_ATLAS_SPEC_REFS.qloraOffline,
  ];
}

/**
 * Helper: Infer domain from feature_id
 */
function inferDomain(featureId: string): string {
  const domains: Record<string, string[]> = {
    gpu_acceleration: ['cuda', 'gpu', 'libtorch', 'rerank', 'performance'],
    codebase_analysis: ['codebase', 'import', 'dependency', 'structure'],
    validation: ['validate', 'check', 'gan', 'audit'],
    retrieval: ['search', 'query', 'retrieval', 'qdrant', 'go-search'],
    legal: ['statute', 'precedent', 'citation', 'case', 'law'],
  };

  const lower = (featureId || '').toLowerCase();
  for (const [domain, keywords] of Object.entries(domains)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return domain;
    }
  }

  return 'general';
}
