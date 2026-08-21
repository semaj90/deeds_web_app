import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  TORCH_FEATURE_TENSOR_SCHEMA,
  TORCH_FEATURE_TENSOR_REVISION,
  type TorchFeatureTensorV1,
} from './torch-feature-tensor-v1.js';

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.string().min(1);
const finiteNonNegative = z.number().finite().min(0);

export const TORCH_MODEL_EXECUTION_SCHEMA = 'atlas.torch-model-execution.v1' as const;
export const TORCH_MODEL_EXECUTION_REVISION = 'atlas.torch-model-execution.manifest-receipt-v1' as const;

export const TorchModelExecutorV1Schema = z.enum([
  'PYTORCH_CPU',
  'PYTORCH_CUDA',
  'LIBTORCH_CUDA',
]);

export const TorchModelRoleV1Schema = z.enum([
  'candidate_reranker',
  'query_router',
  'classifier',
  'parity_probe',
]);

export const TorchModelFormatV1Schema = z.enum([
  'PYTORCH_STATE_DICT',
  'TORCHSCRIPT',
  'ONNX',
]);

export const TorchModelExecutionManifestV1Schema = z.object({
  schema: z.literal(TORCH_MODEL_EXECUTION_SCHEMA),
  executionRevision: z.literal(TORCH_MODEL_EXECUTION_REVISION),

  modelId: id,
  modelRevision: id,
  modelArtifactSha256: sha256,
  modelFormat: TorchModelFormatV1Schema,
  modelRole: TorchModelRoleV1Schema,

  inputTensorSchema: id,
  inputTensorRevision: id,
  inputFeatureBytesSha256: sha256,
  inputRowKeysSha256: sha256,
  inputRowCount: z.number().int().nonnegative(),
  inputColumnCount: z.number().int().positive(),
  inputFeatureRevision: id,
  inputWorkspaceRevision: id,
  inputRepresentationRevision: id,

  requestedExecutor: TorchModelExecutorV1Schema,
  executorRevision: id,

  outputRole: z.enum([
    'score_per_row',
    'class_probabilities',
    'multi_head_router',
    'parity_probe',
  ]),
  outputWidth: z.number().int().positive(),

  numericPolicy: z.object({
    inputDtype: z.literal('float32'),
    outputDtype: z.literal('float32'),
    requireFinite: z.literal(true),
    atol: finiteNonNegative,
    rtol: finiteNonNegative,
  }).strict(),

  evidenceAuthority: z.literal(false),
  canonicalOwnerChanged: z.literal(false),
  logicalLaneVoteAdded: z.literal(false),
}).strict();

export const TorchModelExecutionReceiptV1Schema = z.object({
  schema: z.literal('atlas.torch-model-execution-receipt.v1'),
  executionRevision: z.literal(TORCH_MODEL_EXECUTION_REVISION),
  manifestSha256: sha256,

  modelId: id,
  modelRevision: id,
  modelArtifactSha256: sha256,
  modelRole: TorchModelRoleV1Schema,

  inputTensorRevision: id,
  inputFeatureBytesSha256: sha256,
  inputRowKeysSha256: sha256,
  inputRowCount: z.number().int().nonnegative(),

  requestedExecutor: TorchModelExecutorV1Schema,
  actualExecutor: z.enum([
    'PYTORCH_CPU',
    'PYTORCH_CUDA',
    'LIBTORCH_CUDA',
    'BLOCKED',
  ]),
  executorRevision: id,
  status: z.enum(['SUCCESS', 'BLOCKED', 'ERROR']),
  blockReason: z.string().min(1).nullable(),

  outputRole: z.string().min(1),
  outputWidth: z.number().int().positive(),
  outputCount: z.number().int().nonnegative(),
  outputBytesSha256: sha256.nullable(),
  outputsFinite: z.boolean(),

  referenceReceiptSha256: sha256.nullable(),
  maxAbsoluteDeltaVsReference: finiteNonNegative.nullable(),
  withinTolerance: z.boolean().nullable(),
  atol: finiteNonNegative,
  rtol: finiteNonNegative,

  receiptSha256: sha256,
  evidenceAuthority: z.literal(false),
  canonicalOwnerChanged: z.literal(false),
  logicalLaneVoteAdded: z.literal(false),
}).strict();

export type TorchModelExecutorV1 = z.infer<typeof TorchModelExecutorV1Schema>;
export type TorchModelExecutionManifestV1 = z.infer<typeof TorchModelExecutionManifestV1Schema>;
export type TorchModelExecutionReceiptV1 = z.infer<typeof TorchModelExecutionReceiptV1Schema>;

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256StableJsonV1(value: unknown): string {
  return createHash('sha256').update(stableJson(value), 'utf8').digest('hex');
}

export function buildTorchFeatureExecutionManifestV1(input: {
  tensor: TorchFeatureTensorV1;
  modelId: string;
  modelRevision: string;
  modelArtifactSha256: string;
  modelFormat: z.infer<typeof TorchModelFormatV1Schema>;
  modelRole: z.infer<typeof TorchModelRoleV1Schema>;
  requestedExecutor: TorchModelExecutorV1;
  executorRevision: string;
  outputRole: z.infer<typeof TorchModelExecutionManifestV1Schema>['outputRole'];
  outputWidth: number;
  atol?: number;
  rtol?: number;
}): TorchModelExecutionManifestV1 {
  if (input.tensor.schema !== TORCH_FEATURE_TENSOR_SCHEMA || input.tensor.tensorRevision !== TORCH_FEATURE_TENSOR_REVISION) {
    throw new Error('TORCH_EXECUTION_INPUT_TENSOR_CONTRACT_MISMATCH');
  }
  return TorchModelExecutionManifestV1Schema.parse({
    schema: TORCH_MODEL_EXECUTION_SCHEMA,
    executionRevision: TORCH_MODEL_EXECUTION_REVISION,
    modelId: input.modelId,
    modelRevision: input.modelRevision,
    modelArtifactSha256: input.modelArtifactSha256,
    modelFormat: input.modelFormat,
    modelRole: input.modelRole,
    inputTensorSchema: input.tensor.schema,
    inputTensorRevision: input.tensor.tensorRevision,
    inputFeatureBytesSha256: input.tensor.featureBytesSha256,
    inputRowKeysSha256: input.tensor.rowKeysSha256,
    inputRowCount: input.tensor.rowCount,
    inputColumnCount: input.tensor.columnCount,
    inputFeatureRevision: input.tensor.featureRevision,
    inputWorkspaceRevision: input.tensor.workspaceRevision,
    inputRepresentationRevision: input.tensor.representationRevision,
    requestedExecutor: input.requestedExecutor,
    executorRevision: input.executorRevision,
    outputRole: input.outputRole,
    outputWidth: input.outputWidth,
    numericPolicy: {
      inputDtype: 'float32',
      outputDtype: 'float32',
      requireFinite: true,
      atol: input.atol ?? 1e-6,
      rtol: input.rtol ?? 1e-5,
    },
    evidenceAuthority: false,
    canonicalOwnerChanged: false,
    logicalLaneVoteAdded: false,
  });
}

export function validateTorchModelExecutionReceiptV1(receipt: TorchModelExecutionReceiptV1): TorchModelExecutionReceiptV1 {
  const parsed = TorchModelExecutionReceiptV1Schema.parse(receipt);
  const { receiptSha256: _ignored, ...preimage } = parsed;
  const expected = sha256StableJsonV1(preimage);
  if (expected !== parsed.receiptSha256) throw new Error('TORCH_EXECUTION_RECEIPT_CHECKSUM_MISMATCH');
  if (parsed.status === 'SUCCESS') {
    if (parsed.actualExecutor === 'BLOCKED') throw new Error('TORCH_EXECUTION_SUCCESS_CANNOT_BE_BLOCKED');
    if (!parsed.outputBytesSha256) throw new Error('TORCH_EXECUTION_SUCCESS_OUTPUT_CHECKSUM_REQUIRED');
    if (!parsed.outputsFinite) throw new Error('TORCH_EXECUTION_SUCCESS_FINITE_OUTPUT_REQUIRED');
    if (parsed.outputCount !== parsed.inputRowCount * parsed.outputWidth) {
      throw new Error('TORCH_EXECUTION_SUCCESS_OUTPUT_SHAPE_MISMATCH');
    }
  } else if (!parsed.blockReason) {
    throw new Error('TORCH_EXECUTION_NON_SUCCESS_REASON_REQUIRED');
  }
  return parsed;
}

export function assertTorchExecutionReceiptsComparableV1(
  reference: TorchModelExecutionReceiptV1,
  challenger: TorchModelExecutionReceiptV1,
): void {
  const a = validateTorchModelExecutionReceiptV1(reference);
  const b = validateTorchModelExecutionReceiptV1(challenger);
  const identityFields: Array<keyof TorchModelExecutionReceiptV1> = [
    'modelId',
    'modelRevision',
    'modelArtifactSha256',
    'modelRole',
    'inputTensorRevision',
    'inputFeatureBytesSha256',
    'inputRowKeysSha256',
    'inputRowCount',
    'outputRole',
    'outputWidth',
  ];
  for (const field of identityFields) {
    if (a[field] !== b[field]) throw new Error(`TORCH_EXECUTION_RECEIPT_NOT_COMPARABLE:${String(field)}`);
  }
  if (a.status !== 'SUCCESS' || b.status !== 'SUCCESS') {
    throw new Error('TORCH_EXECUTION_RECEIPT_NOT_COMPARABLE:status');
  }
}

export function buildTorchModelExecutionReceiptV1(input: Omit<TorchModelExecutionReceiptV1, 'schema' | 'executionRevision' | 'receiptSha256' | 'evidenceAuthority' | 'canonicalOwnerChanged' | 'logicalLaneVoteAdded'>): TorchModelExecutionReceiptV1 {
  const preimage = {
    schema: 'atlas.torch-model-execution-receipt.v1' as const,
    executionRevision: TORCH_MODEL_EXECUTION_REVISION,
    ...input,
    evidenceAuthority: false as const,
    canonicalOwnerChanged: false as const,
    logicalLaneVoteAdded: false as const,
  };
  return validateTorchModelExecutionReceiptV1({
    ...preimage,
    receiptSha256: sha256StableJsonV1(preimage),
  });
}
