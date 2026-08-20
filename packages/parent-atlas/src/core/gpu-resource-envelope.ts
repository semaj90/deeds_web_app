import { z } from 'zod';

const bytes = z.number().int().nonnegative();
const revision = z.string().min(1);

export const gpuResidentWorkloadSchema = z.object({
  workload_id: z.string().min(1),
  workload_kind: z.enum(['llm_weights', 'kv_cache', 'embedding_model', 'reranker', 'cagra_index', 'tensor_workspace', 'other']),
  resident_bytes: bytes,
  evictable: z.boolean(),
}).strict();

export const gpuResourceEnvelopeSchema = z.object({
  schema: z.literal('atlas.gpu-resource-envelope.v1').default('atlas.gpu-resource-envelope.v1'),
  device_id: z.string().min(1),
  snapshot_revision: revision,
  total_bytes: z.number().int().positive(),
  free_bytes: bytes,
  safety_reserve_bytes: bytes,
  resident_workloads: z.array(gpuResidentWorkloadSchema).default([]),
  producer_revision: revision,
}).strict();

export const gpuAdmissionRequestSchema = z.object({
  operation_id: z.string().min(1),
  operation_kind: z.enum(['exact_gemm', 'cuvs_bruteforce', 'cagra_build', 'cagra_search', 'cugraph', 'pca', 'kmeans', 'rerank', 'other']),
  required_workspace_bytes: bytes,
  required_persistent_bytes: bytes.default(0),
  may_evict: z.boolean().default(false),
}).strict();

export const gpuAdmissionReceiptSchema = z.object({
  schema: z.literal('atlas.gpu-admission-receipt.v1').default('atlas.gpu-admission-receipt.v1'),
  operation_id: z.string().min(1),
  admitted: z.boolean(),
  available_after_reserve_bytes: bytes,
  required_total_bytes: bytes,
  evictable_bytes: bytes,
  reason: z.enum(['admitted', 'admitted_after_evictable_capacity', 'insufficient_vram']),
  canonical_authority: z.literal(false).default(false),
}).strict();

export type GpuResourceEnvelopeV1 = z.infer<typeof gpuResourceEnvelopeSchema>;
export type GpuAdmissionRequestV1 = z.infer<typeof gpuAdmissionRequestSchema>;
export type GpuAdmissionReceiptV1 = z.infer<typeof gpuAdmissionReceiptSchema>;

export function evaluateGpuAdmission(input: {
  envelope: GpuResourceEnvelopeV1;
  request: GpuAdmissionRequestV1;
}): GpuAdmissionReceiptV1 {
  const envelope = gpuResourceEnvelopeSchema.parse(input.envelope);
  const request = gpuAdmissionRequestSchema.parse(input.request);
  const available = Math.max(0, envelope.free_bytes - envelope.safety_reserve_bytes);
  const required = request.required_workspace_bytes + request.required_persistent_bytes;
  const evictable = envelope.resident_workloads
    .filter((workload) => workload.evictable)
    .reduce((sum, workload) => sum + workload.resident_bytes, 0);

  if (required <= available) {
    return gpuAdmissionReceiptSchema.parse({
      operation_id: request.operation_id,
      admitted: true,
      available_after_reserve_bytes: available,
      required_total_bytes: required,
      evictable_bytes: evictable,
      reason: 'admitted',
    });
  }
  if (request.may_evict && required <= available + evictable) {
    return gpuAdmissionReceiptSchema.parse({
      operation_id: request.operation_id,
      admitted: true,
      available_after_reserve_bytes: available,
      required_total_bytes: required,
      evictable_bytes: evictable,
      reason: 'admitted_after_evictable_capacity',
    });
  }
  return gpuAdmissionReceiptSchema.parse({
    operation_id: request.operation_id,
    admitted: false,
    available_after_reserve_bytes: available,
    required_total_bytes: required,
    evictable_bytes: evictable,
    reason: 'insufficient_vram',
  });
}
