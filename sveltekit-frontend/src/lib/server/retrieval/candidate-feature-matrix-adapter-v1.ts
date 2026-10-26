import { z } from 'zod';
import { canonicalSha256V1, formatSha256RevisionV1 } from '$lib/server/atlas/prefill/canonical-hash-v1.js';
import {
  buildCandidateFeatureMatrix,
  type RetrievalCandidateFeatureMatrixV1,
} from './retrieval-candidate-feature-matrix-v1.js';
import { CANDIDATE_FEATURE_NAMES } from '../atlas/contracts/feature-extraction-v1.js';
import {
  toCandidateProjectionInputV1,
  type ChunkRetrievalProfileV1,
} from './chunk-retrieval-profile-v1.js';
import {
  assertCandidateOrdinalMapIntegrityV1,
  candidateOrdinalMapV1Schema,
  type CandidateOrdinalMapV1,
} from '../atlas/features/canonical-candidate-v1.js';

export const CANDIDATE_FEATURE_MATRIX_ADAPTER_V1_SCHEMA =
  'atlas.candidate-feature-matrix-adapter.v1' as const;
export const RETRIEVAL_CANDIDATE_FEATURE_MATRIX_RECEIPT_V1_SCHEMA =
  'atlas.retrieval-candidate-feature-matrix-receipt.v1' as const;

const sha256Schema = z.string().regex(/^sha256:[0-9a-f]{64}$/);

export const retrievalCandidateFeatureMatrixReceiptV1Schema = z.object({
  schema: z.literal(RETRIEVAL_CANDIDATE_FEATURE_MATRIX_RECEIPT_V1_SCHEMA),
  matrixRevision: sha256Schema,
  workspaceRevision: z.string().min(1),
  candidateOrdinalMapRevision: sha256Schema,
  candidateOrdinalMapChecksum: z.string().regex(/^(?:sha256:)?[0-9a-f]{64}$/),
  featureVocabularyChecksum: sha256Schema,
  rowBindingChecksum: sha256Schema,
  graphRevision: z.null(),
  graphUnavailableReason: z.literal('NO_GRAPH_REVISION_BOUND_TO_MATRIX_ROWS'),
  representationRevision: z.null(),
  representationUnavailableReason: z.literal('NO_EXACT_REPRESENTATION_REVISION_BOUND_TO_MATRIX_ROWS'),
  rowCount: z.number().int().positive(),
  columnCount: z.literal(25),
  availableFeatureCount: z.number().int().nonnegative(),
  unavailableFeatureCount: z.number().int().nonnegative(),
  matrixChecksum: sha256Schema,
  producerRevision: sha256Schema,
  receiptChecksum: sha256Schema,
}).strict().superRefine((receipt, context) => {
  if (receipt.availableFeatureCount + receipt.unavailableFeatureCount !== receipt.rowCount * receipt.columnCount) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'MATRIX_RECEIPT_AVAILABILITY_COUNT_MISMATCH' });
  }
});

export type RetrievalCandidateFeatureMatrixReceiptV1 = z.infer<typeof retrievalCandidateFeatureMatrixReceiptV1Schema>;

export interface CandidateExecutorProvenanceV1 {
  executor: string;
  executorRevision: string;
  representationId?: string;
  parityStatus?: string;
}

export interface CandidateFeatureIdentityV1 {
  candidateOrdinal: number;
  rowOrdinal: number;
  canonicalId: string;
  packetKey: string;
  symbolVersionId: string | null;
  sourceRef: string;
  sourceRevision: string;
  workspaceRevision: string;
}

export interface CandidateFeatureMatrixAdapterV1 {
  schema: typeof CANDIDATE_FEATURE_MATRIX_ADAPTER_V1_SCHEMA;
  matrix: RetrievalCandidateFeatureMatrixV1;
  ordinalMapRevision: string;
  ordinalMapChecksum: string;
  featureRevision: string;
  identities: readonly CandidateFeatureIdentityV1[];
  rowBindingChecksum: string;
  receipt: RetrievalCandidateFeatureMatrixReceiptV1;
  executorProvenance: readonly CandidateExecutorProvenanceV1[];
  matrixChecksum: string;
  identityChecksum: string;
  canonicalAuthority: false;
  writesPerformed: false;
  rankingPromotion: false;
}

function sha256(value: unknown): string {
  return `sha256:${canonicalSha256V1(value)}`;
}

const serializedCandidateFeatureMatrixAdapterV1Schema = z.object({
  schema: z.literal(CANDIDATE_FEATURE_MATRIX_ADAPTER_V1_SCHEMA),
  matrix: z.object({
    candidate_packet_keys: z.array(z.string().min(1)),
    candidate_features: z.array(z.number().finite()),
    presence_mask: z.array(z.number().int().min(0).max(1)),
    candidate_count: z.number().int().positive(),
    feature_count: z.literal(25),
  }).strict(),
  ordinalMapRevision: sha256Schema,
  ordinalMapChecksum: z.string().regex(/^(?:sha256:)?[0-9a-f]{64}$/),
  featureRevision: z.string().min(1),
  identities: z.array(z.object({
    candidateOrdinal: z.number().int().nonnegative(),
    rowOrdinal: z.number().int().nonnegative(),
    canonicalId: z.string().min(1),
    packetKey: z.string().min(1),
    symbolVersionId: z.string().min(1).nullable(),
    sourceRef: z.string().min(1),
    sourceRevision: z.string().min(1),
    workspaceRevision: z.string().min(1),
  }).strict()).min(1),
  rowBindingChecksum: sha256Schema,
  receipt: retrievalCandidateFeatureMatrixReceiptV1Schema,
  executorProvenance: z.array(z.object({
    executor: z.string().min(1),
    executorRevision: z.string().min(1),
    representationId: z.string().min(1).optional(),
    parityStatus: z.string().min(1).optional(),
  }).strict()),
  matrixChecksum: sha256Schema,
  identityChecksum: sha256Schema,
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
  rankingPromotion: z.literal(false),
}).strict();

export function serializeCandidateFeatureMatrixAdapterV1(
  result: CandidateFeatureMatrixAdapterV1,
): string {
  return JSON.stringify({
    ...result,
    matrix: {
      candidate_packet_keys: result.matrix.candidate_packet_keys,
      candidate_features: Array.from(result.matrix.candidate_features),
      presence_mask: Array.from(result.matrix.presence_mask),
      candidate_count: result.matrix.candidate_count,
      feature_count: result.matrix.feature_count,
    },
  });
}

export function verifyCandidateFeatureMatrixAdapterReadbackV1(
  serialized: string,
  ordinalMapInput: CandidateOrdinalMapV1,
) {
  const ordinalMap = candidateOrdinalMapV1Schema.parse(ordinalMapInput);
  assertCandidateOrdinalMapIntegrityV1(ordinalMap);
  let decoded: unknown;
  try {
    decoded = JSON.parse(serialized);
  } catch {
    throw new Error('CANDIDATE_FEATURE_MATRIX_READBACK_JSON_INVALID');
  }
  const result = serializedCandidateFeatureMatrixAdapterV1Schema.parse(decoded);
  const { matrix, identities, receipt } = result;
  if (matrix.candidate_count !== identities.length ||
      matrix.candidate_packet_keys.length !== identities.length ||
      matrix.candidate_features.length !== identities.length * matrix.feature_count ||
      matrix.presence_mask.length !== identities.length * matrix.feature_count) {
    throw new Error('CANDIDATE_FEATURE_MATRIX_READBACK_SHAPE_MISMATCH');
  }
  if (identities.some((identity, row) => identity.candidateOrdinal !== row || identity.rowOrdinal !== row ||
      identity.packetKey !== matrix.candidate_packet_keys[row] ||
      identity.workspaceRevision !== receipt.workspaceRevision)) {
    throw new Error('CANDIDATE_FEATURE_MATRIX_READBACK_ROW_BINDING_MISMATCH');
  }
  const normalizedOrdinalMapChecksum = formatSha256RevisionV1(result.ordinalMapChecksum);
  if (result.ordinalMapRevision !== normalizedOrdinalMapChecksum ||
      ordinalMap.rowCount !== matrix.candidate_count ||
      ordinalMap.workspaceRevision !== receipt.workspaceRevision ||
      ordinalMap.ordinalMapChecksum !== result.ordinalMapChecksum ||
      receipt.candidateOrdinalMapRevision !== result.ordinalMapRevision ||
      receipt.candidateOrdinalMapChecksum !== result.ordinalMapChecksum ||
      receipt.rowCount !== matrix.candidate_count || receipt.columnCount !== matrix.feature_count) {
    throw new Error('CANDIDATE_FEATURE_MATRIX_READBACK_ORDINAL_BINDING_MISMATCH');
  }
  if (ordinalMap.candidates.some((candidate, row) => {
    const identity = identities[row];
    return !identity || candidate.candidateOrdinal !== identity.candidateOrdinal ||
      candidate.canonicalId !== identity.canonicalId || candidate.packetKey !== identity.packetKey ||
      candidate.symbolVersionId !== identity.symbolVersionId || candidate.sourceRef !== identity.sourceRef ||
      candidate.sourceRevision !== identity.sourceRevision || candidate.workspaceRevision !== identity.workspaceRevision;
  })) {
    throw new Error('CANDIDATE_FEATURE_MATRIX_READBACK_CANONICAL_ROW_MISMATCH');
  }
  const expectedMatrixChecksum = sha256({
    candidatePacketKeys: matrix.candidate_packet_keys,
    candidateFeatures: matrix.candidate_features,
    presenceMask: matrix.presence_mask,
    featureCount: matrix.feature_count,
  });
  if (expectedMatrixChecksum !== result.matrixChecksum || expectedMatrixChecksum !== receipt.matrixChecksum) {
    throw new Error('CANDIDATE_FEATURE_MATRIX_READBACK_MATRIX_CHECKSUM_MISMATCH');
  }
  const rowBindingChecksum = sha256({
    schema: 'atlas.candidate-matrix-row-crosswalk.v1',
    ordinalMapRevision: result.ordinalMapRevision,
    workspaceRevision: receipt.workspaceRevision,
    rows: identities.map(({ candidateOrdinal, rowOrdinal, canonicalId, packetKey, symbolVersionId, sourceRef, sourceRevision }) => ({
      candidateOrdinal, rowOrdinal, canonicalId, packetKey, symbolVersionId, sourceRef, sourceRevision,
    })),
  });
  if (rowBindingChecksum !== result.rowBindingChecksum || rowBindingChecksum !== receipt.rowBindingChecksum) {
    throw new Error('CANDIDATE_FEATURE_MATRIX_READBACK_ROW_CHECKSUM_MISMATCH');
  }
  const identityChecksum = sha256({
    ordinalMapRevision: result.ordinalMapRevision,
    ordinalMapChecksum: result.ordinalMapChecksum,
    identities,
  });
  if (identityChecksum !== result.identityChecksum) {
    throw new Error('CANDIDATE_FEATURE_MATRIX_READBACK_IDENTITY_CHECKSUM_MISMATCH');
  }
  const featureVocabularyChecksum = sha256(CANDIDATE_FEATURE_NAMES);
  const matrixRevision = sha256({
    featureVocabularyChecksum,
    rowBindingChecksum,
    workspaceRevision: receipt.workspaceRevision,
    graphRevision: null,
    graphUnavailableReason: 'NO_GRAPH_REVISION_BOUND_TO_MATRIX_ROWS',
    representationRevision: null,
    representationUnavailableReason: 'NO_EXACT_REPRESENTATION_REVISION_BOUND_TO_MATRIX_ROWS',
  });
  const producerRevision = sha256({
    owner: CANDIDATE_FEATURE_MATRIX_ADAPTER_V1_SCHEMA,
    featureRevision: result.featureRevision,
    featureVocabularyChecksum,
  });
  const availableFeatureCount = matrix.presence_mask.reduce((sum, value) => sum + value, 0);
  if (receipt.featureVocabularyChecksum !== featureVocabularyChecksum ||
      receipt.matrixRevision !== matrixRevision || receipt.producerRevision !== producerRevision ||
      receipt.availableFeatureCount !== availableFeatureCount ||
      receipt.unavailableFeatureCount !== matrix.presence_mask.length - availableFeatureCount) {
    throw new Error('CANDIDATE_FEATURE_MATRIX_READBACK_RECEIPT_BINDING_MISMATCH');
  }
  const { receiptChecksum, ...receiptBody } = receipt;
  if (sha256(receiptBody) !== receiptChecksum) {
    throw new Error('CANDIDATE_FEATURE_MATRIX_READBACK_RECEIPT_CHECKSUM_MISMATCH');
  }
  return {
    schema: 'atlas.candidate-feature-matrix-readback.v1' as const,
    status: 'MATCH' as const,
    rowCount: matrix.candidate_count,
    columnCount: matrix.feature_count,
    matrixChecksum: expectedMatrixChecksum,
    rowBindingChecksum,
    receiptChecksum,
    receipt,
    canonicalAuthority: false as const,
    writesPerformed: false as const,
  };
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
  ordinalMap: CandidateOrdinalMapV1;
  expectedSourceRevision?: string;
  executorProvenance: readonly CandidateExecutorProvenanceV1[];
}): CandidateFeatureMatrixAdapterV1 {
  if (input.profiles.length === 0) throw new Error('CANDIDATE_FEATURE_MATRIX_PROFILES_EMPTY');
  if (input.executorProvenance.length === 0) throw new Error('CANDIDATE_FEATURE_MATRIX_EXECUTOR_PROVENANCE_REQUIRED');

  const ordinalMap = candidateOrdinalMapV1Schema.parse(input.ordinalMap);
  assertCandidateOrdinalMapIntegrityV1(ordinalMap);
  if (input.profiles.length !== ordinalMap.rowCount) {
    throw new Error('CANDIDATE_FEATURE_MATRIX_ORDINAL_MAP_ROW_COUNT_MISMATCH');
  }

  const first = input.profiles[0]!;
  if (input.profiles.some((profile) => profile.featureRevision !== first.featureRevision)) {
    throw new Error('CANDIDATE_FEATURE_MATRIX_FEATURE_REVISION_MISMATCH');
  }
  if (first.workspaceRevision !== ordinalMap.workspaceRevision ||
      input.profiles.some((profile) => profile.workspaceRevision !== ordinalMap.workspaceRevision)) {
    throw new Error('CANDIDATE_FEATURE_MATRIX_WORKSPACE_REVISION_MISMATCH');
  }

  const profilesByPacketKey = new Map<string, ChunkRetrievalProfileV1>();
  for (const profile of input.profiles) {
    if (profilesByPacketKey.has(profile.packetKey)) throw new Error('CANDIDATE_FEATURE_MATRIX_DUPLICATE_PACKET_KEY');
    profilesByPacketKey.set(profile.packetKey, profile);
  }

  const orderedProfiles = ordinalMap.candidates.map((candidate) => {
    if (!candidate.packetKey || !candidate.sourceRef) {
      throw new Error(`CANDIDATE_FEATURE_MATRIX_ORDINAL_IDENTITY_INCOMPLETE:${candidate.candidateOrdinal}`);
    }
    const profile = profilesByPacketKey.get(candidate.packetKey);
    if (!profile) throw new Error(`CANDIDATE_FEATURE_MATRIX_PROFILE_MISSING:${candidate.candidateOrdinal}`);
    if (profile.sourceRef !== candidate.sourceRef || profile.sourceRevision !== candidate.sourceRevision ||
        profile.workspaceRevision !== candidate.workspaceRevision) {
      throw new Error(`CANDIDATE_FEATURE_MATRIX_PROFILE_IDENTITY_MISMATCH:${candidate.candidateOrdinal}`);
    }
    profilesByPacketKey.delete(candidate.packetKey);
    return { candidate, profile };
  });
  if (profilesByPacketKey.size > 0) throw new Error('CANDIDATE_FEATURE_MATRIX_PROFILE_ORPHANED');
  if (input.expectedSourceRevision && orderedProfiles.some(({ profile }) => profile.sourceRevision !== input.expectedSourceRevision)) {
    throw new Error('CANDIDATE_FEATURE_MATRIX_SOURCE_REVISION_MISMATCH');
  }

  const seenCanonicalIds = new Set<string>();
  const identities = orderedProfiles.map(({ candidate, profile }, rowOrdinal) => {
    if (candidate.candidateOrdinal !== rowOrdinal) {
      throw new Error(`CANDIDATE_FEATURE_MATRIX_ROW_ORDINAL_MISMATCH:${rowOrdinal}`);
    }
    if (seenCanonicalIds.has(candidate.canonicalId)) {
      throw new Error(`CANDIDATE_FEATURE_MATRIX_DUPLICATE_CANONICAL_ID:${candidate.canonicalId}`);
    }
    seenCanonicalIds.add(candidate.canonicalId);
    return {
      candidateOrdinal: candidate.candidateOrdinal,
      rowOrdinal,
      canonicalId: candidate.canonicalId,
      packetKey: profile.packetKey,
      symbolVersionId: candidate.symbolVersionId,
      sourceRef: profile.sourceRef,
      sourceRevision: profile.sourceRevision,
      workspaceRevision: profile.workspaceRevision,
    } satisfies CandidateFeatureIdentityV1;
  });

  const matrix = buildCandidateFeatureMatrix(
    orderedProfiles.map(({ profile }) => toCandidateProjectionInputV1(profile, input.expectedSourceRevision)),
  );
  const ordinalMapRevision = `sha256:${ordinalMap.ordinalMapChecksum.replace(/^sha256:/, '')}`;
  if (matrix.candidate_count !== ordinalMap.rowCount ||
      matrix.candidate_packet_keys.some((packetKey, rowOrdinal) =>
        packetKey !== identities[rowOrdinal]?.packetKey || identities[rowOrdinal]?.rowOrdinal !== rowOrdinal)) {
    throw new Error('CANDIDATE_FEATURE_MATRIX_ROW_CROSSWALK_MISMATCH');
  }
  const rowBindingChecksum = sha256({
    schema: 'atlas.candidate-matrix-row-crosswalk.v1',
    ordinalMapRevision,
    workspaceRevision: ordinalMap.workspaceRevision,
    rows: identities.map(({ candidateOrdinal, rowOrdinal, canonicalId, packetKey, symbolVersionId, sourceRef, sourceRevision }) => ({
      candidateOrdinal,
      rowOrdinal,
      canonicalId,
      packetKey,
      symbolVersionId,
      sourceRef,
      sourceRevision,
    })),
  });
  const identityChecksum = sha256({ ordinalMapRevision, ordinalMapChecksum: ordinalMap.ordinalMapChecksum, identities });
  const featureVocabularyChecksum = sha256(CANDIDATE_FEATURE_NAMES);
  const availableFeatureCount = Array.from(matrix.presence_mask).reduce((sum, value) => sum + value, 0);
  const unavailableFeatureCount = matrix.presence_mask.length - availableFeatureCount;
  const matrixChecksum = sha256({
    candidatePacketKeys: matrix.candidate_packet_keys,
    candidateFeatures: Array.from(matrix.candidate_features),
    presenceMask: Array.from(matrix.presence_mask),
    featureCount: matrix.feature_count,
  });
  const receiptBody = {
    schema: RETRIEVAL_CANDIDATE_FEATURE_MATRIX_RECEIPT_V1_SCHEMA,
    matrixRevision: sha256({
      featureVocabularyChecksum,
      rowBindingChecksum,
      workspaceRevision: ordinalMap.workspaceRevision,
      graphRevision: null,
      graphUnavailableReason: 'NO_GRAPH_REVISION_BOUND_TO_MATRIX_ROWS',
      representationRevision: null,
      representationUnavailableReason: 'NO_EXACT_REPRESENTATION_REVISION_BOUND_TO_MATRIX_ROWS',
    }),
    workspaceRevision: ordinalMap.workspaceRevision,
    candidateOrdinalMapRevision: ordinalMapRevision,
    candidateOrdinalMapChecksum: ordinalMap.ordinalMapChecksum,
    featureVocabularyChecksum,
    rowBindingChecksum,
    graphRevision: null,
    graphUnavailableReason: 'NO_GRAPH_REVISION_BOUND_TO_MATRIX_ROWS' as const,
    representationRevision: null,
    representationUnavailableReason: 'NO_EXACT_REPRESENTATION_REVISION_BOUND_TO_MATRIX_ROWS' as const,
    rowCount: matrix.candidate_count,
    columnCount: matrix.feature_count,
    availableFeatureCount,
    unavailableFeatureCount,
    matrixChecksum,
    producerRevision: sha256({
      owner: CANDIDATE_FEATURE_MATRIX_ADAPTER_V1_SCHEMA,
      featureRevision: first.featureRevision,
      featureVocabularyChecksum,
    }),
  };
  const receipt = retrievalCandidateFeatureMatrixReceiptV1Schema.parse({
    ...receiptBody,
    receiptChecksum: sha256(receiptBody),
  });

  return {
    schema: CANDIDATE_FEATURE_MATRIX_ADAPTER_V1_SCHEMA,
    matrix,
    ordinalMapRevision,
    ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
    featureRevision: first.featureRevision,
    identities,
    rowBindingChecksum,
    receipt,
    executorProvenance: stableExecutorProvenance(input.executorProvenance),
    matrixChecksum,
    identityChecksum,
    canonicalAuthority: false,
    writesPerformed: false,
    rankingPromotion: false,
  };
}
