import { z } from 'zod';
import {
  alignedProjectionRefSchema,
  buildAlignedOrdinalRegistry,
  type AlignedOrdinalRegistryV1,
  type AlignedProjectionRefV1,
} from './aligned-ordinal-prefill-fabric.js';
import { tensorSnapshotSchema, type TensorSnapshotV1 } from './tensor-snapshot.js';

const id = z.string().min(1);
const revision = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);

export const alignedMaterializedArtifactSchema = z.object({
  artifact_id: id,
  kind: z.enum(['SEMANTIC', 'FEATURE', 'HYPERGRAPH', 'NARY_INCIDENCE']),
  path: z.string().min(1),
  content_checksum: checksum,
  row_identity_checksum: checksum.nullable(),
  logical_row_count: z.number().int().nonnegative(),
  physical_row_count: z.number().int().nonnegative(),
  dimensions: z.number().int().positive().nullable(),
  dtype: z.string().min(1).nullable(),
}).strict().superRefine((value, ctx) => {
  const aligned = ['SEMANTIC', 'FEATURE', 'HYPERGRAPH'].includes(value.kind);
  if (aligned && value.row_identity_checksum === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['row_identity_checksum'], message: `${value.kind} requires row identity` });
  }
  if (value.kind === 'NARY_INCIDENCE' && value.row_identity_checksum !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['row_identity_checksum'], message: 'raw NARY_INCIDENCE is not a one-row-per-canonical-id projection' });
  }
  if (value.kind === 'SEMANTIC' && value.dimensions !== 768) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dimensions'], message: 'SEMANTIC artifact must remain 768-dimensional' });
  }
});
export type AlignedMaterializedArtifactV1 = z.infer<typeof alignedMaterializedArtifactSchema>;

export const alignedMaterializationReceiptSchema = z.object({
  schema: z.literal('atlas.aligned-materialization-receipt.v1'),
  materialization_revision: revision,
  source_snapshot_revision: revision,
  row_identity_checksum: checksum,
  row_count: z.number().int().nonnegative(),
  artifacts: z.array(alignedMaterializedArtifactSchema).min(3),
  producer_revision: revision,
  receipt_checksum: checksum,
}).strict().superRefine((value, ctx) => {
  for (const kind of ['SEMANTIC', 'FEATURE', 'HYPERGRAPH'] as const) {
    const matches = value.artifacts.filter((artifact) => artifact.kind === kind);
    if (matches.length !== 1) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['artifacts'], message: `receipt requires exactly one ${kind} artifact` });
  }
  for (const artifact of value.artifacts) {
    if (artifact.row_identity_checksum !== null && artifact.row_identity_checksum !== value.row_identity_checksum) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['artifacts'], message: `${artifact.artifact_id} row identity mismatch` });
    }
    if (artifact.row_identity_checksum !== null && artifact.logical_row_count !== value.row_count) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['artifacts'], message: `${artifact.artifact_id} logical row count mismatch` });
    }
  }
});
export type AlignedMaterializationReceiptV1 = z.infer<typeof alignedMaterializationReceiptSchema>;

export function projectionRefsFromAlignedMaterialization(
  receiptInput: AlignedMaterializationReceiptV1,
): AlignedProjectionRefV1[] {
  const receipt = alignedMaterializationReceiptSchema.parse(receiptInput);
  return receipt.artifacts
    .filter((artifact): artifact is AlignedMaterializedArtifactV1 & { kind: 'SEMANTIC' | 'FEATURE' | 'HYPERGRAPH'; row_identity_checksum: string } =>
      ['SEMANTIC', 'FEATURE', 'HYPERGRAPH'].includes(artifact.kind) && artifact.row_identity_checksum !== null)
    .map((artifact) => alignedProjectionRefSchema.parse({
      projection_id: artifact.artifact_id,
      projection_revision: receipt.materialization_revision,
      kind: artifact.kind,
      artifact_id: artifact.artifact_id,
      artifact_checksum: artifact.content_checksum,
      row_identity_checksum: artifact.row_identity_checksum,
      row_count: artifact.logical_row_count,
    }));
}

export function buildAlignedRegistryFromMaterialization(input: {
  registry_revision: string;
  tensor_snapshot: TensorSnapshotV1;
  materialization_receipt: AlignedMaterializationReceiptV1;
  producer_revision: string;
}): AlignedOrdinalRegistryV1 {
  const tensor = tensorSnapshotSchema.parse(input.tensor_snapshot);
  const receipt = alignedMaterializationReceiptSchema.parse(input.materialization_receipt);
  if (tensor.row_identity_checksum !== receipt.row_identity_checksum) throw new Error('MATERIALIZATION_TENSOR_ROW_IDENTITY_MISMATCH');
  if (tensor.row_count !== receipt.row_count) throw new Error('MATERIALIZATION_TENSOR_ROW_COUNT_MISMATCH');
  return buildAlignedOrdinalRegistry({
    registry_revision: input.registry_revision,
    source_snapshot_revision: receipt.source_snapshot_revision,
    tensor_snapshot: tensor,
    projections: projectionRefsFromAlignedMaterialization(receipt),
    producer_revision: input.producer_revision,
  });
}
