import { SearchRuntime, type SearchQuery, type SearchResult } from '../../retrieval/search-runtime.js';
import { graphRetrieve, type GraphCandidate } from './graph-retriever.js';
import { RETRIEVAL_LIMITS, SearchMetadataFilterSchema } from '../../retrieval/search-contract.js';
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
import {
  materializeCandidateFeatureSnapshotWithOrdinalMapFromQasRowsV1,
  type CandidateFeatureLaneV1,
} from '../features/retrieval-router-to-candidate-feature-snapshot-v1.js';
import { produceCandidateFeatureMatrixFromSnapshotV1 } from '../orchestration/atlas-pipeline-stage-contracts-v1.js';
import {
  buildAceContextManifestAdmissionV1,
  retrievalCacheIdentityFromAceManifestV1,
} from '../context/ace-context-manifest-admission-v1.js';
import { buildAceTopRetrievalQueryHash } from '$lib/server/cache/ace-top-retrieval-cache.js';
import type { RetrievalCacheIdentityV1 } from '$lib/server/ace/cache-keys.js';
import { hashQuery } from '$lib/server/cache/ace-packet-cache.js';
import { bridgeAceContextManifestToPacketIdentityV1 } from '$lib/server/ace/ace-route-context-manifest-bridge-v1.js';
import { prepareUnifiedResidencyAceBridgeV1, type UnifiedResidencyAceBridgeInputV1 } from '../tensors/unified-residency-ace-bridge-v1.js';
import { materializeCandidateFeatureColumnar } from '../features/candidate-feature-columnar-v1.js';
import { materializeCandidateFeatureGpuPack } from '../features/candidate-feature-gpu-pack-v1.js';
import { prepareUnifiedResidencyFeaturePackBatchV1 } from '../tensors/unified-residency-feature-pack-v1.js';
import {
  resolveCachedPacketCandidatesV1,
  verifyCachedPacketCandidateSourceSpanV1,
  verifyCachedPacketCandidateSourceBindingSpanV1,
  type CachedPacketHintV1,
  type CachedPacketSourceSpanEvidenceV1,
  type CachedPacketSourceSpanVerificationV1,
} from './cached-packet-candidate-resolution-v1.js';
import type { GroundedExtractionSourceBindingReceiptV1 } from '../identity/grounded-extraction-source-binding-v1.js';
import {
  resolveCentroidCardCandidatesV1,
  type CentroidCardCandidateCrosswalkV1,
} from './centroid-card-candidate-crosswalk-v1.js';
import type { CentroidCardV1, CentroidManifestV1 } from '../cache/centroid-artifact-v1.js';

interface CachedPacketSourceEvidenceInputV1 {
  evidence: CachedPacketSourceSpanEvidenceV1;
  sourceBindingReceipt?: GroundedExtractionSourceBindingReceiptV1;
}

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
  /** Graph candidates seeded only from SearchRuntime's pre-fusion canonical dense lane. */
  graphExpanded?: GraphCandidate[];
}

export interface AtlasSearchQasOptions {
  requestId: string;
  policyRevision: string;
  workspaceRevision: string;
  representationRevision: string;
  sources: SearchRuntimeQasFeatureSources;
}

export interface AtlasSearchAceManifestOptions extends AtlasSearchQasOptions {
  candidateSnapshotRevision: string;
  retrievalPolicyRevision: string;
  acePlaybookRevision: string;
  tokenBudget: number;
  laneMaskByCanonicalId: Readonly<Record<string, readonly CandidateFeatureLaneV1[]>>;
  producerRevision: string;
  ontologyRevision?: string | null;
  modelRevision?: string | null;
  promptTemplateRevision?: string | null;
  /** Explicit runtime fields needed to derive a revisioned retrieval-cache identity. */
  retrievalCacheModel?: string;
  retrievalCacheDim?: number;
  contextPolicyRevision?: string;
  /** Optional packet-cache handoff fields; omitted means no packet admission. */
  graphRevision?: string | null;
  packetRepresentationId?: string;
  packetNormalizationPolicyRevision?: string;
  packetArtifactChecksum?: string;
  /** Optional cache hints; resolved only against the SearchRuntime-owned ordinal map. */
  cachedPacketHints?: readonly CachedPacketHintV1[];
  /** Optional centroid hint; exemplars are crosswalked to this request's ordinal map only. */
  centroidCandidateHint?: { card: CentroidCardV1; manifest: CentroidManifestV1 };
  /** Optional independently acquired source bytes/spans; verified but never admitted here. */
  cachedPacketSourceEvidence?: readonly ({ hintId: string } & CachedPacketSourceEvidenceInputV1)[];
}

export type SearchRuntimeUnifiedResidencyOptions = AtlasSearchAceManifestOptions
  & Pick<UnifiedResidencyAceBridgeInputV1, 'domain' | 'lutRevision' | 'lut' | 'tokenizerRevision' | 'ropeRevision' | 'artifactChecksum' | 'dtype'>
  & { modelRevision: string };

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
 * Pure bridge from the existing QAS projection into ACE's revisioned manifest
 * admission. It performs no retrieval, cache writes, or canonical writes.
 */
export function admitSearchRuntimeQasToAceManifestV1(input: {
  projection: SearchRuntimeQasProjectionResult;
  candidateSnapshotRevision: string;
  retrievalPolicyRevision: string;
  representationRevision: string;
  acePlaybookRevision: string;
  tokenBudget: number;
  graphRevision: string | null;
  laneMaskByCanonicalId: Readonly<Record<string, readonly CandidateFeatureLaneV1[]>>;
  producerRevision: string;
  ontologyRevision?: string | null;
  modelRevision?: string | null;
  promptTemplateRevision?: string | null;
}) {
  const { ordinalMap, snapshot } = materializeCandidateFeatureSnapshotWithOrdinalMapFromQasRowsV1({
    rows: input.projection.accepted,
    candidateSnapshotRevision: input.candidateSnapshotRevision,
    producerRevision: input.producerRevision,
    laneMaskByCanonicalId: input.laneMaskByCanonicalId,
  });
  const admission = buildAceContextManifestAdmissionV1({
    snapshot,
    requestId: input.projection.requestId,
    selectedOrdinals: snapshot.rows.map((row) => row.candidateOrdinal),
    tokenBudget: input.tokenBudget,
    retrievalPolicyRevision: input.retrievalPolicyRevision,
    acePlaybookRevision: input.acePlaybookRevision,
    representationRevision: input.representationRevision,
    ontologyRevision: input.ontologyRevision,
    modelRevision: input.modelRevision,
    promptTemplateRevision: input.promptTemplateRevision,
    graphRevision: input.graphRevision,
  });
  // Expose the exact snapshot that was admitted into the manifest boundary.
  // Callers must consume this value rather than rematerializing from raw
  // SearchRuntime packets. The snapshot remains derived/read-only.
  return { ...admission, ordinalMap, snapshot };
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
      const denseSeedPacketKeys = result.denseSeedPacketKeys ?? [];

      let graphExpanded: GraphCandidate[] | undefined;
      if (req.withGraphExpansion && denseSeedPacketKeys.length > 0) {
        try {
          graphExpanded = await graphRetrieve({
            seedPacketKeys: denseSeedPacketKeys,
            allowedRelationships: ['IMPORTS', 'CALLS', 'SIMILAR_TOPOLOGY', 'USES_CONCEPT'],
            maxDepth: 2,
            maxCandidates: 20,
          });
          // Remove results already present in the main fused response.
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
    /**
     * Opt-in SearchRuntime -> ContextManifestV2 composition. The caller must
     * provide revision-qualified feature sources; this method performs no
     * cache or canonical writes and leaves legacy routes unchanged.
     */
    async searchWithAceManifest(
      req: AtlasSearchRequest,
      options: AtlasSearchAceManifestOptions,
    ) {
      const result = await this.searchWithQas(req, options);
      const ace = admitSearchRuntimeQasToAceManifestV1({
        projection: result.qas,
        candidateSnapshotRevision: options.candidateSnapshotRevision,
        retrievalPolicyRevision: options.retrievalPolicyRevision,
        representationRevision: options.representationRevision,
        acePlaybookRevision: options.acePlaybookRevision,
        tokenBudget: options.tokenBudget,
        graphRevision: options.graphRevision ?? null,
        laneMaskByCanonicalId: options.laneMaskByCanonicalId,
        producerRevision: options.producerRevision,
        ontologyRevision: options.ontologyRevision,
        modelRevision: options.modelRevision,
        promptTemplateRevision: options.promptTemplateRevision,
      });
      const { ordinalMap, ...aceAdmission } = ace;
      const cachedPacketCandidateResolution = options.cachedPacketHints
        ? resolveCachedPacketCandidatesV1({
            workspaceRevision: options.workspaceRevision,
            ordinalMap,
            hints: options.cachedPacketHints,
          })
        : null;
      let centroidCandidateCrosswalk: CentroidCardCandidateCrosswalkV1 | null = null;
      let centroidCandidateCrosswalkRejection: string | null = null;
      if (options.centroidCandidateHint) {
        try {
          centroidCandidateCrosswalk = resolveCentroidCardCandidatesV1({
            card: options.centroidCandidateHint.card,
            manifest: options.centroidCandidateHint.manifest,
            ordinalMap,
          });
        } catch (error) {
          centroidCandidateCrosswalkRejection = error instanceof Error
            ? error.message
            : 'CENTROID_CANDIDATE_CROSSWALK_FAILED';
        }
      }
      const cachedPacketSourceSpanVerifications: CachedPacketSourceSpanVerificationV1[] = [];
      const cachedPacketSourceSpanRejections: Array<{ hintId: string; reason: string }> = [];
      const sourceEvidenceByHint = new Map<string, CachedPacketSourceEvidenceInputV1>();
      const duplicateSourceEvidenceHints = new Set<string>();
      for (const item of options.cachedPacketSourceEvidence ?? []) {
        if (sourceEvidenceByHint.has(item.hintId)) {
          sourceEvidenceByHint.delete(item.hintId);
          duplicateSourceEvidenceHints.add(item.hintId);
          cachedPacketSourceSpanRejections.push({ hintId: item.hintId, reason: 'DUPLICATE_SOURCE_EVIDENCE_HINT' });
        } else if (!duplicateSourceEvidenceHints.has(item.hintId)) {
          sourceEvidenceByHint.set(item.hintId, item);
        }
      }
      for (const match of cachedPacketCandidateResolution?.matches ?? []) {
        if (duplicateSourceEvidenceHints.has(match.hintId)) continue;
        const evidence = sourceEvidenceByHint.get(match.hintId);
        if (!evidence) {
          cachedPacketSourceSpanRejections.push({ hintId: match.hintId, reason: 'SOURCE_EVIDENCE_NOT_SUPPLIED' });
          continue;
        }
        try {
          cachedPacketSourceSpanVerifications.push(evidence.sourceBindingReceipt
            ? verifyCachedPacketCandidateSourceBindingSpanV1(match, evidence.evidence, evidence.sourceBindingReceipt)
            : verifyCachedPacketCandidateSourceSpanV1(match, evidence.evidence));
        } catch (error) {
          cachedPacketSourceSpanRejections.push({
            hintId: match.hintId,
            reason: error instanceof Error ? error.message : 'SOURCE_EVIDENCE_VERIFICATION_FAILED',
          });
        }
      }
      const matchedHintIds = new Set((cachedPacketCandidateResolution?.matches ?? []).map(({ hintId }) => hintId));
      for (const hintId of sourceEvidenceByHint.keys()) {
        if (!matchedHintIds.has(hintId) && !duplicateSourceEvidenceHints.has(hintId)) {
          cachedPacketSourceSpanRejections.push({ hintId, reason: 'SOURCE_EVIDENCE_HINT_NOT_RESOLVED' });
        }
      }
      const retrievalCacheIdentity = options.retrievalCacheModel && options.retrievalCacheDim && options.contextPolicyRevision
        ? retrievalCacheIdentityFromAceManifestV1(aceAdmission, {
            queryHash: buildAceTopRetrievalQueryHash(req.query),
            model: options.retrievalCacheModel,
            dim: options.retrievalCacheDim,
            workspaceRevision: options.workspaceRevision,
            contextPolicyRevision: options.contextPolicyRevision,
          })
        : null;
      const acePacketCacheIdentity = retrievalCacheIdentity && options.packetRepresentationId
        && options.packetNormalizationPolicyRevision && options.packetArtifactChecksum
          ? bridgeAceContextManifestToPacketIdentityV1({
            admission: aceAdmission,
            queryHash: retrievalCacheIdentity.queryHash,
            requestHash: hashQuery(req.query),
            model: options.retrievalCacheModel,
            dim: options.retrievalCacheDim,
            workspaceRevision: options.workspaceRevision,
            contextPolicyRevision: options.contextPolicyRevision,
            representationId: options.packetRepresentationId,
            producerRevision: options.producerRevision,
            normalizationPolicyRevision: options.packetNormalizationPolicyRevision,
            artifactChecksum: options.packetArtifactChecksum,
          })
        : null;
      const candidateFeatureMatrixArtifact = produceCandidateFeatureMatrixFromSnapshotV1({
        requestId: options.requestId,
        ordinalMap,
        snapshot: ace.snapshot,
        producerRevision: `${options.producerRevision}:candidate-feature-matrix-v1`,
      });
      return {
        ...result,
        snapshot: ace.snapshot,
        admission: aceAdmission,
        cachedPacketCandidateResolution,
        centroidCandidateCrosswalk,
        centroidCandidateCrosswalkRejection,
        cachedPacketSourceSpanVerifications,
        cachedPacketSourceSpanRejections,
        retrievalCacheIdentity,
        acePacketCacheIdentity,
        candidateFeatureMatrixArtifact,
        writesPerformed: false as const,
        canonicalAuthority: false as const,
      };
    },
    /**
     * Opt-in read-only composition from the canonical SearchRuntime/ACE path
     * into logical residency descriptors. Physical providers are supplied
     * later; no buffer or GPU handle is retained here.
     */
    async searchWithUnifiedResidency(
      req: AtlasSearchRequest,
      options: SearchRuntimeUnifiedResidencyOptions,
    ) {
      const admitted = await this.searchWithAceManifest(req, options);
      const residency = prepareUnifiedResidencyAceBridgeV1({
        snapshot: admitted.snapshot,
        admission: admitted.admission,
        domain: options.domain,
        lutRevision: options.lutRevision,
        lut: options.lut,
        representationRevision: options.representationRevision,
        modelRevision: options.modelRevision,
        tokenizerRevision: options.tokenizerRevision,
        ropeRevision: options.ropeRevision,
        artifactChecksum: options.artifactChecksum,
        dtype: options.dtype,
      });
      return { ...admitted, residency, writesPerformed: false as const, canonicalAuthority: false as const };
    },
    /** Lower the admitted snapshot through the existing GPU-pack owner. */
    async searchWithUnifiedResidencyFeaturePack(
      req: AtlasSearchRequest,
      options: SearchRuntimeUnifiedResidencyOptions & { rowAlignment?: number },
    ) {
      const admitted = await this.searchWithAceManifest(req, options);
      const columnar = materializeCandidateFeatureColumnar({ snapshot: admitted.snapshot, producerRevision: options.producerRevision });
      const pack = materializeCandidateFeatureGpuPack({ columnar, rowAlignment: options.rowAlignment, producerRevision: options.producerRevision });
      const residencies = prepareUnifiedResidencyFeaturePackBatchV1({
        pack,
        representationRevision: options.representationRevision,
        modelRevision: options.modelRevision,
        tokenizerRevision: options.tokenizerRevision,
        ropeRevision: options.ropeRevision,
      });
      return { ...admitted, pack, residencies, writesPerformed: false as const, canonicalAuthority: false as const };
    },
  };
}
