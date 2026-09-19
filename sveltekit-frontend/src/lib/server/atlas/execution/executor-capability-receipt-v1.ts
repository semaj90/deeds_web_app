import { z } from 'zod';
import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';

export const EXECUTOR_CAPABILITY_RECEIPT_V1_SCHEMA = 'atlas.executor-capability-receipt.v1' as const;

export const ExecutorCapabilityReceiptV1Schema = z.object({
  schema: z.literal(EXECUTOR_CAPABILITY_RECEIPT_V1_SCHEMA),
  executor: z.enum([
    'pytorch_cpu',
    'pytorch_cuda',
    'libtorch_node_api',
    'onnx_runtime',
    'webgpu',
    'directml',
    'cugraph',
    'cutile',
    'tensorrt_rtx',
  ]),
  executorRevision: z.string().min(1),
  device: z.string().min(1),
  computeCapability: z.string().min(1).nullable(),
  driverRevision: z.string().min(1).nullable(),
  runtimeRevision: z.string().min(1),
  capabilityStatus: z.enum(['PROVEN', 'UNAVAILABLE', 'UNPROVEN']),
  parityStatus: z.enum(['REFERENCE', 'PASSED', 'FAILED', 'NOT_RUN']),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export type ExecutorCapabilityReceiptV1 = z.infer<typeof ExecutorCapabilityReceiptV1Schema>;

export function buildExecutorCapabilityReceiptV1(
  input: Omit<ExecutorCapabilityReceiptV1, 'schema' | 'checksum'>,
): ExecutorCapabilityReceiptV1 {
  const body = { schema: EXECUTOR_CAPABILITY_RECEIPT_V1_SCHEMA, ...input };
  return ExecutorCapabilityReceiptV1Schema.parse({ ...body, checksum: canonicalSha256V1(body) });
}
