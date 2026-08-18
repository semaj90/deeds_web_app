import { createHash } from 'node:crypto';
import type { ComputeDtype, NativeComputeDecision, NativeComputeRequest } from './native-compute-policy.js';

export interface NumericalToleranceV1 {
  maxAbsError: number;
  maxRelError: number;
  minTopKOverlap?: number | null;
}

export interface NativeComputePlanV1 {
  schema: 'atlas.native-compute-plan.v1';
  planId: string;
  operation: NativeComputeRequest['operation'];
  capability: string;
  referenceBackend: 'numpy-cpu' | 'pytorch-cpu' | 'networkx' | 'boost-graph' | 'scalar-cpp';
  selectedRuntime: NativeComputeDecision['runtime'];
  selectedExecutor: NativeComputeDecision['executor'];
  dtype: ComputeDtype;
  accumulationDtype: NativeComputeDecision['accumulationDtype'];
  shape: number[];
  smArchitecture: string | null;
  requiredGpuBytes: number;
  numericalTolerance: NumericalToleranceV1;
  environmentReceiptId: string | null;
  gpuLeaseId: string | null;
  accuracyReceiptId: string | null;
  producerRevision: string;
  checksum: string;
}

function stableHash(value: unknown): string {
  const canonical = JSON.stringify(value, (_key, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)));
    }
    return v;
  });
  return createHash('sha256').update(canonical).digest('hex');
}

const GPU_EXECUTORS = new Set<NativeComputeDecision['executor']>([
  'cublas', 'cublaslt', 'libtorch-cuda', 'cusolver', 'cutlass', 'cutile', 'tensorrt-rtx',
  'pytorch-cuda', 'cuvs-exact', 'cagra', 'cugraph', 'cugraph-pyg', 'tensorrt-llm',
]);

export function buildNativeComputePlan(input: {
  planId: string;
  request: NativeComputeRequest;
  decision: NativeComputeDecision;
  referenceBackend: NativeComputePlanV1['referenceBackend'];
  numericalTolerance: NumericalToleranceV1;
  smArchitecture?: string | null;
  gpuLeaseId?: string | null;
  accuracyReceiptId?: string | null;
  producerRevision?: string;
}): NativeComputePlanV1 {
  const { request, decision } = input;
  if (!request.shape.length || request.shape.some((n) => !Number.isFinite(n) || n <= 0)) throw new Error('NATIVE_COMPUTE_SHAPE_INVALID');
  if (input.numericalTolerance.maxAbsError < 0 || input.numericalTolerance.maxRelError < 0) throw new Error('NATIVE_COMPUTE_TOLERANCE_INVALID');
  if (input.numericalTolerance.minTopKOverlap != null && (input.numericalTolerance.minTopKOverlap < 0 || input.numericalTolerance.minTopKOverlap > 1)) throw new Error('NATIVE_COMPUTE_TOPK_OVERLAP_INVALID');

  const gpu = GPU_EXECUTORS.has(decision.executor);
  if (gpu && !decision.environmentReceiptId) throw new Error('NATIVE_COMPUTE_GPU_ENVIRONMENT_RECEIPT_REQUIRED');
  if (gpu && !input.gpuLeaseId) throw new Error('NATIVE_COMPUTE_GPU_LEASE_REQUIRED');
  if (decision.dtype === 'int8' && !input.accuracyReceiptId) throw new Error('NATIVE_COMPUTE_INT8_ACCURACY_RECEIPT_REQUIRED');
  if (decision.runtime === 'cpu-only' && input.gpuLeaseId) throw new Error('NATIVE_COMPUTE_CPU_PLAN_MUST_NOT_HAVE_GPU_LEASE');

  const body = {
    schema: 'atlas.native-compute-plan.v1' as const,
    planId: input.planId,
    operation: request.operation,
    capability: request.capability,
    referenceBackend: input.referenceBackend,
    selectedRuntime: decision.runtime,
    selectedExecutor: decision.executor,
    dtype: decision.dtype,
    accumulationDtype: decision.accumulationDtype,
    shape: [...request.shape],
    smArchitecture: input.smArchitecture ?? null,
    requiredGpuBytes: Math.max(0, request.requiredGpuBytes),
    numericalTolerance: input.numericalTolerance,
    environmentReceiptId: decision.environmentReceiptId,
    gpuLeaseId: input.gpuLeaseId ?? null,
    accuracyReceiptId: input.accuracyReceiptId ?? null,
    producerRevision: input.producerRevision ?? 'native-compute-plan-v1',
  };
  return { ...body, checksum: stableHash(body) };
}
