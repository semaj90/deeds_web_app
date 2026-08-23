import { createHash } from 'node:crypto';
import { z } from 'zod';

export const REPRESENTATION_MATRIX_INDEX_CONTRACT_SCHEMA =
  'atlas.representation-matrix-index-contract.v1' as const;

export const MATRIX_ROLE_VALUES = [
  'CANONICAL_SEMANTIC',
  'DERIVED_LATENT',
  'CANDIDATE_FEATURES',
  'DERIVED_BINARY_SEMANTIC',
  'SPARSE_AST_RELATION',
] as const;

export const MatrixRoleSchema = z.enum(MATRIX_ROLE_VALUES);
export type MatrixRole = z.infer<typeof MatrixRoleSchema>;

export const MatrixStorageFormatSchema = z.enum([
  'NPY_F32_MMAP',
  'MMAP_F16',
  'MMAP_I8',
  'ARROW_IPC',
  'BITPACKED',
  'SPARSE_CSR',
]);

export const MatrixDtypeSchema = z.enum([
  'float32',
  'float16',
  'int8',
  'uint8',
  'bit',
  'sparse-float32',
]);

export const MatrixDescriptorV1Schema = z.object({
  representationId: z.string().min(1),
  role: MatrixRoleSchema,
  sourceRepresentationId: z.string().min(1).nullable(),
  rows: z.number().int().nonnegative(),
  cols: z.number().int().positive().nullable(),
  dtype: MatrixDtypeSchema,
  storageFormat: MatrixStorageFormatSchema,
  candidateSnapshotRevision: z.string().min(1),
  ordinalMapChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  rowIdentityChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  matrixChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  workspaceRevision: z.string().min(1),
  representationRevision: z.string().min(1),
  producerRevision: z.string().min(1),
  canonicalAuthority: z.literal(false),
}).strict();
export type MatrixDescriptorV1 = z.infer<typeof MatrixDescriptorV1Schema>;

export const SemanticExecutorSchema = z.enum([
  'PGVECTOR_EXACT',
  'QDRANT_HNSW',
  'CUVS_EXACT',
  'CAGRA',
  'TURBOVEC',
]);
export type SemanticExecutor = z.infer<typeof SemanticExecutorSchema>;

export const SemanticIndexBindingV1Schema = z.object({
  executor: SemanticExecutorSchema,
  logicalLane: z.literal('semantic'),
  representationId: z.literal('semantic_768'),
  representationRevision: z.string().min(1),
  candidateSnapshotRevision: z.string().min(1),
  ordinalMapChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  backendLocation: z.string().min(1),
  physicalVectorName: z.string().min(1).nullable(),
  indexKind: z.enum(['EXACT', 'HNSW', 'GRAPH_ANN', 'COMPRESSED_ANN']),
  returnsCandidateOrdinals: z.literal(true),
  returnsRawVectors: z.literal(false),
  identityAuthority: z.literal(false),
  independentFusionVote: z.literal(false),
}).strict();
export type SemanticIndexBindingV1 = z.infer<typeof SemanticIndexBindingV1Schema>;

export const RepresentationMatrixIndexContractV1Schema = z.object({
  schema: z.literal(REPRESENTATION_MATRIX_INDEX_CONTRACT_SCHEMA),
  candidateSnapshotRevision: z.string().min(1),
  ordinalMapChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  workspaceRevision: z.string().min(1),
  matrices: z.array(MatrixDescriptorV1Schema).min(1),
  semanticExecutors: z.array(SemanticIndexBindingV1Schema).min(1),
  semanticLaneVoteCount: z.literal(1),
  largeVectorTransportAllowed: z.literal(false),
  candidateOrdinalIsExecutionCoordinate: z.literal(true),
  candidateOrdinalIsIdentityAuthority: z.literal(false),
  canonicalIdentityFields: z.tuple([
    z.literal('canonicalId'),
    z.literal('packetKey'),
    z.literal('sourceRevision'),
  ]),
  contractChecksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type RepresentationMatrixIndexContractV1 = z.infer<typeof RepresentationMatrixIndexContractV1Schema>;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, child]) => child !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
    .join(',')}}`;
}

function checksum(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function assertAlignedMatrixRows(
  matrices: readonly MatrixDescriptorV1[],
  candidateSnapshotRevision: string,
  ordinalMapChecksum: string,
): void {
  for (const matrix of matrices) {
    if (matrix.candidateSnapshotRevision !== candidateSnapshotRevision) {
      throw new Error(`MATRIX_CANDIDATE_SNAPSHOT_MISMATCH:${matrix.representationId}`);
    }
    if (matrix.ordinalMapChecksum !== ordinalMapChecksum) {
      throw new Error(`MATRIX_ORDINAL_MAP_CHECKSUM_MISMATCH:${matrix.representationId}`);
    }
  }
}

function assertRepresentationRoles(matrices: readonly MatrixDescriptorV1[]): void {
  const semantic = matrices.filter((matrix) => matrix.role === 'CANONICAL_SEMANTIC');
  if (semantic.length !== 1 || semantic[0]?.representationId !== 'semantic_768') {
    throw new Error('SEMANTIC_768_SINGLE_CANONICAL_MATRIX_REQUIRED');
  }
  if (semantic[0].cols !== 768 || semantic[0].dtype !== 'float32') {
    throw new Error('SEMANTIC_768_CANONICAL_SHAPE_DTYPE_REQUIRED');
  }

  for (const matrix of matrices) {
    if (matrix.role === 'DERIVED_LATENT') {
      if (matrix.sourceRepresentationId !== 'semantic_768') {
        throw new Error(`LATENT_SOURCE_REPRESENTATION_MISMATCH:${matrix.representationId}`);
      }
      if (!['latent_128', 'latent_64'].includes(matrix.representationId)) {
        throw new Error(`UNRECOGNIZED_PRODUCTION_LATENT:${matrix.representationId}`);
      }
    }
    if (matrix.role === 'CANDIDATE_FEATURES' && matrix.sourceRepresentationId !== null) {
      throw new Error('CANDIDATE_FEATURE_MATRIX_MUST_NOT_PRETEND_TO_BE_AN_EMBEDDING_DERIVATION');
    }
    if (matrix.role === 'DERIVED_BINARY_SEMANTIC' && matrix.sourceRepresentationId !== 'semantic_768') {
      throw new Error('BINARY_SEMANTIC_SOURCE_REPRESENTATION_MISMATCH');
    }
  }
}

function assertSemanticExecutorBindings(
  executors: readonly SemanticIndexBindingV1[],
  candidateSnapshotRevision: string,
  ordinalMapChecksum: string,
): void {
  const seen = new Set<SemanticExecutor>();
  for (const executor of executors) {
    if (seen.has(executor.executor)) throw new Error(`DUPLICATE_SEMANTIC_EXECUTOR:${executor.executor}`);
    seen.add(executor.executor);
    if (executor.candidateSnapshotRevision !== candidateSnapshotRevision) {
      throw new Error(`EXECUTOR_CANDIDATE_SNAPSHOT_MISMATCH:${executor.executor}`);
    }
    if (executor.ordinalMapChecksum !== ordinalMapChecksum) {
      throw new Error(`EXECUTOR_ORDINAL_MAP_CHECKSUM_MISMATCH:${executor.executor}`);
    }
    if (executor.representationId !== 'semantic_768' || executor.logicalLane !== 'semantic') {
      throw new Error(`EXECUTOR_SEMANTIC_LANE_REPRESENTATION_MISMATCH:${executor.executor}`);
    }
    if (executor.independentFusionVote) {
      throw new Error(`SEMANTIC_EXECUTOR_VOTE_INFLATION_REJECTED:${executor.executor}`);
    }
  }
}

export function buildRepresentationMatrixIndexContractV1(input: {
  candidateSnapshotRevision: string;
  ordinalMapChecksum: string;
  workspaceRevision: string;
  matrices: readonly z.input<typeof MatrixDescriptorV1Schema>[];
  semanticExecutors: readonly z.input<typeof SemanticIndexBindingV1Schema>[];
}): RepresentationMatrixIndexContractV1 {
  const matrices = input.matrices.map((matrix) => MatrixDescriptorV1Schema.parse(matrix));
  const semanticExecutors = input.semanticExecutors.map((binding) => SemanticIndexBindingV1Schema.parse(binding));

  assertAlignedMatrixRows(matrices, input.candidateSnapshotRevision, input.ordinalMapChecksum);
  assertRepresentationRoles(matrices);
  assertSemanticExecutorBindings(semanticExecutors, input.candidateSnapshotRevision, input.ordinalMapChecksum);

  const rowCounts = new Set(matrices.map((matrix) => matrix.rows));
  if (rowCounts.size !== 1) throw new Error('MATRIX_ROW_COUNT_ALIGNMENT_REQUIRED');

  const payload = {
    schema: REPRESENTATION_MATRIX_INDEX_CONTRACT_SCHEMA,
    candidateSnapshotRevision: input.candidateSnapshotRevision,
    ordinalMapChecksum: input.ordinalMapChecksum,
    workspaceRevision: input.workspaceRevision,
    matrices,
    semanticExecutors,
    semanticLaneVoteCount: 1 as const,
    largeVectorTransportAllowed: false as const,
    candidateOrdinalIsExecutionCoordinate: true as const,
    candidateOrdinalIsIdentityAuthority: false as const,
    canonicalIdentityFields: ['canonicalId', 'packetKey', 'sourceRevision'] as const,
  };

  return RepresentationMatrixIndexContractV1Schema.parse({
    ...payload,
    contractChecksum: checksum(payload),
  });
}

export function verifyRepresentationMatrixIndexContractV1(
  input: z.input<typeof RepresentationMatrixIndexContractV1Schema>,
): RepresentationMatrixIndexContractV1 {
  const parsed = RepresentationMatrixIndexContractV1Schema.parse(input);
  const { contractChecksum, ...payload } = parsed;
  const expected = checksum(payload);
  if (expected !== contractChecksum) {
    throw new Error(`REPRESENTATION_MATRIX_INDEX_CONTRACT_CHECKSUM_MISMATCH:${expected}:${contractChecksum}`);
  }
  assertAlignedMatrixRows(parsed.matrices, parsed.candidateSnapshotRevision, parsed.ordinalMapChecksum);
  assertRepresentationRoles(parsed.matrices);
  assertSemanticExecutorBindings(parsed.semanticExecutors, parsed.candidateSnapshotRevision, parsed.ordinalMapChecksum);
  return parsed;
}
