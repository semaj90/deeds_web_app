import { z } from 'zod';

/**
 * Revision-qualified transfer contracts for ANN -> GPU traversal.
 *
 * ANN executors exchange ordinals and scores. The 768-dim representation stays
 * in its owning snapshot/executor and is gathered only for the bounded set
 * that a materializer admits. Qdrant/TurboVec/DiskANN/cuVS remain executors,
 * never identity or fusion owners.
 */

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const CandidateRepresentationV1Schema = z.object({
  snapshotRevision: z.string().min(1),
  representationId: z.literal('semantic_768'),
  representationRevision: z.string().min(1),
  dimension: z.literal(768),
  metric: z.literal('cosine'),
  normalization: z.literal('l2'),
  datasetChecksumSha256: Sha256Schema,
}).strict();
export type CandidateRepresentationV1 = z.infer<typeof CandidateRepresentationV1Schema>;

export const CandidateExecutorV1Schema = z.enum([
  'qdrant_hnsw',
  'turbovec',
  'diskann',
  'cuvs_brute_force',
  'cuvs_cagra',
  'neo4j_graph',
  'postgres_exact',
]);
export type CandidateExecutorV1 = z.infer<typeof CandidateExecutorV1Schema>;

export const CandidateOrdinalScoreV1Schema = z.object({
  ordinal: z.number().int().nonnegative(),
  score: z.number().finite(),
  rank: z.number().int().positive(),
  executor: CandidateExecutorV1Schema,
  logicalLane: z.enum(['lexical', 'semantic', 'ast', 'graph']),
  canonicalId: z.string().min(1).nullable(),
  evidenceRefs: z.array(z.string().min(1)).max(64),
}).strict();
export type CandidateOrdinalScoreV1 = z.infer<typeof CandidateOrdinalScoreV1Schema>;

export const RevisionQualifiedCandidateSetV1Schema = z.object({
  schema: z.literal('atlas.revision-qualified-candidate-set.v1'),
  requestId: z.string().min(1),
  representation: CandidateRepresentationV1Schema,
  candidates: z.array(CandidateOrdinalScoreV1Schema).max(100_000),
  exactOracleCompared: z.boolean(),
  canonicalDedupApplied: z.literal(true),
  canonicalWrites: z.literal(false),
  producerRevision: z.string().min(1),
}).strict().superRefine((value, ctx) => {
  const seen = new Set<number>();
  for (const candidate of value.candidates) {
    if (seen.has(candidate.ordinal)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['candidates'], message: `duplicate ordinal ${candidate.ordinal}` });
    }
    seen.add(candidate.ordinal);
  }
});
export type RevisionQualifiedCandidateSetV1 = z.infer<typeof RevisionQualifiedCandidateSetV1Schema>;

export const CandidateHeadSchema = z.enum([
  'semantic',
  'structural',
  'graph',
  'execution',
  'domain',
  'program',
  'memory',
]);
export type CandidateHead = z.infer<typeof CandidateHeadSchema>;

export const GpuCandidateBatchDescriptorV1Schema = z.object({
  schema: z.literal('atlas.gpu-candidate-batch-descriptor.v1'),
  batchRevision: z.string().min(1),
  snapshotRevision: z.string().min(1),
  representation: CandidateRepresentationV1Schema,
  ordinals: z.array(z.number().int().nonnegative()).max(100_000),
  logicalRows: z.number().int().nonnegative(),
  physicalRows: z.number().int().nonnegative(),
  tileRows: z.number().int().positive(),
  validMask: z.array(z.union([z.literal(0), z.literal(1)])).max(100_000),
  precision: z.enum(['fp32', 'fp16']),
  device: z.enum(['cpu', 'gpu']),
  heads: z.array(CandidateHeadSchema).min(1).max(7),
  sourceArtifactRef: z.string().min(1),
  canonicalWrites: z.literal(false),
}).strict().superRefine((value, ctx) => {
  if (value.physicalRows < value.logicalRows) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['physicalRows'], message: 'physicalRows cannot be below logicalRows' });
  }
  if (value.physicalRows % value.tileRows !== 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['physicalRows'], message: 'physicalRows must be tile aligned' });
  }
  if (value.ordinals.length !== value.logicalRows || value.validMask.length !== value.physicalRows) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['validMask'], message: 'ordinal and mask lengths do not match row counts' });
  }
  if (value.validMask.slice(0, value.logicalRows).some((bit) => bit !== 1) || value.validMask.slice(value.logicalRows).some((bit) => bit !== 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['validMask'], message: 'mask must contain logical rows first, then padding zeros' });
  }
});
export type GpuCandidateBatchDescriptorV1 = z.infer<typeof GpuCandidateBatchDescriptorV1Schema>;

export function materializeGpuCandidateBatch(input: {
  batchRevision: string;
  candidates: RevisionQualifiedCandidateSetV1;
  tileRows: number;
  precision: 'fp32' | 'fp16';
  device?: 'cpu' | 'gpu';
  heads: CandidateHead[];
  sourceArtifactRef: string;
}): GpuCandidateBatchDescriptorV1 {
  const candidates = RevisionQualifiedCandidateSetV1Schema.parse(input.candidates);
  if (!Number.isInteger(input.tileRows) || input.tileRows <= 0) throw new Error('tileRows must be positive');
  const logicalRows = candidates.candidates.length;
  const physicalRows = Math.ceil(logicalRows / input.tileRows) * input.tileRows;
  return GpuCandidateBatchDescriptorV1Schema.parse({
    schema: 'atlas.gpu-candidate-batch-descriptor.v1',
    batchRevision: input.batchRevision,
    snapshotRevision: candidates.representation.snapshotRevision,
    representation: candidates.representation,
    ordinals: candidates.candidates.map((candidate) => candidate.ordinal),
    logicalRows,
    physicalRows,
    tileRows: input.tileRows,
    validMask: Array.from({ length: physicalRows }, (_, index) => index < logicalRows ? 1 : 0),
    precision: input.precision,
    device: input.device ?? 'gpu',
    heads: input.heads,
    sourceArtifactRef: input.sourceArtifactRef,
    canonicalWrites: false,
  });
}
