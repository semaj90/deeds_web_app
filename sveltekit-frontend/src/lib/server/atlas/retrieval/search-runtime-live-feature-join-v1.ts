import type { SearchResult } from '../../retrieval/search-runtime.js';
import type { CandidateProjectionInput } from '../../retrieval/retrieval-candidate-feature-matrix-v1.js';
import { resolveCanonicalIdentityV2 } from '../../retrieval/identity-resolution.js';
import {
  ChunkRetrievalProfileV2Schema,
  verifyChunkRetrievalProfileV2Checksum,
  type ChunkRetrievalProfileV2,
} from './chunk-retrieval-profile-v2.js';
import {
  buildSearchRuntimeQasRows,
  type QueryAdaptiveFeatureRowV1,
  type SearchRuntimeQasCandidate,
  type SearchRuntimeQasFeatureContext,
} from './query-adaptive-feature-compiler.js';
import {
  materializeCandidateFeatureSnapshotFromQasRowsV1,
  type CandidateFeatureLaneV1,
} from '../features/retrieval-router-to-candidate-feature-snapshot-v1.js';
import {
  materializeCandidateFeatureColumnar,
  type CandidateFeatureColumnarV1,
} from '../features/candidate-feature-columnar-v1.js';
import type { CandidateFeatureSnapshotV1 } from '../features/candidate-feature-snapshot-v1.js';

export const SEARCH_RUNTIME_LIVE_FEATURE_JOIN_SCHEMA =
  'atlas.search-runtime-live-feature-join.v1' as const;

/**
 * Query-independent values that SearchRuntime does not currently own.
 *
 * These values must come from already-owned, revision-qualified producers.
 * This adapter never estimates them from packet text/metadata and never
 * substitutes zero for missing evidence.
 */
export interface SearchRuntimeLiveFeatureSupplementV1 {
  packetKey: string;
  retrievalFrequency: number;
  executionUtility: number;
  processFit: number;
  featureRevision: string;
  producerRevisions: {
    retrievalFrequency: string;
    executionUtility: string;
    processFit: string;
  };
  evidenceRefs: string[];
}

export type SearchRuntimeLiveFeatureJoinBlockCode =
  | 'SEARCH_RUNTIME_NOT_READ_ONLY'
  | 'PROFILE_NOT_FOUND_FOR_CHUNK'
  | 'PROFILE_INVALID'
  | 'PROFILE_CHECKSUM_INVALID'
  | 'PACKET_KEY_MISMATCH'
  | 'SOURCE_REF_MISMATCH'
  | 'WORKSPACE_REVISION_MISMATCH'
  | 'SOURCE_REVISION_MISMATCH'
  | 'GRAPH_REVISION_MISSING'
  | 'SEMANTIC_REVISION_MISSING'
  | 'REPRESENTATION_REVISION_MISMATCH'
  | 'SUPPLEMENT_MISSING'
  | 'SUPPLEMENT_PACKET_KEY_MISMATCH'
  | 'SUPPLEMENT_FEATURE_REVISION_MISMATCH'
  | 'SUPPLEMENT_PRODUCER_REVISION_MISSING'
  | 'SUPPLEMENT_EVIDENCE_MISSING'
  | 'SUPPLEMENT_SCORE_INVALID'
  | 'INCOMPLETE_QUERY_FEATURES'
  | 'QAS_ADAPTER_REJECTED';

export interface SearchRuntimeLiveFeatureJoinRejectionV1 {
  chunkRowId: string;
  packetKey: string | null;
  code: SearchRuntimeLiveFeatureJoinBlockCode;
  missingFeatures?: string[];
  detail?: string;
}

export interface SearchRuntimeLiveFeatureRevisionAvailabilityV1 {
  chunkRowId: string;
  packetKey: string;
  workspaceRevision: string;
  sourceRevision: string;
  graphRevision: string | null;
  featureRevision: string;
  representationRevision: string | null;
  runtimeWorkspaceRevisionPresent: boolean;
  runtimeSourceRevisionPresent: boolean;
  supplementProducerRevisions: SearchRuntimeLiveFeatureSupplementV1['producerRevisions'] | null;
}

export interface SearchRuntimeLiveFeatureJoinV1 {
  schema: typeof SEARCH_RUNTIME_LIVE_FEATURE_JOIN_SCHEMA;
  status: 'ADMITTED' | 'BLOCKED';
  requestId: string;
  candidateCount: number;
  acceptedCount: number;
  rejectedCount: number;
  qasRows: QueryAdaptiveFeatureRowV1[];
  rejections: SearchRuntimeLiveFeatureJoinRejectionV1[];
  revisionAvailability: SearchRuntimeLiveFeatureRevisionAvailabilityV1[];
  snapshot: CandidateFeatureSnapshotV1 | null;
  columnar: CandidateFeatureColumnarV1 | null;
  writesPerformed: false;
  canonicalAuthority: false;
  rankingPromotion: false;
}

function isUnitScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function uniqueStrings(values: readonly (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim()))]
    .sort((a, b) => a.localeCompare(b));
}

function projectionMissingFeatures(projection: CandidateProjectionInput): string[] {
  const required: Array<[keyof CandidateProjectionInput, string]> = [
    ['semantic_similarity_768', 'semantic_similarity_768'],
    ['lexical_score', 'lexical_score'],
    ['ast_signal', 'ast_signal'],
    ['authority_norm', 'authority_norm'],
    ['domain_fit_query', 'domain_fit_query'],
    ['recency', 'recency'],
    ['retrieval_frequency', 'retrieval_frequency'],
    ['execution_utility', 'execution_utility'],
    ['process_fit', 'process_fit'],
  ];
  return required
    .filter(([key]) => !isUnitScore(projection[key]))
    .map(([, name]) => name);
}

function lanesForProjection(projection: CandidateProjectionInput): CandidateFeatureLaneV1[] {
  const lanes: CandidateFeatureLaneV1[] = [];
  if (isUnitScore(projection.semantic_similarity_768)) lanes.push('semantic');
  if (isUnitScore(projection.lexical_score)) lanes.push('lexical');
  if (isUnitScore(projection.ast_signal)) lanes.push('ast');
  if (isUnitScore(projection.authority_norm)) lanes.push('graph');
  if (isUnitScore(projection.domain_fit_query)) lanes.push('domain');
  if (isUnitScore(projection.execution_utility)) lanes.push('execution');
  if (isUnitScore(projection.retrieval_frequency)) lanes.push('memory');
  return lanes;
}

/**
 * FEAT-LIVE-01 / FEAT-MATRIX-02 bounded read-only join.
 *
 * Ownership rules:
 * - SearchRuntime supplies query-time scores only.
 * - ChunkRetrievalProfileV2 supplies canonical chunk/source/revision lineage.
 * - the supplement supplies only values owned elsewhere (frequency/execution/process).
 * - canonical identity is resolved by the existing shared resolver.
 * - any missing/mismatched owner blocks the whole snapshot; rejected candidates are
 *   never silently dropped from candidate membership.
 */
export function compileSearchRuntimeLiveFeatureJoinV1(input: {
  requestId: string;
  policyRevision: string;
  workspaceRevision: string;
  representationRevision: string;
  candidateSnapshotRevision: string;
  producerRevision: string;
  taskKind: string;
  response: {\n    packets: SearchResult['packets'];\n    provenance: Pick<SearchResult['provenance'], 'readOnly'>;\n  };
  profiles: readonly ChunkRetrievalProfileV2[];
  supplements: readonly SearchRuntimeLiveFeatureSupplementV1[];
}): SearchRuntimeLiveFeatureJoinV1 {
  const rejections: SearchRuntimeLiveFeatureJoinRejectionV1[] = [];
  const revisionAvailability: SearchRuntimeLiveFeatureRevisionAvailabilityV1[] = [];
  const candidates: SearchRuntimeQasCandidate[] = [];
  const projections: CandidateProjectionInput[] = [];
  const contexts = new Map<string, SearchRuntimeQasFeatureContext>();
  const laneMaskByCanonicalId: Record<string, CandidateFeatureLaneV1[]> = {};

  if (input.response.provenance.readOnly !== true) {
    for (const packet of input.response.packets) {
      rejections.push({
        chunkRowId: packet.chunk_id,
        packetKey: packet.packet_key ?? null,
        code: 'SEARCH_RUNTIME_NOT_READ_ONLY',
      });
    }
    return {
      schema: SEARCH_RUNTIME_LIVE_FEATURE_JOIN_SCHEMA,
      status: 'BLOCKED',
      requestId: input.requestId,
      candidateCount: input.response.packets.length,
      acceptedCount: 0,
      rejectedCount: rejections.length,
      qasRows: [],
      rejections,
      revisionAvailability,
      snapshot: null,
      columnar: null,
      writesPerformed: false,
      canonicalAuthority: false,
      rankingPromotion: false,
    };
  }

  const profilesByChunkRowId = new Map<string, ChunkRetrievalProfileV2>();
  for (const rawProfile of input.profiles) {
    let profile: ChunkRetrievalProfileV2;
    try {
      profile = ChunkRetrievalProfileV2Schema.parse(rawProfile);
    } catch (error) {
      rejections.push({
        chunkRowId: rawProfile.chunkRowId ?? 'unknown',
        packetKey: rawProfile.packetKey ?? null,
        code: 'PROFILE_INVALID',
        detail: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    if (!verifyChunkRetrievalProfileV2Checksum(profile)) {
      rejections.push({
        chunkRowId: profile.chunkRowId,
        packetKey: profile.packetKey,
        code: 'PROFILE_CHECKSUM_INVALID',
      });
      continue;
    }
    profilesByChunkRowId.set(profile.chunkRowId, profile);
  }

  const supplementsByPacketKey = new Map(input.supplements.map((supplement) => [supplement.packetKey, supplement]));

  for (const packet of input.response.packets) {
    const profile = profilesByChunkRowId.get(packet.chunk_id);
    if (!profile) {
      rejections.push({
        chunkRowId: packet.chunk_id,
        packetKey: packet.packet_key ?? null,
        code: 'PROFILE_NOT_FOUND_FOR_CHUNK',
      });
      continue;
    }

    if (packet.packet_key && packet.packet_key !== profile.packetKey) {
      rejections.push({
        chunkRowId: packet.chunk_id,
        packetKey: packet.packet_key,
        code: 'PACKET_KEY_MISMATCH',
        detail: `runtime=${packet.packet_key};profile=${profile.packetKey}`,
      });
      continue;
    }
    if (packet.source_ref && packet.source_ref !== profile.sourceRef) {
      rejections.push({
        chunkRowId: packet.chunk_id,
        packetKey: profile.packetKey,
        code: 'SOURCE_REF_MISMATCH',
        detail: `runtime=${packet.source_ref};profile=${profile.sourceRef}`,
      });
      continue;
    }
    if (packet.workspace_revision && packet.workspace_revision !== profile.workspaceRevision) {
      rejections.push({
        chunkRowId: packet.chunk_id,
        packetKey: profile.packetKey,
        code: 'WORKSPACE_REVISION_MISMATCH',
        detail: `runtime=${packet.workspace_revision};profile=${profile.workspaceRevision}`,
      });
      continue;
    }
    if (profile.workspaceRevision !== input.workspaceRevision) {
      rejections.push({
        chunkRowId: packet.chunk_id,
        packetKey: profile.packetKey,
        code: 'WORKSPACE_REVISION_MISMATCH',
        detail: `requested=${input.workspaceRevision};profile=${profile.workspaceRevision}`,
      });
      continue;
    }
    if (packet.source_revision && packet.source_revision !== profile.sourceRevision) {
      rejections.push({
        chunkRowId: packet.chunk_id,
        packetKey: profile.packetKey,
        code: 'SOURCE_REVISION_MISMATCH',
        detail: `runtime=${packet.source_revision};profile=${profile.sourceRevision}`,
      });
      continue;
    }

    const graphRevision = profile.revisions.graphRevision ?? null;
    const representationRevision = profile.semantic?.representationRevision ?? null;
    const supplement = supplementsByPacketKey.get(profile.packetKey) ?? null;

    revisionAvailability.push({
      chunkRowId: profile.chunkRowId,
      packetKey: profile.packetKey,
      workspaceRevision: profile.workspaceRevision,
      sourceRevision: profile.sourceRevision,
      graphRevision,
      featureRevision: profile.revisions.featureRevision,
      representationRevision,
      runtimeWorkspaceRevisionPresent: Boolean(packet.workspace_revision?.trim()),
      runtimeSourceRevisionPresent: Boolean(packet.source_revision?.trim()),
      supplementProducerRevisions: supplement?.producerRevisions ?? null,
    });

    if (!graphRevision) {
      rejections.push({ chunkRowId: packet.chunk_id, packetKey: profile.packetKey, code: 'GRAPH_REVISION_MISSING' });
      continue;
    }
    if (!representationRevision) {
      rejections.push({ chunkRowId: packet.chunk_id, packetKey: profile.packetKey, code: 'SEMANTIC_REVISION_MISSING' });
      continue;
    }
    if (representationRevision !== input.representationRevision) {
      rejections.push({
        chunkRowId: packet.chunk_id,
        packetKey: profile.packetKey,
        code: 'REPRESENTATION_REVISION_MISMATCH',
        detail: `requested=${input.representationRevision};profile=${representationRevision}`,
      });
      continue;
    }
    if (!supplement) {
      rejections.push({ chunkRowId: packet.chunk_id, packetKey: profile.packetKey, code: 'SUPPLEMENT_MISSING' });
      continue;
    }
    if (supplement.packetKey !== profile.packetKey) {
      rejections.push({ chunkRowId: packet.chunk_id, packetKey: profile.packetKey, code: 'SUPPLEMENT_PACKET_KEY_MISMATCH' });
      continue;
    }
    if (supplement.featureRevision !== profile.revisions.featureRevision) {
      rejections.push({
        chunkRowId: packet.chunk_id,
        packetKey: profile.packetKey,
        code: 'SUPPLEMENT_FEATURE_REVISION_MISMATCH',
        detail: `supplement=${supplement.featureRevision};profile=${profile.revisions.featureRevision}`,
      });
      continue;
    }
    if (Object.values(supplement.producerRevisions).some((value) => !value?.trim())) {
      rejections.push({ chunkRowId: packet.chunk_id, packetKey: profile.packetKey, code: 'SUPPLEMENT_PRODUCER_REVISION_MISSING' });
      continue;
    }
    if (supplement.evidenceRefs.length === 0) {
      rejections.push({ chunkRowId: packet.chunk_id, packetKey: profile.packetKey, code: 'SUPPLEMENT_EVIDENCE_MISSING' });
      continue;
    }
    if (![supplement.retrievalFrequency, supplement.executionUtility, supplement.processFit].every(isUnitScore)) {
      rejections.push({ chunkRowId: packet.chunk_id, packetKey: profile.packetKey, code: 'SUPPLEMENT_SCORE_INVALID' });
      continue;
    }

    const identity = resolveCanonicalIdentityV2({
      symbolVersionId: packet.symbol_version_id,
      packetKey: profile.packetKey,
      canonicalChunkId: profile.canonicalChunkId,
      contentHash: packet.content_hash,
      sourceRef: profile.sourceRef,
      laneId: packet.chunk_id,
      evidenceRefs: profile.evidenceRefs,
    });
    if (identity.resolutionStatus !== 'CANONICAL') {
      rejections.push({
        chunkRowId: packet.chunk_id,
        packetKey: profile.packetKey,
        code: 'PROFILE_INVALID',
        detail: `canonical identity resolver returned ${identity.resolutionStatus}`,
      });
      continue;
    }

    const projection: CandidateProjectionInput = {
      packet_key: profile.packetKey,
      semantic_similarity_768: packet.dense?.score,
      lexical_score: packet.lexical?.score,
      ast_signal: packet.ast?.score,
      authority_norm: packet.authority?.score,
      domain_fit_query: packet.metadata?.domain ? packet.metadata.score : undefined,
      recency: packet.recency?.score,
      retrieval_frequency: supplement.retrievalFrequency,
      execution_utility: supplement.executionUtility,
      process_fit: supplement.processFit,
      source_revision_match: 1,
      representation_revision_match: 1,
    };
    const missingFeatures = projectionMissingFeatures(projection);
    if (missingFeatures.length > 0) {
      rejections.push({
        chunkRowId: packet.chunk_id,
        packetKey: profile.packetKey,
        code: 'INCOMPLETE_QUERY_FEATURES',
        missingFeatures,
      });
      continue;
    }

    const candidate: SearchRuntimeQasCandidate = {
      packetKey: profile.packetKey,
      sourceRef: profile.sourceRef,
      // The QAS bridge historically calls this field stableSymbolId, but its
      // semantic role is canonicalId. Supply only the shared resolver's result.
      stableSymbolId: identity.key,
      symbolVersionId: packet.symbol_version_id ?? null,
      workspaceRevision: profile.workspaceRevision,
      sourceRevision: profile.sourceRevision,
      representationRevision,
      score: packet.retrieval_score,
      fusionScore: packet.fusion_score,
      rankBefore: packet.fusion_rank,
    };
    const context: SearchRuntimeQasFeatureContext = {
      graphRevision,
      featureRevision: profile.revisions.featureRevision,
      representationRevision,
      taskKind: input.taskKind,
      domainClass: packet.domain_class ?? profile.domainTopic?.primaryDomain ?? null,
      somRevision: profile.revisions.topologyRevision ?? null,
      features: {
        semanticAffinity: projection.semantic_similarity_768!,
        lexicalAffinity: projection.lexical_score!,
        graphAuthority: projection.authority_norm!,
        astAffinity: projection.ast_signal!,
        processAffinity: projection.process_fit!,
        domainAffinity: projection.domain_fit_query!,
        priorExecutionSuccess: projection.execution_utility!,
        reuseProbability: projection.retrieval_frequency!,
        recency: projection.recency!,
      },
      evidenceRefs: uniqueStrings([...profile.evidenceRefs, ...supplement.evidenceRefs]),
    };

    candidates.push(candidate);
    projections.push(projection);
    contexts.set(profile.packetKey, context);
    laneMaskByCanonicalId[identity.key] = lanesForProjection(projection);
  }

  if (rejections.length > 0 || candidates.length !== input.response.packets.length) {
    return {
      schema: SEARCH_RUNTIME_LIVE_FEATURE_JOIN_SCHEMA,
      status: 'BLOCKED',
      requestId: input.requestId,
      candidateCount: input.response.packets.length,
      acceptedCount: candidates.length,
      rejectedCount: rejections.length,
      qasRows: [],
      rejections,
      revisionAvailability,
      snapshot: null,
      columnar: null,
      writesPerformed: false,
      canonicalAuthority: false,
      rankingPromotion: false,
    };
  }

  const qas = buildSearchRuntimeQasRows({
    requestId: input.requestId,
    policyRevision: input.policyRevision,
    workspaceRevision: input.workspaceRevision,
    representationRevision: input.representationRevision,
    candidates,
    projections,
    resolveFeatures: (candidate) => contexts.get(candidate.packetKey),
  });

  if (qas.rejected.length > 0 || qas.rows.length !== candidates.length) {
    for (const rejected of qas.rejected) {
      rejections.push({
        chunkRowId: input.response.packets.find((packet) => (packet.packet_key ?? '') === rejected.packetKey)?.chunk_id ?? 'unknown',
        packetKey: rejected.packetKey,
        code: 'QAS_ADAPTER_REJECTED',
        detail: rejected.reason,
      });
    }
    return {
      schema: SEARCH_RUNTIME_LIVE_FEATURE_JOIN_SCHEMA,
      status: 'BLOCKED',
      requestId: input.requestId,
      candidateCount: input.response.packets.length,
      acceptedCount: qas.rows.length,
      rejectedCount: rejections.length,
      qasRows: qas.rows,
      rejections,
      revisionAvailability,
      snapshot: null,
      columnar: null,
      writesPerformed: false,
      canonicalAuthority: false,
      rankingPromotion: false,
    };
  }

  const snapshot = materializeCandidateFeatureSnapshotFromQasRowsV1({
    rows: qas.rows,
    candidateSnapshotRevision: input.candidateSnapshotRevision,
    producerRevision: input.producerRevision,
    laneMaskByCanonicalId,
  });
  const columnar = materializeCandidateFeatureColumnar({
    snapshot,
    producerRevision: input.producerRevision,
  });

  return {
    schema: SEARCH_RUNTIME_LIVE_FEATURE_JOIN_SCHEMA,
    status: 'ADMITTED',
    requestId: input.requestId,
    candidateCount: input.response.packets.length,
    acceptedCount: qas.rows.length,
    rejectedCount: 0,
    qasRows: qas.rows,
    rejections: [],
    revisionAvailability,
    snapshot,
    columnar,
    writesPerformed: false,
    canonicalAuthority: false,
    rankingPromotion: false,
  };
}
