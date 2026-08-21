import { SearchRuntime, type SearchQuery, type SearchResult } from '$lib/server/retrieval/search-runtime.js';
import { graphRetrieve, type GraphCandidate } from './graph-retriever.js';
import { RETRIEVAL_LIMITS, SearchMetadataFilterSchema } from '$lib/server/retrieval/search-contract.js';
import {
  buildSearchRuntimeQasRows,
  type QueryAdaptiveFeatureRowV1,
  type SearchRuntimeQasAdapterResult,
  type SearchRuntimeQasFeatureResolver,
} from './query-adaptive-feature-compiler.js';
import type { CandidateProjectionInput } from '$lib/server/retrieval/retrieval-candidate-feature-matrix-v1.js';
import {
  joinSearchRuntimeQasFeatureSources,
  type SearchRuntimeQasFeatureSources,
} from './search-runtime-qas-feature-resolver.js';

export interface AtlasSearchRequest {
  query: string;
  topK?: number;
  userId?: string;
  caseId?: string;
  filters?: Record<string, unknown>;
  traceId?: string;
  workspaceRevision?: string;
  sourceRevision?: string;
  /** Enable bounded graph expansion after fusion. Default false. */
  withGraphExpansion?: boolean;
}

export interface AtlasSearchResponse {
  packets: SearchResult['packets'];
  topPacketKeys: string[];
  metadata: SearchResult['metadata'];
  provenance: SearchResult['provenance'];
  /** Graph candidates seeded from topPacketKeys. Only populated when withGraphExpansion=true. */
  graphExpanded?: GraphCandidate[];
}

export interface AtlasSearchQasOptions {
  requestId: string;
  policyRevision: string;
  workspaceRevision: string;
  representationRevision: string;
  sources: SearchRuntimeQasFeatureSources;
}

export interface SearchRuntimeQasProjectionResult {
  requestId: string;
  accepted: QueryAdaptiveFeatureRowV1[];
  rejected: Array<{
    candidateId?: string;
    packetKey?: string;
    reason:
      | 'MISSING_CANONICAL_IDENTITY'
      | 'MISSING_REVISION_CONTEXT'
      | 'INCOMPLETE_FEATURE_PROJECTION'
      | 'INVALID_FEATURE_ROW';
  }>;
  exactBaseline: Array<{
    canonicalId: string;
    rank: number;
    score?: number;
  }>;
}

/**
 * Read-only QAS projection at the existing Atlas SearchRuntime boundary.
 * SearchRuntime remains the retrieval/fusion owner; this only converts its
 * returned packets plus an existing feature projection into QAS rows.
 */
export function projectAtlasSearchResponseToQas(input: {
  requestId: string;
  policyRevision: string;
  workspaceRevision: string;
  representationRevision: string;
  response: Pick<AtlasSearchResponse, 'packets'>;
  projections: CandidateProjectionInput[];
  resolveFeatures: SearchRuntimeQasFeatureResolver;
}): SearchRuntimeQasProjectionResult {
  const candidates = input.response.packets.map((packet) => ({
    packetKey: packet.packet_key ?? packet.chunk_id,
    sourceRef: packet.source_ref ?? packet.relative_path ?? '',
    stableSymbolId: packet.stable_symbol_id ?? null,
    symbolVersionId: packet.symbol_version_id ?? null,
    workspaceRevision: packet.workspace_revision ?? null,
    sourceRevision: packet.source_revision ?? null,
    representationRevision: packet.representation_revision ?? null,
    score: packet.retrieval_score,
    fusionScore: packet.fusion_score,
    rankBefore: packet.fusion_rank,
  }));

  const result: SearchRuntimeQasAdapterResult = buildSearchRuntimeQasRows({
    requestId: input.requestId,
    policyRevision: input.policyRevision,
    workspaceRevision: input.workspaceRevision,
    representationRevision: input.representationRevision,
    candidates,
    projections: input.projections,
    resolveFeatures: input.resolveFeatures,
  });

  const rejectionReason = (reason: SearchRuntimeQasAdapterResult['rejected'][number]['reason']): SearchRuntimeQasProjectionResult['rejected'][number]['reason'] => {
    if (reason === 'MISSING_CANONICAL_ID') return 'MISSING_CANONICAL_IDENTITY';
    if (reason === 'MISSING_SOURCE_REVISION' || reason === 'MISSING_WORKSPACE_REVISION' || reason === 'WORKSPACE_REVISION_MISMATCH') {
      return 'MISSING_REVISION_CONTEXT';
    }
    if (reason === 'MISSING_MATRIX_FEATURE') return 'INCOMPLETE_FEATURE_PROJECTION';
    return 'INVALID_FEATURE_ROW';
  };

  return {
    requestId: input.requestId,
    accepted: result.rows,
    rejected: result.rejected.map((rejection) => ({
      packetKey: rejection.packetKey,
      reason: rejectionReason(rejection.reason),
    })),
    exactBaseline: candidates
      .filter((candidate): candidate is typeof candidate & { stableSymbolId: string } => Boolean(candidate.stableSymbolId))
      .map((candidate, index) => ({
        canonicalId: candidate.stableSymbolId,
        rank: candidate.rankBefore ?? index + 1,
        ...(candidate.fusionScore ?? candidate.score) !== undefined
          ? { score: candidate.fusionScore ?? candidate.score }
          : {},
      })),
  };
}

/**
 * Convenience boundary for the real owner-composition path. It preserves the
 * same response shape and remains read-only; callers supply existing feature
 * owners and the resolver keeps missing evidence explicit.
 */
export function projectAtlasSearchResponseToQasFromSources(input: {
  requestId: string;
  policyRevision: string;
  workspaceRevision: string;
  representationRevision: string;
  response: Pick<AtlasSearchResponse, 'packets'>;
  sources: SearchRuntimeQasFeatureSources;
}): SearchRuntimeQasProjectionResult {
  const candidates = input.response.packets.map((packet) => ({
    packetKey: packet.packet_key ?? packet.chunk_id,
    sourceRef: packet.source_ref ?? packet.relative_path ?? '',
    stableSymbolId: packet.stable_symbol_id ?? null,
    symbolVersionId: packet.symbol_version_id ?? null,
    workspaceRevision: packet.workspace_revision ?? null,
    sourceRevision: packet.source_revision ?? null,
    representationRevision: packet.representation_revision ?? null,
    score: packet.retrieval_score,
    fusionScore: packet.fusion_score,
    rankBefore: packet.fusion_rank,
  }));
  const joined = joinSearchRuntimeQasFeatureSources(candidates, input.sources);

  return projectAtlasSearchResponseToQas({
    requestId: input.requestId,
    policyRevision: input.policyRevision,
    workspaceRevision: input.workspaceRevision,
    representationRevision: input.representationRevision,
    response: input.response,
    projections: joined.projections,
    resolveFeatures: joined.resolveFeatures,
  });
}

export function createAtlasSearchAdapter(config?: {
  userId?: string;
  caseId?: string;
  runtime?: Pick<SearchRuntime, 'search'>;
}) {
  const runtime = config?.runtime ?? new SearchRuntime(config ?? {});
  return {
    async search(req: AtlasSearchRequest): Promise<AtlasSearchResponse> {
      const query: SearchQuery = {
        text: req.query,
        topK: req.topK ?? RETRIEVAL_LIMITS.defaultTopKPerLane,
        userId: req.userId ?? config?.userId,
        caseId: req.caseId ?? config?.caseId,
        workspaceRevision: req.workspaceRevision,
        sourceRevision: req.sourceRevision,
        filters: SearchMetadataFilterSchema.parse(req.filters ?? {}),
        spanContext: req.traceId ? { traceId: req.traceId } : undefined,
      };
      const result = await runtime.search(query);

      const topPacketKeys = result.packets
        .map(p => (p as Record<string, unknown>).packet_key ?? (p as Record<string, unknown>).chunk_id ?? '')
        .filter((k): k is string => typeof k === 'string' && k.length > 0)
        .slice(0, 5);

      let graphExpanded: GraphCandidate[] | undefined;
      if (req.withGraphExpansion && topPacketKeys.length > 0) {
        try {
          graphExpanded = await graphRetrieve({
            seedPacketKeys: topPacketKeys,
            allowedRelationships: ['IMPORTS', 'CALLS', 'SIMILAR_TOPOLOGY', 'USES_CONCEPT'],
            maxDepth: 1,
            maxCandidates: 20,
          });
          // Remove seeds that already appear in main result to avoid duplicates
          const existingKeys = new Set(topPacketKeys);
          graphExpanded = graphExpanded.filter(g => !existingKeys.has(g.packetKey));
        } catch {
          // Graph expansion is best-effort; never degrades the main result
          graphExpanded = [];
        }
      }

      return {
        packets: result.packets,
        topPacketKeys,
        metadata: result.metadata,
        provenance: result.provenance,
        ...(graphExpanded !== undefined ? { graphExpanded } : {}),
      };
    },
    /**
     * Opt-in read-only caller around canonical SearchRuntime retrieval.
     * Normal retrieval/fusion remains authoritative; QAS receives the same
     * response plus existing feature projections and exact-baseline metadata.
     */
    async searchWithQas(
      req: AtlasSearchRequest,
      qas: AtlasSearchQasOptions,
    ): Promise<{ response: AtlasSearchResponse; qas: SearchRuntimeQasProjectionResult }> {
      const response = await this.search(req);
      const projection = projectAtlasSearchResponseToQasFromSources({
        requestId: qas.requestId,
        policyRevision: qas.policyRevision,
        workspaceRevision: qas.workspaceRevision,
        representationRevision: qas.representationRevision,
        response,
        sources: qas.sources,
      });
      return { response, qas: projection };
    },
  };
}
