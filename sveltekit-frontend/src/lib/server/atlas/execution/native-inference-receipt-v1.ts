import { createHash } from 'node:crypto';
import { z } from 'zod';
import { canonicalEncodeV1 } from '../prefill/canonical-hash-v1.js';

export const NativeInferenceReceiptV1Schema = z.object({
  schema: z.literal('atlas.native-inference-receipt.v1'),
  requestId: z.string().min(1),
  representationId: z.string().min(1),
  representationRevision: z.string().min(1),
  modelRevision: z.string().min(1),
  executor: z.literal('libtorch_node_api'),
  executorRevision: z.string().min(1),
  nodeApiVersion: z.string().min(1),
  addonRevision: z.string().min(1),
  libtorchVersion: z.string().min(1),
  device: z.enum(['CPU', 'CUDA']),
  computeCapability: z.string().min(1).nullable(),
  inputChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/i),
  outputChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/i),
  shape: z.array(z.number().int().positive()).min(1),
  dtype: z.enum(['float32', 'float16', 'bfloat16', 'int8', 'int4']),
  parityStatus: z.enum(['REFERENCE', 'PASSED', 'FAILED', 'NOT_RUN']),
  eventLoopSafe: z.literal(true),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
  checksumSha256: z.string().regex(/^sha256:[a-f0-9]{64}$/i),
}).strict();

export type NativeInferenceReceiptV1 = z.infer<typeof NativeInferenceReceiptV1Schema>;

export function buildNativeInferenceReceiptV1(
  input: Omit<NativeInferenceReceiptV1, 'schema' | 'executor' | 'checksumSha256'>,
): NativeInferenceReceiptV1 {
  const payload = { schema: 'atlas.native-inference-receipt.v1' as const, executor: 'libtorch_node_api' as const, ...input };
  const checksumSha256 = `sha256:${createHash('sha256').update(canonicalEncodeV1(payload), 'utf8').digest('hex')}`;
  return NativeInferenceReceiptV1Schema.parse({ ...payload, checksumSha256 });
}
