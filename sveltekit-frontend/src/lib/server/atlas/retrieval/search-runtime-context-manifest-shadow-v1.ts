import type { SearchResult } from '../../retrieval/search-runtime.js';
import { buildAceContextManifestAdmissionV1 } from '../context/ace-context-manifest-admission-v1.js';
import type { ChunkRetrievalProfileV2 } from './chunk-retrieval-profile-v2.js';
import {
  compileSearchRuntimeLiveFeatureJoinV1,
  type SearchRuntimeLiveFeatureJoinV1,
  type SearchRuntimeLiveFeatureSupplementV1,
} from './search-runtime-live-feature-join-v1.js';

export interface SearchRuntimeContextManifestShadowSourceRowsV1 {
  profiles: readonly ChunkRetrievalProfileV2[];
  supplements: readonly SearchRuntimeLiveFeatureSupplementV1[];
}

export interface SearchRuntimeContextManifestShadowConfigV1 {
  requestId: string;
  policyRevision: string;
  workspaceRevision: string;
  representationRevision: string;
  candidateSnapshotRevision: string;
  producerRevision: string;
  taskKind: string;
  retrievalPolicyRevision: string;
  acePlaybookRevision: string;
  tokenBudget: number;
  graphRevision: string;
  ontologyRevision?: string | null;
  modelRevision?: string | null;
  promptTemplateRevision?: string | null;
  resolveFeatureSources: (input: {
    requestId: string;
    packets: SearchResult['packets'];
    workspaceRevision: string;
    representationRevision: string;
  }) => Promise<SearchRuntimeContextManifestShadowSourceRowsV1 | null>;
}

export type SearchRuntimeContextManifestShadowV1 =
  | {
      schema: 'atlas.search-runtime-context-manifest-shadow.v1';
      status: 'UNAVAILABLE';
      reason:
        | 'REVISION_QUALIFIED_FEATURE_SOURCE_PROVIDER_NOT_CONFIGURED'
        | 'REVISION_QUALIFIED_FEATURE_SOURCES_UNAVAILABLE'
        | 'FEATURE_SOURCE_PROVIDER_FAILED';
      join: null;
      manifest: null;
      writesPerformed: false;
      canonicalAuthority: false;
      rankingPromotion: false;
    }
  | {
      schema: 'atlas.search-runtime-context-manifest-shadow.v1';
      status: 'BLOCKED';
      reason:
        | 'LIVE_FEATURE_JOIN_BLOCKED'
        | 'EMPTY_CANDIDATE_SET'
        | 'MANIFEST_GRAPH_REVISION_MISMATCH'
        | 'CONTEXT_MANIFEST_VALIDATION_FAILED';
      join: SearchRuntimeLiveFeatureJoinV1 | null;
      manifest: null;
      writesPerformed: false;
      canonicalAuthority: false;
      rankingPromotion: false;
    }
  | {
      schema: 'atlas.search-runtime-context-manifest-shadow.v1';
      status: 'ADMITTED';
      reason: null;
      join: SearchRuntimeLiveFeatureJoinV1;
      manifest: ReturnType<typeof buildAceContextManifestAdmissionV1>;
      writesPerformed: false;
      canonicalAuthority: false;
      rankingPromotion: false;
    };

export async function runSearchRuntimeContextManifestShadowV1(input: {
  response: {
    packets: SearchResult['packets'];
    provenance: Pick<SearchResult['provenance'], 'readOnly'>;
  };
  config?: SearchRuntimeContextManifestShadowConfigV1;
}): Promise<SearchRuntimeContextManifestShadowV1> {
  if (!input.config) {
    return {
      schema: 'atlas.search-runtime-context-manifest-shadow.v1',
      status: 'UNAVAILABLE',
      reason: 'REVISION_QUALIFIED_FEATURE_SOURCE_PROVIDER_NOT_CONFIGURED',
      join: null,
      manifest: null,
      writesPerformed: false,
      canonicalAuthority: false,
      rankingPromotion: false,
    };
  }

  if (input.response.packets.length === 0) {
    return {
      schema: 'atlas.search-runtime-context-manifest-shadow.v1',
      status: 'BLOCKED',
      reason: 'EMPTY_CANDIDATE_SET',
      join: null,
      manifest: null,
      writesPerformed: false,
      canonicalAuthority: false,
      rankingPromotion: false,
    };
  }

  const config = input.config;
  let sources: SearchRuntimeContextManifestShadowSourceRowsV1 | null;
  try {
    sources = await config.resolveFeatureSources({
      requestId: config.requestId,
      packets: input.response.packets,
      workspaceRevision: config.workspaceRevision,
      representationRevision: config.representationRevision,
    });
  } catch {
    return {
      schema: 'atlas.search-runtime-context-manifest-shadow.v1',
      status: 'UNAVAILABLE',
      reason: 'FEATURE_SOURCE_PROVIDER_FAILED',
      join: null,
      manifest: null,
      writesPerformed: false,
      canonicalAuthority: false,
      rankingPromotion: false,
    };
  }
  if (!sources) {
    return {
      schema: 'atlas.search-runtime-context-manifest-shadow.v1',
      status: 'UNAVAILABLE',
      reason: 'REVISION_QUALIFIED_FEATURE_SOURCES_UNAVAILABLE',
      join: null,
      manifest: null,
      writesPerformed: false,
      canonicalAuthority: false,
      rankingPromotion: false,
    };
  }

  if (sources.profiles.some((profile) => profile.revisions.graphRevision !== config.graphRevision)) {
    return {
      schema: 'atlas.search-runtime-context-manifest-shadow.v1',
      status: 'BLOCKED',
      reason: 'MANIFEST_GRAPH_REVISION_MISMATCH',
      join: null,
      manifest: null,
      writesPerformed: false,
      canonicalAuthority: false,
      rankingPromotion: false,
    };
  }

  const join = compileSearchRuntimeLiveFeatureJoinV1({
    requestId: config.requestId,
    policyRevision: config.policyRevision,
    workspaceRevision: config.workspaceRevision,
    representationRevision: config.representationRevision,
    candidateSnapshotRevision: config.candidateSnapshotRevision,
    producerRevision: config.producerRevision,
    taskKind: config.taskKind,
    response: input.response,
    profiles: sources.profiles,
    supplements: sources.supplements,
  });

  if (join.status !== 'ADMITTED' || !join.snapshot) {
    return {
      schema: 'atlas.search-runtime-context-manifest-shadow.v1',
      status: 'BLOCKED',
      reason: 'LIVE_FEATURE_JOIN_BLOCKED',
      join,
      manifest: null,
      writesPerformed: false,
      canonicalAuthority: false,
      rankingPromotion: false,
    };
  }

  let manifest: ReturnType<typeof buildAceContextManifestAdmissionV1>;
  try {
    manifest = buildAceContextManifestAdmissionV1({
      snapshot: join.snapshot,
      requestId: config.requestId,
      selectedOrdinals: join.snapshot.rows.map((row) => row.candidateOrdinal),
      tokenBudget: config.tokenBudget,
      retrievalPolicyRevision: config.retrievalPolicyRevision,
      acePlaybookRevision: config.acePlaybookRevision,
      representationRevision: config.representationRevision,
      ontologyRevision: config.ontologyRevision,
      modelRevision: config.modelRevision,
      promptTemplateRevision: config.promptTemplateRevision,
      graphRevision: config.graphRevision,
    });
  } catch {
    return {
      schema: 'atlas.search-runtime-context-manifest-shadow.v1',
      status: 'BLOCKED',
      reason: 'CONTEXT_MANIFEST_VALIDATION_FAILED',
      join,
      manifest: null,
      writesPerformed: false,
      canonicalAuthority: false,
      rankingPromotion: false,
    };
  }

  return {
    schema: 'atlas.search-runtime-context-manifest-shadow.v1',
    status: 'ADMITTED',
    reason: null,
    join,
    manifest,
    writesPerformed: false,
    canonicalAuthority: false,
    rankingPromotion: false,
  };
}
