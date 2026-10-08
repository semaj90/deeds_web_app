import { z } from 'zod';
import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';
import {
  assertCandidateOrdinalMapIntegrityV1,
  candidateOrdinalMapV1Schema,
  materializeRevisionQualifiedSourceChunkOrdinalMapV1,
  type CandidateOrdinalMapV1,
  type RevisionQualifiedSourceChunkCohortV1,
} from '../features/canonical-candidate-v1.js';
import {
  candidateFeatureSnapshotV1Schema,
  candidateFeatureSnapshotChecksum,
  type CandidateFeatureSnapshotV1,
} from '../features/candidate-feature-snapshot-v1.js';
import {
  buildAceResidencyAdmissionV1,
  type AceBitfrostCacheIdentityV1,
  type AceResidencyAdmissionV1,
} from '../cache/ace-bitfrost-cache-identity-v1.js';
import {
  semanticCohortAdmissionV1Schema,
  type SemanticCohortAdmissionV1,
} from '../embedding/semantic-representation-v1.js';
import {
  structuralGraphSnapshotV1Schema,
  graphOrdinalManifestV1Schema,
  type StructuralGraphSnapshotV1,
  type GraphOrdinalManifestV1,
} from '../graph/structural-graph-snapshot-v1.js';

export { semanticCohortAdmissionV1Schema } from '../embedding/semantic-representation-v1.js';
export { graphOrdinalManifestV1Schema } from '../graph/structural-graph-snapshot-v1.js';

const revision = z.string().min(1);
const checksum = z.string().regex(/^(?:sha256:)?[a-f0-9]{64}$/);

export const candidateOrdinalAdmissionV1Schema = z.object({
  schema: z.literal('atlas.candidate-ordinal-admission.v1'),
  ordinalMap: z.unknown(),
  sourceRevisionSetChecksum: checksum.nullable(),
  candidateSetChecksum: checksum.nullable(),
  status: z.enum(['ADMITTED', 'BLOCKED_LINEAGE', 'UNAVAILABLE']),
  reason: z.string().min(1).nullable(),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
}).strict().superRefine((value, ctx) => {
  if (value.status === 'ADMITTED' && value.reason !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'ADMITTED_ORDINAL_MAP_REASON_FORBIDDEN' });
  }
  if (value.status !== 'ADMITTED' && value.reason === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'BLOCKED_ORDINAL_MAP_REASON_REQUIRED' });
  }
});
export type CandidateOrdinalAdmissionV1 = z.infer<typeof candidateOrdinalAdmissionV1Schema>;

export const candidateMatrixRowBindingV1Schema = z.object({
  candidateOrdinal: z.number().int().nonnegative(), rowOrdinal: z.number().int().nonnegative(),
  canonicalId: z.string().min(1), packetKey: z.string().min(1), symbolVersionId: z.string().min(1).nullable(),
  workspaceRevision: revision, sourceRevision: revision,
}).strict();
export type CandidateMatrixRowBindingV1 = z.infer<typeof candidateMatrixRowBindingV1Schema>;

export const candidateMatrixRowCrosswalkV1Schema = z.object({
  schema: z.literal('atlas.candidate-matrix-row-crosswalk.v1'), workspaceRevision: revision,
  ordinalMapRevision: revision, ordinalMapChecksum: checksum, rowBindingChecksum: checksum,
  rowCount: z.number().int().nonnegative(), bindings: z.array(candidateMatrixRowBindingV1Schema),
  canonicalAuthority: z.literal(false), writesPerformed: z.literal(false),
}).strict().superRefine((crosswalk, ctx) => {
  if (crosswalk.rowCount !== crosswalk.bindings.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rowCount'], message: 'CROSSWALK_ROW_COUNT_MISMATCH' });
  if (crosswalk.ordinalMapRevision !== `sha256:${crosswalk.ordinalMapChecksum.replace(/^sha256:/, '')}`) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ordinalMapRevision'], message: 'CROSSWALK_ORDINAL_MAP_REVISION_MISMATCH' });
  const candidateOrdinals = new Set<number>();
  const rowOrdinals = new Set<number>();
  const canonicalIds = new Set<string>();
  crosswalk.bindings.forEach((binding, index) => {
    if (candidateOrdinals.has(binding.candidateOrdinal)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['bindings', index, 'candidateOrdinal'], message: 'CROSSWALK_UNIQUE_CANDIDATE_ORDINAL' });
    if (rowOrdinals.has(binding.rowOrdinal)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['bindings', index, 'rowOrdinal'], message: 'CROSSWALK_UNIQUE_ROW_ORDINAL' });
    if (canonicalIds.has(binding.canonicalId)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['bindings', index, 'canonicalId'], message: 'CROSSWALK_CANONICAL_ID_BOUND' });
    if (binding.candidateOrdinal !== index || binding.rowOrdinal !== index) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['bindings', index], message: 'CROSSWALK_DETERMINISTIC_ORDER_INVALID' });
    if (binding.workspaceRevision !== crosswalk.workspaceRevision) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['bindings', index, 'workspaceRevision'], message: 'CROSSWALK_REVISION_QUALIFIED' });
    candidateOrdinals.add(binding.candidateOrdinal);
    rowOrdinals.add(binding.rowOrdinal);
    canonicalIds.add(binding.canonicalId);
  });
  const payload = {
    ordinalMapRevision: crosswalk.ordinalMapRevision,
    workspaceRevision: crosswalk.workspaceRevision,
    bindings: crosswalk.bindings.map(({ candidateOrdinal, rowOrdinal, canonicalId, packetKey, symbolVersionId, sourceRevision }) => ({ candidateOrdinal, rowOrdinal, canonicalId, packetKey, symbolVersionId, sourceRevision })),
  };
  if (crosswalk.rowBindingChecksum !== canonicalSha256V1(payload)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rowBindingChecksum'], message: 'CROSSWALK_CHECKSUM_MISMATCH' });
});
export type CandidateMatrixRowCrosswalkV1 = z.infer<typeof candidateMatrixRowCrosswalkV1Schema>;

export function buildCandidateMatrixRowCrosswalkV1(input: {
  ordinalMap: CandidateOrdinalMapV1;
  matrixRowCount: number;
  matrixRowCandidateOrdinals: readonly number[];
  matrixWorkspaceRevision: string;
  matrixOrdinalMapChecksum: string;
}): CandidateMatrixRowCrosswalkV1 {
  const ordinalMap = candidateOrdinalMapV1Schema.parse(input.ordinalMap);
  assertCandidateOrdinalMapIntegrityV1(ordinalMap);
  if (input.matrixRowCount !== ordinalMap.rowCount) throw new Error('CROSSWALK_ROW_COUNT_MISMATCH');
  if (input.matrixRowCandidateOrdinals.length !== input.matrixRowCount) throw new Error('CROSSWALK_MATRIX_ROW_BINDING_COUNT_MISMATCH');
  const observedOrdinals = new Set<number>();
  input.matrixRowCandidateOrdinals.forEach((ordinal, rowOrdinal) => {
    if (!Number.isSafeInteger(ordinal) || ordinal < 0) throw new Error('CROSSWALK_MATRIX_ROW_ORDINAL_INVALID');
    if (observedOrdinals.has(ordinal)) throw new Error('CROSSWALK_MATRIX_ROW_ORDINAL_DUPLICATE');
    if (ordinalMap.candidates[rowOrdinal]?.candidateOrdinal !== ordinal) throw new Error('CROSSWALK_MATRIX_ROW_BINDING_MISMATCH');
    observedOrdinals.add(ordinal);
  });
  if (input.matrixWorkspaceRevision !== ordinalMap.workspaceRevision) throw new Error('CROSSWALK_MATRIX_REVISION_MISMATCH');
  if (input.matrixOrdinalMapChecksum !== ordinalMap.ordinalMapChecksum) throw new Error('CROSSWALK_ORDINAL_MAP_REVISION_MISMATCH');
  const ordinalMapRevision = `sha256:${ordinalMap.ordinalMapChecksum.replace(/^sha256:/, '')}`;
  const bindings = ordinalMap.candidates.map((candidate) => {
    if (!candidate.packetKey) throw new Error(`CROSSWALK_PACKET_KEY_REQUIRED:${candidate.candidateOrdinal}`);
    return {
      candidateOrdinal: candidate.candidateOrdinal,
      rowOrdinal: candidate.candidateOrdinal,
      canonicalId: candidate.canonicalId,
      packetKey: candidate.packetKey,
      symbolVersionId: candidate.symbolVersionId,
      workspaceRevision: candidate.workspaceRevision,
      sourceRevision: candidate.sourceRevision,
    };
  });
  const rowBindingPayload = {
    ordinalMapRevision,
    workspaceRevision: ordinalMap.workspaceRevision,
    bindings: bindings.map(({ candidateOrdinal, rowOrdinal, canonicalId, packetKey, symbolVersionId, sourceRevision }) => ({ candidateOrdinal, rowOrdinal, canonicalId, packetKey, symbolVersionId, sourceRevision })),
  };
  return candidateMatrixRowCrosswalkV1Schema.parse({
    schema: 'atlas.candidate-matrix-row-crosswalk.v1',
    workspaceRevision: ordinalMap.workspaceRevision,
    ordinalMapRevision,
    ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
    rowBindingChecksum: canonicalSha256V1(rowBindingPayload),
    rowCount: bindings.length,
    bindings,
    canonicalAuthority: false,
    writesPerformed: false,
  });
}

export function buildCandidateOrdinalAdmissionV1(input: {
  cohort: RevisionQualifiedSourceChunkCohortV1 | null | undefined;
  producerRevision: string;
}): CandidateOrdinalAdmissionV1 {
  if (!input.cohort) {
    return candidateOrdinalAdmissionV1Schema.parse({
      schema: 'atlas.candidate-ordinal-admission.v1', ordinalMap: null,
      sourceRevisionSetChecksum: null,
      candidateSetChecksum: null,
      status: 'BLOCKED_LINEAGE', reason: 'CURRENT_SOURCE_CHUNK_COHORT_UNAVAILABLE',
      canonicalAuthority: false, writesPerformed: false,
    });
  }
  const map = materializeRevisionQualifiedSourceChunkOrdinalMapV1({ cohort: input.cohort, producerRevision: input.producerRevision });
  return candidateOrdinalAdmissionV1Schema.parse({
    schema: 'atlas.candidate-ordinal-admission.v1', ordinalMap: map,
    sourceRevisionSetChecksum: input.cohort.sourceRevisionSetChecksum,
    candidateSetChecksum: canonicalSha256V1(map.candidates.map((candidate) => candidate.canonicalId)),
    status: 'ADMITTED', reason: null, canonicalAuthority: false, writesPerformed: false,
  });
}

/**
 * Stage 3 adapter: converts the existing candidate owner into the explicit
 * binding contract. This is pure and requires a real checksum from the
 * admitted source cohort; it never derives one from a missing/unknown value.
 */
export const semanticExecutorV1Schema = z.enum(['POSTGRES_EXACT', 'QDRANT_HNSW', 'CUVS_BRUTE_FORCE', 'CUVS_CAGRA']);
export type SemanticExecutorV1 = z.infer<typeof semanticExecutorV1Schema>;

export function buildBlockedSemanticCohortAdmissionV1(input: { status?: 'BLOCKED_LINEAGE' | 'BLOCKED_REPRESENTATION' | 'UNAVAILABLE'; rowCount?: number }): SemanticCohortAdmissionV1 {
  void input;
  throw new Error('SEMANTIC_COHORT_UNAVAILABLE');
}

export function selectSemanticExecutorV1(input: { candidateCount: number; exactCandidateLimit: number; available: readonly SemanticExecutorV1[] }): SemanticExecutorV1 | null {
  if (!Number.isInteger(input.candidateCount) || input.candidateCount < 0 || !Number.isInteger(input.exactCandidateLimit) || input.exactCandidateLimit < 1) return null;
  if (input.candidateCount <= input.exactCandidateLimit && input.available.includes('POSTGRES_EXACT')) return 'POSTGRES_EXACT';
  return input.available.find((executor) => executor !== 'POSTGRES_EXACT') ?? null;
}

export const graphSnapshotV1Schema = structuralGraphSnapshotV1Schema;
export type GraphSnapshotV1 = StructuralGraphSnapshotV1;
export type { GraphOrdinalManifestV1 };

export const structuralFeatureVectorV1Schema = z.object({
  schema: z.literal('atlas.structural-feature-vector.v1'), canonicalId: z.string().min(1),
  workspaceRevision: revision, sourceRevision: revision, graphRevision: revision,
  inDegree: z.number().nonnegative().nullable(), outDegree: z.number().nonnegative().nullable(),
  pageRank: z.number().finite().nullable(), hitsAuthority: z.number().finite().nullable(),
  hitsHub: z.number().finite().nullable(), communityId: z.number().int().nonnegative().nullable(),
  bridgeScore: z.number().finite().nullable(), persistentH1Ref: z.string().min(1).nullable(),
  topologyCoordinate4: z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()]).nullable(),
  evidenceRefs: z.array(z.string().min(1)), provider: z.enum(['NETWORKX', 'CUGRAPH', 'NEO4J']),
  canonicalAuthority: z.literal(false),
}).strict();
export type StructuralFeatureVectorV1 = z.infer<typeof structuralFeatureVectorV1Schema>;

export interface StructuralFeatureProviderV1 {
  readonly provider: StructuralFeatureVectorV1['provider'];
  compute(input: { canonicalIds: readonly string[]; snapshot: GraphSnapshotV1; ordinalManifest: GraphOrdinalManifestV1 }): Promise<readonly StructuralFeatureVectorV1[]>;
}

export type NetworkXStructuralFeatureProviderV1 = StructuralFeatureProviderV1 & { readonly provider: 'NETWORKX' };
export type CuGraphStructuralFeatureProviderV1 = StructuralFeatureProviderV1 & { readonly provider: 'CUGRAPH' };
export type Neo4jStructuralFeatureProviderV1 = StructuralFeatureProviderV1 & { readonly provider: 'NEO4J' };

export const derivedRepresentationPlanV1Schema = z.object({
  schema: z.literal('atlas.derived-representation-plan.v1'), inputRepresentation: z.literal('semantic_768'),
  inputRepresentationRevision: revision, transform: z.enum(['PCA', 'SVD', 'RANDOM_PROJECTION', 'LEARNED']),
  transformRevision: revision, transformChecksum: checksum,
  outputRepresentation: z.enum(['latent_256', 'latent_128', 'latent_64']), dimensions: z.number().int().positive(),
  canonicalAuthority: z.literal(false), writesPerformed: z.literal(false),
}).strict();
export type DerivedRepresentationPlanV1 = z.infer<typeof derivedRepresentationPlanV1Schema>;

export const CANDIDATE_FEATURE_NAMES_V1 = [
  'semantic_score', 'lexical_score', 'bfs_depth', 'global_pagerank',
  'personalized_pagerank', 'leiden_community', 'domain_score', 'error_signal',
  'smoke_signal', 'hyper_fact_hits', 'relational_chain_score',
] as const;

export const candidateFeatureSchemaChecksumV1 = (featureNames: readonly string[] = CANDIDATE_FEATURE_NAMES_V1): string =>
  canonicalSha256V1(featureNames);

export function candidateFeatureMatrixRevisionV1(input: {
  featureSchemaChecksum: string;
  rowBindingChecksum: string;
  workspaceRevision: string;
  graphRevision: string | null;
  graphRevisionUnavailableReason: string | null;
  representationRevision: string | null;
  representationRevisionUnavailableReason: string | null;
  candidateSetChecksum: string;
  candidateOrdinalMapChecksum: string;
  payloadChecksum: string;
}): string {
  return canonicalSha256V1({
    featureSchemaChecksum: input.featureSchemaChecksum,
    rowBindingChecksum: input.rowBindingChecksum,
    workspaceRevision: input.workspaceRevision,
    graphRevision: input.graphRevision,
    graphRevisionUnavailableReason: input.graphRevisionUnavailableReason,
    representationRevision: input.representationRevision,
    representationRevisionUnavailableReason: input.representationRevisionUnavailableReason,
    candidateSetChecksum: input.candidateSetChecksum,
    candidateOrdinalMapChecksum: input.candidateOrdinalMapChecksum,
    payloadChecksum: input.payloadChecksum,
  });
}

export const candidateFeatureMatrixV1Schema = z.object({
  schema: z.literal('atlas.candidate-feature-matrix.v1'), requestId: z.string().min(1),
  workspaceRevision: revision, sourceRevisionSetChecksum: checksum,
  representationRevision: revision.nullable(), representationRevisionUnavailableReason: z.string().min(1).nullable(),
  featureRevision: revision, graphRevision: revision.nullable(), graphRevisionUnavailableReason: z.string().min(1).nullable(),
  candidateSetChecksum: checksum, candidateOrdinalMapChecksum: checksum,
  rowBindingChecksum: checksum, matrixRevision: checksum,
  rows: z.number().int().nonnegative(), cols: z.number().int().nonnegative(),
  featureNames: z.array(z.enum(CANDIDATE_FEATURE_NAMES_V1)).length(CANDIDATE_FEATURE_NAMES_V1.length),
  dtype: z.enum(['float32', 'float64']),
  featureSchemaChecksum: checksum, payloadChecksum: checksum,
  availableFeatureMask: z.array(z.boolean()), missingFeatureReasons: z.record(z.string(), z.string()),
  canonicalAuthority: z.literal(false), writesPerformed: z.literal(false),
}).strict().superRefine((matrix, ctx) => {
  if (matrix.cols !== matrix.featureNames.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cols'], message: 'FEATURE_COLUMN_COUNT_MISMATCH' });
  if (new Set(matrix.featureNames).size !== matrix.featureNames.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['featureNames'], message: 'DUPLICATE_FEATURE_NAME' });
  if (matrix.featureNames.some((name, index) => name !== CANDIDATE_FEATURE_NAMES_V1[index])) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['featureNames'], message: 'FEATURE_ORDER_MISMATCH' });
  if (matrix.featureSchemaChecksum !== candidateFeatureSchemaChecksumV1(matrix.featureNames)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['featureSchemaChecksum'], message: 'FEATURE_SCHEMA_CHECKSUM_MISMATCH' });
  const expectedMatrixRevision = candidateFeatureMatrixRevisionV1({
    featureSchemaChecksum: matrix.featureSchemaChecksum,
    rowBindingChecksum: matrix.rowBindingChecksum,
    workspaceRevision: matrix.workspaceRevision,
    graphRevision: matrix.graphRevision ?? null,
    graphRevisionUnavailableReason: matrix.graphRevisionUnavailableReason ?? null,
    representationRevision: matrix.representationRevision ?? null,
    representationRevisionUnavailableReason: matrix.representationRevisionUnavailableReason ?? null,
    candidateSetChecksum: matrix.candidateSetChecksum,
    candidateOrdinalMapChecksum: matrix.candidateOrdinalMapChecksum,
    payloadChecksum: matrix.payloadChecksum,
  });
  if (matrix.matrixRevision !== expectedMatrixRevision) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['matrixRevision'], message: 'MATRIX_REVISION_MISMATCH' });
  if (matrix.availableFeatureMask.length !== matrix.featureNames.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['availableFeatureMask'], message: 'FEATURE_MASK_LENGTH_MISMATCH' });
  matrix.featureNames.forEach((name, index) => {
    if (matrix.availableFeatureMask[index] === false && !matrix.missingFeatureReasons[name]) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['missingFeatureReasons', name], message: 'UNAVAILABLE_FEATURE_REASON_REQUIRED' });
  });
  if ((matrix.graphRevision === null) !== (matrix.graphRevisionUnavailableReason !== null)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['graphRevisionUnavailableReason'], message: 'GRAPH_REVISION_REASON_MISMATCH' });
  if ((matrix.representationRevision === null) !== (matrix.representationRevisionUnavailableReason !== null)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['representationRevisionUnavailableReason'], message: 'REPRESENTATION_REVISION_REASON_MISMATCH' });
});
export type CandidateFeatureMatrixV1 = z.infer<typeof candidateFeatureMatrixV1Schema>;

export const candidateFeatureMatrixReceiptV1Schema = z.object({
  schema: z.literal('atlas.candidate-feature-matrix-receipt.v1'),
  matrixRevision: checksum, workspaceRevision: revision,
  candidateOrdinalMapRevision: revision, candidateOrdinalMapChecksum: checksum,
  featureVocabularyChecksum: checksum, rowBindingChecksum: checksum,
  graphRevision: revision.nullable(), graphUnavailableReason: z.string().min(1).nullable(),
  representationRevision: revision.nullable(), representationUnavailableReason: z.string().min(1).nullable(),
  rowCount: z.number().int().nonnegative(), columnCount: z.literal(CANDIDATE_FEATURE_NAMES_V1.length),
  availableFeatureCount: z.number().int().nonnegative(), unavailableFeatureCount: z.number().int().nonnegative(),
  matrixChecksum: checksum, producerRevision: revision,
  canonicalAuthority: z.literal(false), writesPerformed: z.literal(false),
}).strict().superRefine((receipt, ctx) => {
  if (receipt.availableFeatureCount + receipt.unavailableFeatureCount !== receipt.columnCount) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['unavailableFeatureCount'], message: 'FEATURE_AVAILABILITY_COUNT_MISMATCH' });
  if ((receipt.graphRevision === null) !== (receipt.graphUnavailableReason !== null)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['graphUnavailableReason'], message: 'GRAPH_REVISION_REASON_MISMATCH' });
  if ((receipt.representationRevision === null) !== (receipt.representationUnavailableReason !== null)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['representationUnavailableReason'], message: 'REPRESENTATION_REVISION_REASON_MISMATCH' });
});
export type CandidateFeatureMatrixReceiptV1 = z.infer<typeof candidateFeatureMatrixReceiptV1Schema>;

const candidateFeatureValueFieldsV1 = {
  value: z.number().finite().nullable(),
  available: z.boolean(),
  reason: z.string().min(1).nullable(),
};

function validateCandidateFeatureValueV1(value: CandidateFeatureValueV1, ctx: z.RefinementCtx) {
  if (value.available && value.value === null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'AVAILABLE_FEATURE_VALUE_REQUIRED' });
  if (value.available && value.reason !== null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'AVAILABLE_FEATURE_REASON_MUST_BE_NULL' });
  if (!value.available && value.reason === null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'UNAVAILABLE_FEATURE_REASON_REQUIRED' });
  if (!value.available && value.value !== null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'UNAVAILABLE_FEATURE_VALUE_MUST_BE_NULL' });
}

export const candidateFeatureValueV1Schema = z.object(candidateFeatureValueFieldsV1).strict().superRefine(validateCandidateFeatureValueV1);
export type CandidateFeatureValueV1 = z.infer<typeof candidateFeatureValueV1Schema>;

export const candidateFeatureCellV1Schema = z.object({
  candidateOrdinal: z.number().int().nonnegative(),
  rowOrdinal: z.number().int().nonnegative(),
  featureName: z.enum(CANDIDATE_FEATURE_NAMES_V1),
  ...candidateFeatureValueFieldsV1,
}).strict().superRefine((cell, ctx) => validateCandidateFeatureValueV1(cell, ctx));
export type CandidateFeatureCellV1 = z.infer<typeof candidateFeatureCellV1Schema>;

export const candidateFeatureSignalRowV1Schema = z.object({
  candidateOrdinal: z.number().int().nonnegative(),
  canonicalId: z.string().min(1),
  packetKey: z.string().min(1),
  symbolVersionId: z.string().min(1).nullable(),
  workspaceRevision: revision,
  sourceRevision: revision,
  features: z.record(z.string(), candidateFeatureValueV1Schema),
}).strict().superRefine((row, ctx) => {
  const featureNames = Object.keys(row.features).sort();
  const expectedFeatureNames = [...CANDIDATE_FEATURE_NAMES_V1].sort();
  if (canonicalSha256V1(featureNames) !== canonicalSha256V1(expectedFeatureNames)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['features'], message: 'FEATURE_ROW_VOCABULARY_MISMATCH' });
  }
});
export type CandidateFeatureSignalRowV1 = z.infer<typeof candidateFeatureSignalRowV1Schema>;

export function buildCandidateFeatureCellsV1(input: {
  crosswalk: CandidateMatrixRowCrosswalkV1;
  rows: readonly CandidateFeatureSignalRowV1[];
}): CandidateFeatureCellV1[] {
  const crosswalk = candidateMatrixRowCrosswalkV1Schema.parse(input.crosswalk);
  const rows = input.rows.map((row) => candidateFeatureSignalRowV1Schema.parse(row));
  if (rows.length !== crosswalk.rowCount) throw new Error('FEATURE_ROW_COUNT_MISMATCH');

  const rowsByOrdinal = new Map<number, CandidateFeatureSignalRowV1>();
  for (const row of rows) {
    if (rowsByOrdinal.has(row.candidateOrdinal)) throw new Error('FEATURE_ROW_DUPLICATE_CANDIDATE_ORDINAL');
    rowsByOrdinal.set(row.candidateOrdinal, row);
  }

  return crosswalk.bindings.flatMap((binding) => {
    const row = rowsByOrdinal.get(binding.candidateOrdinal);
    if (!row) throw new Error('FEATURE_ROW_MISSING_CANDIDATE_ORDINAL');
    if (
      row.canonicalId !== binding.canonicalId
      || row.packetKey !== binding.packetKey
      || row.symbolVersionId !== binding.symbolVersionId
      || row.workspaceRevision !== binding.workspaceRevision
      || row.sourceRevision !== binding.sourceRevision
    ) throw new Error('FEATURE_ROW_IDENTITY_REVISION_MISMATCH');

    return CANDIDATE_FEATURE_NAMES_V1.map((featureName) => ({
      candidateOrdinal: binding.candidateOrdinal,
      rowOrdinal: binding.rowOrdinal,
      featureName,
      ...row.features[featureName],
    }));
  });
}

export const candidateFeatureMatrixArtifactV1Schema = z.object({
  schema: z.literal('atlas.candidate-feature-matrix-artifact.v1'),
  matrix: candidateFeatureMatrixV1Schema,
  crosswalk: candidateMatrixRowCrosswalkV1Schema,
  cells: z.array(candidateFeatureCellV1Schema),
  receipt: candidateFeatureMatrixReceiptV1Schema,
}).strict().superRefine((artifact, ctx) => {
  const { matrix, crosswalk, cells, receipt } = artifact;
  if (matrix.rows !== crosswalk.rowCount || matrix.rows !== receipt.rowCount) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['matrix', 'rows'], message: 'ARTIFACT_ROW_COUNT_MISMATCH' });
  if (matrix.workspaceRevision !== crosswalk.workspaceRevision || matrix.workspaceRevision !== receipt.workspaceRevision) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['matrix', 'workspaceRevision'], message: 'ARTIFACT_WORKSPACE_REVISION_MISMATCH' });
  if (matrix.candidateOrdinalMapChecksum !== crosswalk.ordinalMapChecksum || matrix.candidateOrdinalMapChecksum !== receipt.candidateOrdinalMapChecksum) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['matrix', 'candidateOrdinalMapChecksum'], message: 'ARTIFACT_ORDINAL_MAP_CHECKSUM_MISMATCH' });
  if (matrix.candidateSetChecksum !== canonicalSha256V1(crosswalk.bindings.map((binding) => binding.canonicalId))) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['matrix', 'candidateSetChecksum'], message: 'ARTIFACT_CANDIDATE_SET_CHECKSUM_MISMATCH' });
  if (matrix.sourceRevisionSetChecksum !== canonicalSha256V1(crosswalk.bindings.map(({ canonicalId, sourceRevision }) => ({ canonicalId, sourceRevision })))) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['matrix', 'sourceRevisionSetChecksum'], message: 'ARTIFACT_SOURCE_REVISION_SET_CHECKSUM_MISMATCH' });
  if (matrix.rowBindingChecksum !== crosswalk.rowBindingChecksum || matrix.rowBindingChecksum !== receipt.rowBindingChecksum) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['matrix', 'rowBindingChecksum'], message: 'ARTIFACT_ROW_BINDING_CHECKSUM_MISMATCH' });
  if (receipt.candidateOrdinalMapRevision !== crosswalk.ordinalMapRevision) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['receipt', 'candidateOrdinalMapRevision'], message: 'ARTIFACT_ORDINAL_MAP_REVISION_MISMATCH' });
  if (receipt.candidateOrdinalMapChecksum !== crosswalk.ordinalMapChecksum) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['receipt', 'candidateOrdinalMapChecksum'], message: 'ARTIFACT_RECEIPT_ORDINAL_MAP_CHECKSUM_MISMATCH' });
  if (receipt.graphRevision !== matrix.graphRevision || receipt.graphUnavailableReason !== matrix.graphRevisionUnavailableReason) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['receipt', 'graphRevision'], message: 'ARTIFACT_GRAPH_REVISION_MISMATCH' });
  if (receipt.representationRevision !== matrix.representationRevision || receipt.representationUnavailableReason !== matrix.representationRevisionUnavailableReason) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['receipt', 'representationRevision'], message: 'ARTIFACT_REPRESENTATION_REVISION_MISMATCH' });
  if (receipt.columnCount !== matrix.cols || receipt.availableFeatureCount !== matrix.availableFeatureMask.filter(Boolean).length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['receipt', 'columnCount'], message: 'ARTIFACT_FEATURE_AVAILABILITY_MISMATCH' });
  if (cells.length !== matrix.rows * matrix.cols) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cells'], message: 'ARTIFACT_CELL_COUNT_MISMATCH' });
  cells.forEach((cell, index) => {
    const expectedRowOrdinal = Math.floor(index / matrix.cols);
    const expectedColumn = index % matrix.cols;
    const expectedBinding = crosswalk.bindings[expectedRowOrdinal];
    if (!expectedBinding || cell.rowOrdinal !== expectedRowOrdinal || cell.candidateOrdinal !== expectedBinding.candidateOrdinal) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cells', index], message: 'ARTIFACT_CELL_ROW_BINDING_MISMATCH' });
    }
    if (cell.featureName !== matrix.featureNames[expectedColumn]) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cells', index, 'featureName'], message: 'ARTIFACT_CELL_FEATURE_ORDER_MISMATCH' });
    }
  });
  if (matrix.payloadChecksum !== canonicalSha256V1(cells)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['matrix', 'payloadChecksum'], message: 'ARTIFACT_PAYLOAD_CHECKSUM_MISMATCH' });
  matrix.availableFeatureMask.forEach((available, column) => {
    const hasAvailableCell = cells.some((cell, index) => index % matrix.cols === column && cell.available);
    if (!available && hasAvailableCell) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cells'], message: 'UNAVAILABLE_FEATURE_CELL_MARKED_AVAILABLE' });
    if (available && !hasAvailableCell) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cells'], message: 'AVAILABLE_FEATURE_HAS_NO_AVAILABLE_CELLS' });
  });
  if (receipt.matrixChecksum !== canonicalSha256V1({ matrix, crosswalk, cells })) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['receipt', 'matrixChecksum'], message: 'ARTIFACT_MATRIX_CHECKSUM_MISMATCH' });
  if (matrix.matrixRevision !== receipt.matrixRevision || matrix.featureSchemaChecksum !== receipt.featureVocabularyChecksum) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['receipt'], message: 'ARTIFACT_RECEIPT_IDENTITY_MISMATCH' });
});
export type CandidateFeatureMatrixArtifactV1 = z.infer<typeof candidateFeatureMatrixArtifactV1Schema>;

export function buildCandidateFeatureMatrixReceiptV1(input: {
  matrix: CandidateFeatureMatrixV1;
  crosswalk: CandidateMatrixRowCrosswalkV1;
  cells: readonly CandidateFeatureCellV1[];
  producerRevision: string;
}): CandidateFeatureMatrixReceiptV1 {
  const matrix = candidateFeatureMatrixV1Schema.parse(input.matrix);
  const crosswalk = candidateMatrixRowCrosswalkV1Schema.parse(input.crosswalk);
  const cells = input.cells.map((cell) => candidateFeatureCellV1Schema.parse(cell));
  if (matrix.rows !== crosswalk.rowCount) throw new Error('MATRIX_RECEIPT_ROW_COUNT_MISMATCH');
  if (cells.length !== matrix.rows * matrix.cols) throw new Error('MATRIX_RECEIPT_CELL_COUNT_MISMATCH');
  cells.forEach((cell, index) => {
    const expectedRowOrdinal = Math.floor(index / matrix.cols);
    const expectedBinding = crosswalk.bindings[expectedRowOrdinal];
    if (!expectedBinding || cell.rowOrdinal !== expectedRowOrdinal || cell.candidateOrdinal !== expectedBinding.candidateOrdinal) {
      throw new Error('ARTIFACT_CELL_ROW_BINDING_MISMATCH');
    }
    if (cell.featureName !== matrix.featureNames[index % matrix.cols]) {
      throw new Error('ARTIFACT_CELL_FEATURE_ORDER_MISMATCH');
    }
  });
  if (matrix.workspaceRevision !== crosswalk.workspaceRevision) throw new Error('MATRIX_RECEIPT_WORKSPACE_REVISION_MISMATCH');
  if (matrix.candidateOrdinalMapChecksum !== crosswalk.ordinalMapChecksum) throw new Error('MATRIX_RECEIPT_ORDINAL_MAP_CHECKSUM_MISMATCH');
  if (matrix.candidateSetChecksum !== canonicalSha256V1(crosswalk.bindings.map((binding) => binding.canonicalId))) throw new Error('MATRIX_RECEIPT_CANDIDATE_SET_CHECKSUM_MISMATCH');
  if (matrix.rowBindingChecksum !== crosswalk.rowBindingChecksum) throw new Error('MATRIX_RECEIPT_ROW_BINDING_CHECKSUM_MISMATCH');
  if (matrix.payloadChecksum !== canonicalSha256V1(cells)) throw new Error('MATRIX_RECEIPT_PAYLOAD_CHECKSUM_MISMATCH');
  matrix.availableFeatureMask.forEach((available, column) => {
    if (!available && cells.some((cell, index) => index % matrix.cols === column && cell.available)) throw new Error('UNAVAILABLE_FEATURE_CELL_MARKED_AVAILABLE');
  });
  const availableFeatureCount = matrix.availableFeatureMask.filter(Boolean).length;
  const matrixChecksum = canonicalSha256V1({ matrix, crosswalk, cells });
  return candidateFeatureMatrixReceiptV1Schema.parse({
    schema: 'atlas.candidate-feature-matrix-receipt.v1',
    matrixRevision: matrix.matrixRevision,
    workspaceRevision: matrix.workspaceRevision,
    candidateOrdinalMapRevision: crosswalk.ordinalMapRevision,
    candidateOrdinalMapChecksum: matrix.candidateOrdinalMapChecksum,
    featureVocabularyChecksum: matrix.featureSchemaChecksum,
    rowBindingChecksum: matrix.rowBindingChecksum,
    graphRevision: matrix.graphRevision,
    graphUnavailableReason: matrix.graphRevisionUnavailableReason,
    representationRevision: matrix.representationRevision,
    representationUnavailableReason: matrix.representationRevisionUnavailableReason,
    rowCount: matrix.rows,
    columnCount: matrix.cols,
    availableFeatureCount,
    unavailableFeatureCount: matrix.cols - availableFeatureCount,
    matrixChecksum,
    producerRevision: input.producerRevision,
    canonicalAuthority: false,
    writesPerformed: false,
  });
}

export function buildCandidateFeatureMatrixArtifactV1(input: {
  matrix: CandidateFeatureMatrixV1;
  crosswalk: CandidateMatrixRowCrosswalkV1;
  cells: readonly CandidateFeatureCellV1[];
  producerRevision: string;
}): CandidateFeatureMatrixArtifactV1 {
  const matrix = candidateFeatureMatrixV1Schema.parse(input.matrix);
  const crosswalk = candidateMatrixRowCrosswalkV1Schema.parse(input.crosswalk);
  const cells = input.cells.map((cell) => candidateFeatureCellV1Schema.parse(cell));
  const receipt = buildCandidateFeatureMatrixReceiptV1({ matrix, crosswalk, cells, producerRevision: input.producerRevision });
  return candidateFeatureMatrixArtifactV1Schema.parse({ schema: 'atlas.candidate-feature-matrix-artifact.v1', matrix, crosswalk, cells, receipt });
}

export function serializeCandidateFeatureMatrixArtifactV1(input: CandidateFeatureMatrixArtifactV1): string {
  return JSON.stringify(candidateFeatureMatrixArtifactV1Schema.parse(input));
}

export function readbackCandidateFeatureMatrixArtifactV1(serialized: string): CandidateFeatureMatrixArtifactV1 {
  const decoded: unknown = JSON.parse(serialized);
  return candidateFeatureMatrixArtifactV1Schema.parse(decoded);
}

export function produceCandidateFeatureMatrixFromSnapshotV1(input: {
  requestId: string;
  ordinalMap: CandidateOrdinalMapV1;
  snapshot: CandidateFeatureSnapshotV1;
  producerRevision: string;
}): CandidateFeatureMatrixArtifactV1 {
  const ordinalMap = candidateOrdinalMapV1Schema.parse(input.ordinalMap);
  assertCandidateOrdinalMapIntegrityV1(ordinalMap);
  const snapshot = candidateFeatureSnapshotV1Schema.parse(input.snapshot);
  if (snapshot.ordinalMapChecksum !== ordinalMap.ordinalMapChecksum
    || snapshot.candidateSnapshotRevision !== ordinalMap.candidateSnapshotRevision
    || snapshot.workspaceRevision !== ordinalMap.workspaceRevision
    || snapshot.rowCount !== ordinalMap.rowCount) {
    throw new Error('CFM_SOURCE_SNAPSHOT_ORDINAL_MAP_MISMATCH');
  }
  const snapshotPayload = {
    candidateSnapshotRevision: snapshot.candidateSnapshotRevision,
    ordinalMapChecksum: snapshot.ordinalMapChecksum,
    workspaceRevision: snapshot.workspaceRevision,
    featureRevision: snapshot.featureRevision,
    rows: snapshot.rows,
  };
  if (candidateFeatureSnapshotChecksum(snapshotPayload) !== snapshot.snapshotChecksum) {
    throw new Error('CFM_SOURCE_SNAPSHOT_CHECKSUM_MISMATCH');
  }

  const crosswalk = buildCandidateMatrixRowCrosswalkV1({
    ordinalMap,
    matrixRowCount: snapshot.rowCount,
    matrixRowCandidateOrdinals: snapshot.rows.map((row) => row.candidateOrdinal),
    matrixWorkspaceRevision: snapshot.workspaceRevision,
    matrixOrdinalMapChecksum: snapshot.ordinalMapChecksum,
  });
  const unavailableReasons: Record<string, string> = {
    semantic_score: 'SEMANTIC_COHORT_ADMISSION_NOT_SUPPLIED',
    bfs_depth: 'NO_ADMITTED_STRUCTURAL_GRAPH',
    global_pagerank: 'NO_ADMITTED_STRUCTURAL_GRAPH',
    personalized_pagerank: 'NO_ADMITTED_STRUCTURAL_GRAPH',
    leiden_community: 'NO_ADMITTED_STRUCTURAL_GRAPH',
    error_signal: 'NO_QUALIFIED_ERROR_SIGNAL',
    smoke_signal: 'NO_VALIDATOR_RECEIPT',
    hyper_fact_hits: 'HYPERRAG_NOT_ADMITTED',
    relational_chain_score: 'HYPERRAG_NOT_ADMITTED',
  };
  const signalRows: CandidateFeatureSignalRowV1[] = snapshot.rows.map((row) => {
    const candidate = ordinalMap.candidates[row.candidateOrdinal];
    if (!candidate || candidate.canonicalId !== row.canonicalId
      || !candidate.packetKey || candidate.packetKey !== row.packetKey
      || candidate.symbolVersionId !== row.symbolVersionId
      || candidate.sourceRevision !== row.sourceRevision
      || candidate.workspaceRevision !== row.workspaceRevision) {
      throw new Error(`CFM_SOURCE_ROW_IDENTITY_MISMATCH:${row.candidateOrdinal}`);
    }
    const lexicalAvailable = row.laneMask.includes('lexical') && row.lexicalRelevance !== null;
    const domainAvailable = row.laneMask.includes('domain') && row.domainAffinity !== null;
    const features: CandidateFeatureSignalRowV1['features'] = {
      semantic_score: { value: null, available: false, reason: unavailableReasons.semantic_score! },
      lexical_score: lexicalAvailable
        ? { value: row.lexicalRelevance, available: true, reason: null }
        : { value: null, available: false, reason: 'NO_QUALIFIED_LEXICAL_SIGNAL' },
      bfs_depth: { value: null, available: false, reason: unavailableReasons.bfs_depth! },
      global_pagerank: { value: null, available: false, reason: unavailableReasons.global_pagerank! },
      personalized_pagerank: { value: null, available: false, reason: unavailableReasons.personalized_pagerank! },
      leiden_community: { value: null, available: false, reason: unavailableReasons.leiden_community! },
      domain_score: domainAvailable
        ? { value: row.domainAffinity, available: true, reason: null }
        : { value: null, available: false, reason: 'NO_QUALIFIED_DOMAIN_SIGNAL' },
      error_signal: { value: null, available: false, reason: unavailableReasons.error_signal! },
      smoke_signal: { value: null, available: false, reason: unavailableReasons.smoke_signal! },
      hyper_fact_hits: { value: null, available: false, reason: unavailableReasons.hyper_fact_hits! },
      relational_chain_score: { value: null, available: false, reason: unavailableReasons.relational_chain_score! },
    };
    return {
      candidateOrdinal: row.candidateOrdinal,
      canonicalId: row.canonicalId,
      packetKey: row.packetKey,
      symbolVersionId: row.symbolVersionId,
      workspaceRevision: row.workspaceRevision,
      sourceRevision: row.sourceRevision,
      features,
    };
  });
  const cells = buildCandidateFeatureCellsV1({ crosswalk, rows: signalRows });
  const sourceRevisionSetChecksum = canonicalSha256V1(ordinalMap.candidates
    .map(({ canonicalId, sourceRevision }) => ({ canonicalId, sourceRevision })));
  const availableFeatureMask = CANDIDATE_FEATURE_NAMES_V1.map((name) =>
    cells.some((cell) => cell.featureName === name && cell.available));
  const missingFeatureReasons = Object.fromEntries(CANDIDATE_FEATURE_NAMES_V1.flatMap((name) => {
    if (availableFeatureMask[CANDIDATE_FEATURE_NAMES_V1.indexOf(name)]) return [];
    const reasons = [...new Set(cells.filter((cell) => cell.featureName === name).map((cell) => cell.reason))];
    return [[name, reasons.join('|') || 'NO_QUALIFIED_SIGNAL']];
  }));
  const matrixBase = {
    schema: 'atlas.candidate-feature-matrix.v1' as const,
    requestId: input.requestId,
    workspaceRevision: snapshot.workspaceRevision,
    sourceRevisionSetChecksum,
    representationRevision: null,
    representationRevisionUnavailableReason: 'SEMANTIC_COHORT_ADMISSION_NOT_SUPPLIED',
    featureRevision: snapshot.featureRevision,
    graphRevision: null,
    graphRevisionUnavailableReason: 'NO_ADMITTED_STRUCTURAL_GRAPH',
    candidateSetChecksum: canonicalSha256V1(ordinalMap.candidates.map((candidate) => candidate.canonicalId)),
    candidateOrdinalMapChecksum: ordinalMap.ordinalMapChecksum,
    rowBindingChecksum: crosswalk.rowBindingChecksum,
    rows: snapshot.rowCount,
    cols: CANDIDATE_FEATURE_NAMES_V1.length,
    featureNames: [...CANDIDATE_FEATURE_NAMES_V1],
    dtype: 'float32' as const,
    featureSchemaChecksum: candidateFeatureSchemaChecksumV1(),
    payloadChecksum: canonicalSha256V1(cells),
    availableFeatureMask,
    missingFeatureReasons,
    canonicalAuthority: false as const,
    writesPerformed: false as const,
  };
  const matrix = candidateFeatureMatrixV1Schema.parse({
    ...matrixBase,
    matrixRevision: candidateFeatureMatrixRevisionV1(matrixBase),
  });
  const artifact = buildCandidateFeatureMatrixArtifactV1({ matrix, crosswalk, cells, producerRevision: input.producerRevision });
  const readback = readbackCandidateFeatureMatrixArtifactV1(serializeCandidateFeatureMatrixArtifactV1(artifact));
  if (readback.receipt.matrixChecksum !== artifact.receipt.matrixChecksum) throw new Error('CFM_SERIALIZE_READBACK_CHECKSUM_MISMATCH');
  return readback;
}

export interface CandidateFeatureMatrixAdapterV1<T> {
  readonly format: 'ARROW' | 'CUDF' | 'PYTORCH' | 'XGBOOST';
  encode(matrix: CandidateFeatureMatrixV1, cells: readonly CandidateFeatureCellV1[]): T;
}

export const aceAdmissionV1Schema = z.object({
  schema: z.literal('atlas.ace-admission.v1'), identity: z.unknown(), descriptorChecksum: checksum.nullable(),
  utilityScore: z.number().finite().nullable(), decision: z.enum(['ADMIT', 'DEFER', 'REJECT']),
  policyRevision: revision, residency: z.unknown(), canonicalAuthority: z.literal(false), writesPerformed: z.literal(false),
}).strict();
export type AceAdmissionV1 = z.infer<typeof aceAdmissionV1Schema>;

export const bitFrostResidencyPlanV1Schema = z.object({
  schema: z.literal('atlas.bitfrost-residency-plan.v1'), descriptorChecksum: checksum.nullable(),
  sourceTier: z.enum(['NVME', 'MMAP', 'CPU', 'PINNED', 'GPU']), targetTier: z.enum(['NVME', 'MMAP', 'CPU', 'PINNED', 'GPU']),
  policyRevision: revision, canonicalAuthority: z.literal(false), writesPerformed: z.literal(false),
}).strict();
export type BitFrostResidencyPlanSchemaV1 = z.infer<typeof bitFrostResidencyPlanV1Schema>;

export function buildAceAdmissionV1(input: {
  identity: AceBitfrostCacheIdentityV1 | null;
  utilityScore: number | null;
  decision: 'ADMIT' | 'DEFER' | 'REJECT';
  policyRevision: string;
}): AceAdmissionV1 {
  if (!input.identity) {
    return aceAdmissionV1Schema.parse({
      schema: 'atlas.ace-admission.v1', identity: null,
      descriptorChecksum: null, utilityScore: input.utilityScore,
      decision: 'REJECT', policyRevision: input.policyRevision, residency: null,
      canonicalAuthority: false, writesPerformed: false,
    });
  }
  const residency = buildAceResidencyAdmissionV1({ identity: input.identity, status: input.decision === 'ADMIT' ? 'ADMITTED' : 'BLOCKED_IDENTITY', reason: input.decision === 'ADMIT' ? null : `ACE_DECISION_${input.decision}` });
  return aceAdmissionV1Schema.parse({
    schema: 'atlas.ace-admission.v1', identity: input.identity,
    descriptorChecksum: canonicalSha256V1(input.identity), utilityScore: input.utilityScore,
    decision: input.decision, policyRevision: input.policyRevision, residency,
    canonicalAuthority: false, writesPerformed: false,
  });
}

export type BitFrostResidencyTier = 'NVME' | 'MMAP' | 'CPU' | 'PINNED' | 'GPU';
export interface BitFrostResidencyPlanV1 { descriptorChecksum: string | null; sourceTier: BitFrostResidencyTier; targetTier: BitFrostResidencyTier; policyRevision: string; canonicalAuthority: false; writesPerformed: false; }

/** TODO PA STAGE 03-09: live current cohort, graph edge closure, semantic admission, and GPU parity remain promotion blockers. */
export function buildBlockedBitFrostResidencyPlanV1(input: { policyRevision: string; descriptorChecksum?: string }): BitFrostResidencyPlanV1 {
  return { descriptorChecksum: input.descriptorChecksum ?? null, sourceTier: 'CPU', targetTier: 'CPU', policyRevision: input.policyRevision, canonicalAuthority: false, writesPerformed: false };
}

/** Stage 10: classifier output and lookup policy are evidence, never identity. */
export const domainClassificationEvidenceV1Schema = z.object({
  schema: z.literal('atlas.domain-classification-evidence.v1'), packetKey: z.string().min(1),
  sourceRef: z.string().min(1), workspaceRevision: revision, sourceRevision: revision,
  contentDigest: checksum, predictedDomain: z.string().min(1), confidence: z.number().min(0).max(1),
  classifierFamily: z.enum(['NAIVE_BAYES', 'LOGISTIC_REGRESSION', 'PYTORCH']), classifierRevision: revision,
  featureRevision: revision, checkpointChecksum: checksum, evidenceChecksum: checksum,
  canonicalAuthority: z.literal(false), writesPerformed: z.literal(false),
}).strict();
export type DomainClassificationEvidenceV1 = z.infer<typeof domainClassificationEvidenceV1Schema>;

export const featurePolicyLutEntryV1Schema = z.object({
  domain: z.string().min(1), policyRevision: revision, tokenBudget: z.number().int().positive(),
  featureMask: z.array(z.string().min(1)).min(1), tileWidth: z.number().int().positive(),
  contextWindow: z.number().int().positive(), residencyPriority: z.number().int().nonnegative(),
}).strict();
export type FeaturePolicyLutEntryV1 = z.infer<typeof featurePolicyLutEntryV1Schema>;

export function resolveFeaturePolicyLutEntryV1(input: { entries: readonly FeaturePolicyLutEntryV1[]; domain: string; expectedRevision: string }): FeaturePolicyLutEntryV1 | null {
  const matches = input.entries.filter((entry) => entry.domain === input.domain && entry.policyRevision === input.expectedRevision);
  return matches.length === 1 ? featurePolicyLutEntryV1Schema.parse(matches[0]) : null;
}

export const qloraTrainingSnapshotV1Schema = z.object({
  schema: z.literal('atlas.qlora-training-snapshot.v1'), cohortChecksum: checksum,
  workspaceRevision: revision, packetCount: z.number().int().nonnegative(), featureRevision: revision,
  labelRevision: revision, trainingManifestChecksum: checksum, adapterRevision: revision.nullable(),
  status: z.enum(['BLOCKED_COHORT', 'READY_FOR_OFFLINE_EVALUATION']), canonicalAuthority: z.literal(false), writesPerformed: z.literal(false),
}).strict();
export type QloraTrainingSnapshotV1 = z.infer<typeof qloraTrainingSnapshotV1Schema>;

/** Stage 11: topology is a derived traversal coordinate, not a packet identity. */
export const topologyCoordinate4V1Schema = z.object({
  schema: z.literal('atlas.topology-coordinate4.v1'), canonicalId: z.string().min(1),
  workspaceRevision: revision, graphRevision: revision,
  coordinate: z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()]),
  routeSignature: z.string().min(1).nullable(), communityId: z.number().int().nonnegative().nullable(),
  evidenceRefs: z.array(z.string().min(1)), canonicalAuthority: z.literal(false),
}).strict();
export type TopologyCoordinate4V1 = z.infer<typeof topologyCoordinate4V1Schema>;

/** Stage 12: transport formats are subordinate read/analysis projections. */
export const offlineTransportArtifactV1Schema = z.object({
  schema: z.literal('atlas.offline-transport-artifact.v1'), format: z.enum(['ARROW', 'PARQUET', 'JSONL', 'MSGPACK', 'COUCHDB_READ_MODEL']),
  sourceRevision: revision, artifactChecksum: checksum, rowCount: z.number().int().nonnegative(),
  authority: z.literal('POSTGRES'), purpose: z.enum(['ANALYTICAL_JOIN', 'COMPACT_TRANSPORT', 'READ_MODEL']),
  writesPerformed: z.literal(false),
}).strict();
export type OfflineTransportArtifactV1 = z.infer<typeof offlineTransportArtifactV1Schema>;

/** Stage 13: canary planning is a receipt-shaped contract; it never performs fanout. */
export const packetFabricCanaryV1Schema = z.object({
  schema: z.literal('atlas.packet-fabric-canary.v1'), corpus: z.literal('NES_CHROM97'),
  inputChecksum: checksum, requestedRows: z.number().int().positive(),
  status: z.enum(['BLOCKED_LINEAGE', 'READY_FOR_BOUNDED_APPLY', 'READBACK_REQUIRED']),
  postgresReadback: z.enum(['NOT_RUN', 'REQUIRED', 'PASS']),
  semanticProjectionReadback: z.enum(['NOT_RUN', 'REQUIRED', 'PASS']),
  qdrantProjectionReadback: z.enum(['NOT_RUN', 'REQUIRED', 'PASS']),
  aceResidencyReadback: z.enum(['NOT_RUN', 'REQUIRED', 'PASS']),
  writesPerformed: z.literal(false), canonicalAuthority: z.literal(false),
}).strict();
export type PacketFabricCanaryV1 = z.infer<typeof packetFabricCanaryV1Schema>;

export function buildBlockedPacketFabricCanaryV1(input: { inputChecksum: string; requestedRows?: number }): PacketFabricCanaryV1 {
  return packetFabricCanaryV1Schema.parse({
    schema: 'atlas.packet-fabric-canary.v1', corpus: 'NES_CHROM97', inputChecksum: input.inputChecksum,
    requestedRows: input.requestedRows ?? 45, status: 'BLOCKED_LINEAGE', postgresReadback: 'REQUIRED',
    semanticProjectionReadback: 'NOT_RUN', qdrantProjectionReadback: 'NOT_RUN', aceResidencyReadback: 'NOT_RUN',
    writesPerformed: false, canonicalAuthority: false,
  });
}

/**
 * NES/CHROM97 packet admission evidence. This is deliberately a candidate
 * envelope: PostgreSQL remains the canonical packet owner and no candidate
 * becomes canonical until an independent transaction/readback gate admits it.
 */
export const packetAdmissionCandidateV1Schema = z.object({
  schema: z.literal('atlas.packet-admission-candidate.v1'),
  canonicalId: z.string().min(1), packetKey: z.string().min(1),
  workspaceRevision: revision, sourceRef: z.string().min(1), sourceRevision: revision,
  sourcePayloadChecksum: checksum, producer: z.string().min(1), producerRevision: revision,
  admissionStatus: z.enum(['PENDING_LINEAGE', 'READY_FOR_READBACK']),
  canonicalAuthority: z.literal(false), writesPerformed: z.literal(false),
}).strict();
export type PacketAdmissionCandidateV1 = z.infer<typeof packetAdmissionCandidateV1Schema>;

/**
 * Compact, reproducible packet summary for later PostgreSQL readback/fanout.
 * Query hashes, JSON order, transport offsets, and projection IDs are not
 * accepted as identity here; callers must supply the canonical packet fields.
 */
export const packetSummaryV1Schema = z.object({
  schema: z.literal('atlas.packet-summary.v1'), canonicalId: z.string().min(1),
  packetKey: z.string().min(1), workspaceRevision: revision, sourceRef: z.string().min(1),
  sourceRevision: revision, packetRevision: revision, representationRevision: revision.nullable(),
  domain: z.string().min(1), kind: z.string().min(1), title: z.string().min(1),
  summary: z.string().min(1), lexicalText: z.string().min(1), semanticText: z.string().min(1),
  evidenceRefs: z.array(z.string().min(1)).min(1), sourcePayloadChecksum: checksum,
  summaryChecksum: checksum, producer: z.string().min(1), producerRevision: revision,
  admissionStatus: z.enum(['PENDING_LINEAGE', 'READY_FOR_READBACK']),
  canonicalAuthority: z.literal(false), writesPerformed: z.literal(false),
}).strict();
export type PacketSummaryV1 = z.infer<typeof packetSummaryV1Schema>;

type PacketSummaryChecksumInputV1 = Omit<PacketSummaryV1, 'summaryChecksum' | 'canonicalAuthority' | 'writesPerformed'>;

function packetSummaryChecksumPayloadV1(summary: PacketSummaryChecksumInputV1) {
  return {
    schema: 'atlas.packet-summary-payload.v1',
    canonicalId: summary.canonicalId, packetKey: summary.packetKey,
    workspaceRevision: summary.workspaceRevision, sourceRef: summary.sourceRef,
    sourceRevision: summary.sourceRevision, packetRevision: summary.packetRevision,
    representationRevision: summary.representationRevision, domain: summary.domain,
    kind: summary.kind, title: summary.title, summary: summary.summary,
    lexicalText: summary.lexicalText, semanticText: summary.semanticText,
    evidenceRefs: summary.evidenceRefs, sourcePayloadChecksum: summary.sourcePayloadChecksum,
    producer: summary.producer, producerRevision: summary.producerRevision,
    admissionStatus: summary.admissionStatus,
  };
}

export function buildPacketSummaryV1(input: PacketSummaryChecksumInputV1): PacketSummaryV1 {
  const summaryChecksum = `sha256:${canonicalSha256V1(packetSummaryChecksumPayloadV1(input))}`;
  return packetSummaryV1Schema.parse({ ...input, summaryChecksum, canonicalAuthority: false, writesPerformed: false });
}

export function parsePacketSummaryV1(value: unknown): PacketSummaryV1 {
  const summary = packetSummaryV1Schema.parse(value);
  const expected = `sha256:${canonicalSha256V1(packetSummaryChecksumPayloadV1(summary))}`;
  if (summary.summaryChecksum !== expected) throw new Error('PACKET_SUMMARY_CHECKSUM_MISMATCH');
  return summary;
}

/**
 * Read-only canary preflight. It validates a complete candidate cohort but
 * deliberately stops before PostgreSQL admission, projection fanout, or cache
 * warming. The caller must perform the independent transaction/readback gate.
 */
export function planPacketFabricCanaryV1(input: {
  summaries: readonly unknown[];
  inputChecksum: string;
  requestedRows?: number;
}): PacketFabricCanaryV1 {
  const requestedRows = input.requestedRows ?? 45;
  if (input.summaries.length !== requestedRows) throw new Error('PACKET_FABRIC_CANARY_COHORT_COUNT_MISMATCH');
  const summaries = input.summaries.map(parsePacketSummaryV1);
  const canonicalIds = new Set(summaries.map((summary) => summary.canonicalId));
  const packetKeys = new Set(summaries.map((summary) => summary.packetKey));
  if (canonicalIds.size !== summaries.length) throw new Error('PACKET_FABRIC_CANARY_DUPLICATE_CANONICAL_ID');
  if (packetKeys.size !== summaries.length) throw new Error('PACKET_FABRIC_CANARY_DUPLICATE_PACKET_KEY');
  if (summaries.some((summary) => summary.admissionStatus !== 'READY_FOR_READBACK')) {
    throw new Error('PACKET_FABRIC_CANARY_LINEAGE_NOT_READY');
  }
  return packetFabricCanaryV1Schema.parse({
    schema: 'atlas.packet-fabric-canary.v1', corpus: 'NES_CHROM97', inputChecksum: input.inputChecksum,
    requestedRows, status: 'READY_FOR_BOUNDED_APPLY', postgresReadback: 'REQUIRED',
    semanticProjectionReadback: 'NOT_RUN', qdrantProjectionReadback: 'NOT_RUN', aceResidencyReadback: 'NOT_RUN',
    writesPerformed: false, canonicalAuthority: false,
  });
}
