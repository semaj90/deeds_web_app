import { createHash } from 'node:crypto';
import {
  buildCandidateFeatureMatrix,
  type RetrievalCandidateFeatureMatrixV1,
} from './retrieval-candidate-feature-matrix-v1.js';
import {
  toCandidateProjectionInputV1,
  type ChunkRetrievalProfileV1,
} from './chunk-retrieval-profile-v1.js';

export const CANDIDATE_FEATURE_MATRIX_ADAPTER_V1_SCHEMA =
  'atlas.candidate-feature-matrix-adapter.v1' as const;

export interface CandidateExecutorProvenanceV1 {
  executor: string;
  executorRevision: string;
  representationId?: string;
  parityStatus?: string;
}

export interface CandidateFeatureIdentityV1 {
  candidateOrdinal: number;
  packetKey: string;
  sourceRef: string;
  sourceRevision: string;
  workspaceRevision: string;
}

export interface CandidateFeatureMatrixAdapterV1 {
  schema: typeof CANDIDATE_FEATURE_MATRIX_ADAPTER_V1_SCHEMA;
  matrix: RetrievalCandidateFeatureMatrixV1;
  featureRevision: string;
  identities: readonly CandidateFeatureIdentityV1[];
  executorProvenance: readonly CandidateExecutorProvenanceV1[];
  matrixChecksum: string;
  identityChecksum: string;
  canonicalAuthority: false;
  writesPerformed: false;
  rankingPromotion: false;
}

function sha256(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`;
}

function stableExecutorProvenance(
  provenance: readonly CandidateExecutorProvenanceV1[],
): CandidateExecutorProvenanceV1[] {
  return [...provenance]
    .map((entry) => ({ ...entry }))
    .sort((a, b) => `${a.executor}\0${a.executorRevision}`.localeCompare(`${b.executor}\0${b.executorRevision}`));
}

/**
 * Wraps the existing [C,25] matrix owner with identity and provenance.
 * This function only projects already-present profile evidence.
 */
export function adaptProfilesToCandidateFeatureMatrixV1(input: {
  profiles: readonly ChunkRetrievalProfileV1[];
  expectedSourceRevision?: string;
  executorProvenance: readonly CandidateExecutorProvenanceV1[];
}): CandidateFeatureMatrixAdapterV1 {
  if (input.profiles.length === 0) throw new Error('CANDIDATE_FEATURE_MATRIX_PROFILES_EMPTY');
  if (input.executorProvenance.length === 0) throw new Error('CANDIDATE_FEATURE_MATRIX_EXECUTOR_PROVENANCE_REQUIRED');

  const first = input.profiles[0]!;
  if (input.profiles.some((profile) => profile.featureRevision !== first.featureRevision)) {
    throw new Error('CANDIDATE_FEATURE_MATRIX_FEATURE_REVISION_MISMATCH');
  }
  if (input.profiles.some((profile) => profile.workspaceRevision !== first.workspaceRevision)) {
    throw new Error('CANDIDATE_FEATURE_MATRIX_WORKSPACE_REVISION_MISMATCH');
  }

  const seen = new Set<string>();
  const identities = input.profiles.map((profile, candidateOrdinal) => {
    if (seen.has(profile.packetKey)) throw new Error('CANDIDATE_FEATURE_MATRIX_DUPLICATE_PACKET_KEY');
    seen.add(profile.packetKey);
    return {
      candidateOrdinal,
      packetKey: profile.packetKey,
      sourceRef: profile.sourceRef,
      sourceRevision: profile.sourceRevision,
      workspaceRevision: profile.workspaceRevision,
    } satisfies CandidateFeatureIdentityV1;
  });

  const matrix = buildCandidateFeatureMatrix(
    input.profiles.map((profile) => toCandidateProjectionInputV1(profile, input.expectedSourceRevision)),
  );
  const identityChecksum = sha256(identities);
  const matrixChecksum = sha256({
    candidatePacketKeys: matrix.candidate_packet_keys,
    candidateFeatures: Array.from(matrix.candidate_features),
    presenceMask: Array.from(matrix.presence_mask),
    featureCount: matrix.feature_count,
  });

  return {
    schema: CANDIDATE_FEATURE_MATRIX_ADAPTER_V1_SCHEMA,
    matrix,
    featureRevision: first.featureRevision,
    identities,
    executorProvenance: stableExecutorProvenance(input.executorProvenance),
    matrixChecksum,
    identityChecksum,
    canonicalAuthority: false,
    writesPerformed: false,
    rankingPromotion: false,
  };
}
