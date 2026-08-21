import { createHash } from 'node:crypto';
import { z } from 'zod';
import { CANDIDATE_FEATURE_NAMES } from '../contracts/feature-extraction-v1.js';
import type { RetrievalCandidateFeatureMatrixV1 } from '../../retrieval/retrieval-candidate-feature-matrix-v1.js';

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.string().min(1);

export const TORCH_FEATURE_TENSOR_SCHEMA = 'atlas.torch-feature-tensor.v1' as const;
export const TORCH_FEATURE_TENSOR_REVISION = 'atlas.torch-feature-tensor.row-major-f32-mask-v1' as const;

export const TorchFeatureTensorV1Schema = z.object({
  schema: z.literal(TORCH_FEATURE_TENSOR_SCHEMA),
  tensorRevision: z.literal(TORCH_FEATURE_TENSOR_REVISION),
  featureRevision: id,
  workspaceRevision: id,
  representationRevision: id,
  queryId: id,
  rowCount: z.number().int().nonnegative(),
  columnCount: z.literal(25),
  columnNames: z.tuple(CANDIDATE_FEATURE_NAMES.map((name) => z.literal(name)) as [z.ZodLiteral<string>, ...z.ZodLiteral<string>[]]),
  rowKeys: z.array(id),
  layout: z.literal('ROW_MAJOR_CONTIGUOUS'),
  dtype: z.literal('float32'),
  presenceMaskDtype: z.literal('uint8'),
  featureBytesSha256: sha256,
  presenceMaskBytesSha256: sha256,
  rowKeysSha256: sha256,
  evidenceAuthority: z.literal(false),
  canonicalOwnerChanged: z.literal(false),
}).strict();

export type TorchFeatureTensorV1 = z.infer<typeof TorchFeatureTensorV1Schema>;

function digestBytes(view: ArrayBufferView): string {
  return createHash('sha256')
    .update(Buffer.from(view.buffer, view.byteOffset, view.byteLength))
    .digest('hex');
}

function digestStrings(values: readonly string[]): string {
  const hash = createHash('sha256');
  for (const value of values) hash.update(`${Buffer.byteLength(value, 'utf8')}:`, 'utf8').update(value, 'utf8');
  return hash.digest('hex');
}

export function buildTorchFeatureTensorV1(input: {
  matrix: RetrievalCandidateFeatureMatrixV1;
  queryId: string;
  workspaceRevision: string;
  representationRevision: string;
  featureRevision: string;
}): { artifact: TorchFeatureTensorV1; features: Float32Array; presenceMask: Uint8Array } {
  const { matrix } = input;
  if (matrix.feature_count !== CANDIDATE_FEATURE_NAMES.length) {
    throw new Error(`TORCH_FEATURE_COLUMN_COUNT_MISMATCH:${matrix.feature_count}`);
  }
  if (matrix.candidate_packet_keys.length !== matrix.candidate_count) {
    throw new Error('TORCH_FEATURE_ROW_KEY_COUNT_MISMATCH');
  }
  if (matrix.candidate_features.length !== matrix.candidate_count * matrix.feature_count) {
    throw new Error('TORCH_FEATURE_VALUE_SHAPE_MISMATCH');
  }
  if (matrix.presence_mask.length !== matrix.candidate_features.length) {
    throw new Error('TORCH_FEATURE_MASK_SHAPE_MISMATCH');
  }
  for (let i = 0; i < matrix.candidate_features.length; i += 1) {
    if (!Number.isFinite(matrix.candidate_features[i])) throw new Error(`TORCH_FEATURE_NON_FINITE:${i}`);
    const mask = matrix.presence_mask[i];
    if (mask !== 0 && mask !== 1) throw new Error(`TORCH_FEATURE_MASK_INVALID:${i}`);
    if (mask === 0 && matrix.candidate_features[i] !== 0) throw new Error(`TORCH_FEATURE_MISSING_VALUE_NOT_ZERO:${i}`);
  }

  const features = matrix.candidate_features.slice();
  const presenceMask = matrix.presence_mask.slice();
  const artifact = TorchFeatureTensorV1Schema.parse({
    schema: TORCH_FEATURE_TENSOR_SCHEMA,
    tensorRevision: TORCH_FEATURE_TENSOR_REVISION,
    featureRevision: input.featureRevision,
    workspaceRevision: input.workspaceRevision,
    representationRevision: input.representationRevision,
    queryId: input.queryId,
    rowCount: matrix.candidate_count,
    columnCount: 25,
    columnNames: [...CANDIDATE_FEATURE_NAMES],
    rowKeys: [...matrix.candidate_packet_keys],
    layout: 'ROW_MAJOR_CONTIGUOUS',
    dtype: 'float32',
    presenceMaskDtype: 'uint8',
    featureBytesSha256: digestBytes(features),
    presenceMaskBytesSha256: digestBytes(presenceMask),
    rowKeysSha256: digestStrings(matrix.candidate_packet_keys),
    evidenceAuthority: false,
    canonicalOwnerChanged: false,
  });
  return { artifact, features, presenceMask };
}
