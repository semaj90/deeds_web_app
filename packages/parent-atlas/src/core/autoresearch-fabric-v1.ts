import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  algorithmExecutionManifestSchema,
  checksumAlgorithmExecutionManifest,
  type AlgorithmExecutionManifestV1,
} from './algorithm-execution-manifest.js';
import {
  gpuAdmissionReceiptSchema,
  gpuAdmissionRequestSchema,
  gpuResourceEnvelopeSchema,
  type GpuAdmissionReceiptV1,
  type GpuAdmissionRequestV1,
  type GpuResourceEnvelopeV1,
} from './gpu-resource-envelope.js';

const revision = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const bytes = z.number().int().nonnegative();

export const AUTORESEARCH_PROVIDER_VALUES = [
  'PYTORCH_ATEN',
  'TORCH_COMPILE_INDUCTOR',
  'TRITON',
  'CUTEDSL',
  'CUTILE',
  'CUDA_SIMT',
  'CUBLASLT',
  'CUTLASS',
  'CUVS',
  'CUGRAPH',
  'NETWORKX',
  'CPU_REFERENCE',
] as const;

export const autoresearchProviderSchema = z.enum(AUTORESEARCH_PROVIDER_VALUES);

export const experimentHypothesisV1Schema = z.object({
  schema: z.literal('atlas.experiment-hypothesis.v1').default('atlas.experiment-hypothesis.v1'),
  experimentId: z.string().min(1),
  campaignId: z.string().min(1),
  parentRevision: revision,
  taskClass: z.string().min(1),
  hypothesis: z.string().min(1),
  independentVariable: z.object({
    key: z.string().min(1),
    baselineValue: z.string().min(1),
    candidateValue: z.string().min(1),
  }).strict(),
  controlledVariables: z.record(z.string(), z.string().min(1)).default({}),
  targetMetric: z.string().min(1),
  optimizationDirection: z.enum(['MINIMIZE', 'MAXIMIZE']),
  minimumRelativeImprovement: z.number().finite().nonnegative().default(0),
  workloadFixtureRevision: revision,
  workloadFixtureChecksum: checksum,
  oakKernelRevision: revision.optional(),
  acePacketChecksum: checksum.optional(),
  allowedProviders: z.array(autoresearchProviderSchema).min(1),
  mutationScope: z.literal('ISOLATED_WORKTREE'),
  canonicalAuthority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.independentVariable.baselineValue === value.independentVariable.candidateValue) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['independentVariable'],
      message: 'single-change experiment must actually change the declared independent variable',
    });
  }
  if (Object.hasOwn(value.controlledVariables, value.independentVariable.key)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['controlledVariables'],
      message: 'independent variable cannot also be declared controlled',
    });
  }
});

export const hardwareProfileV1Schema = z.object({
  schema: z.literal('atlas.hardware-profile.v1').default('atlas.hardware-profile.v1'),
  profileRevision: revision,
  hostClass: z.enum(['LOCAL_WORKSTATION', 'MANAGED_GPU_JOB', 'CI_GPU_RUNNER']),
  os: z.object({
    family: z.enum(['windows', 'linux', 'wsl2']),
    version: z.string().min(1),
    kernelRevision: z.string().min(1).optional(),
  }).strict(),
  cpu: z.object({
    model: z.string().min(1),
    logicalCores: z.number().int().positive(),
  }).strict(),
  ramBytes: z.number().int().positive(),
  gpu: z.object({
    deviceId: z.string().min(1),
    name: z.string().min(1),
    computeCapability: z.string().regex(/^\d+\.\d+$/),
    totalVramBytes: z.number().int().positive(),
    driverRevision: revision,
    cudaToolkitRevision: revision,
    smCount: z.number().int().positive().optional(),
  }).strict(),
  toolchain: z.object({
    pythonRevision: revision.optional(),
    pytorchRevision: revision.optional(),
    cudnnRevision: revision.optional(),
    cutileRevision: revision.optional(),
    tritonRevision: revision.optional(),
    cutedslRevision: revision.optional(),
    cugraphRevision: revision.optional(),
    cuvsRevision: revision.optional(),
    nvccRevision: revision.optional(),
    ptxasRevision: revision.optional(),
  }).strict(),
  producerRevision: revision,
  canonicalAuthority: z.literal(false).default(false),
}).strict();

export const gpuExperimentLeaseV1Schema = z.object({
  schema: z.literal('atlas.gpu-experiment-lease.v1').default('atlas.gpu-experiment-lease.v1'),
  leaseId: z.string().min(1),
  experimentId: z.string().min(1),
  operationId: z.string().min(1),
  deviceId: z.string().min(1),
  gpuResourceSnapshotRevision: revision,
  gpuAdmissionReceiptChecksum: checksum,
  maxPersistentBytes: bytes,
  maxWorkspaceBytes: bytes,
  expiresAt: z.string().datetime(),
  exclusive: z.boolean().default(true),
  canonicalAuthority: z.literal(false).default(false),
}).strict();

export const experimentWorktreeV1Schema = z.object({
  schema: z.literal('atlas.experiment-worktree.v1').default('atlas.experiment-worktree.v1'),
  experimentId: z.string().min(1),
  parentRevision: revision,
  worktreeRevision: revision,
  worktreePath: z.string().min(1),
  allowedMutationPaths: z.array(z.string().min(1)).min(1),
  forbiddenMutationPaths: z.array(z.string().min(1)).default([]),
  sourceMutationIsolated: z.literal(true),
  canonicalStateWritable: z.literal(false),
}).strict();

export const benchmarkDistributionV1Schema = z.object({
  warmupRuns: z.number().int().nonnegative(),
  measuredRuns: z.number().int().positive(),
  p50: z.number().finite().nonnegative(),
  p95: z.number().finite().nonnegative(),
  mean: z.number().finite().nonnegative(),
  unit: z.enum(['us', 'ms', 's', 'tokens_per_second', 'queries_per_second']),
}).strict();

export const experimentRunReceiptV1Schema = z.object({
  schema: z.literal('atlas.experiment-run-receipt.v1').default('atlas.experiment-run-receipt.v1'),
  experimentId: z.string().min(1),
  hypothesisChecksum: checksum,
  hardwareProfileChecksum: checksum,
  worktreeChecksum: checksum,
  gpuLeaseChecksum: checksum.optional(),
  workloadFixtureRevision: revision,
  workloadFixtureChecksum: checksum,
  provider: autoresearchProviderSchema,
  providerRevision: revision,
  baselineExecutionManifestChecksum: checksum,
  candidateExecutionManifestChecksum: checksum,
  correctness: z.object({
    status: z.enum(['PASS', 'FAIL', 'ERROR']),
    referenceProvider: autoresearchProviderSchema,
    maxAbsError: z.number().finite().nonnegative().nullable(),
    meanAbsError: z.number().finite().nonnegative().nullable(),
    outputChecksum: checksum.nullable(),
  }).strict(),
  benchmark: z.object({
    targetMetric: z.string().min(1),
    baselineValue: z.number().finite(),
    candidateValue: z.number().finite(),
    relativeImprovement: z.number().finite(),
    distribution: benchmarkDistributionV1Schema,
    peakVramBytes: bytes.nullable(),
  }).strict(),
  compilerDiagnosticsChecksum: checksum.nullable().default(null),
  testDiagnosticsChecksum: checksum.nullable().default(null),
  evidenceRefs: z.array(z.string().min(1)).min(1),
  canonicalStateMutated: z.boolean(),
  writesOutsideWorktree: z.boolean(),
  canonicalAuthority: z.literal(false).default(false),
}).strict();

export const experimentPromotionDecisionV1Schema = z.object({
  schema: z.literal('atlas.experiment-promotion-decision.v1').default('atlas.experiment-promotion-decision.v1'),
  experimentId: z.string().min(1),
  hypothesisChecksum: checksum,
  runReceiptChecksum: checksum,
  decision: z.enum(['PROMOTE', 'REJECT', 'BLOCKED']),
  reasons: z.array(z.string().min(1)).min(1),
  promotedKernelRevision: revision.nullable(),
  canonicalAuthority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if ((value.decision === 'PROMOTE') !== (value.promotedKernelRevision !== null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['promotedKernelRevision'],
      message: 'only PROMOTE may carry a promoted kernel revision',
    });
  }
});

export type ExperimentHypothesisV1 = z.infer<typeof experimentHypothesisV1Schema>;
export type HardwareProfileV1 = z.infer<typeof hardwareProfileV1Schema>;
export type GpuExperimentLeaseV1 = z.infer<typeof gpuExperimentLeaseV1Schema>;
export type ExperimentWorktreeV1 = z.infer<typeof experimentWorktreeV1Schema>;
export type ExperimentRunReceiptV1 = z.infer<typeof experimentRunReceiptV1Schema>;
export type ExperimentPromotionDecisionV1 = z.infer<typeof experimentPromotionDecisionV1Schema>;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function checksumValue(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export function checksumExperimentHypothesisV1(value: ExperimentHypothesisV1): string {
  return checksumValue(experimentHypothesisV1Schema.parse(value));
}

export function checksumHardwareProfileV1(value: HardwareProfileV1): string {
  return checksumValue(hardwareProfileV1Schema.parse(value));
}

export function checksumGpuExperimentLeaseV1(value: GpuExperimentLeaseV1): string {
  return checksumValue(gpuExperimentLeaseV1Schema.parse(value));
}

export function checksumExperimentWorktreeV1(value: ExperimentWorktreeV1): string {
  return checksumValue(experimentWorktreeV1Schema.parse(value));
}

export function checksumExperimentRunReceiptV1(value: ExperimentRunReceiptV1): string {
  return checksumValue(experimentRunReceiptV1Schema.parse(value));
}

export function checksumGpuAdmissionReceiptForLeaseV1(value: GpuAdmissionReceiptV1): string {
  return checksumValue(gpuAdmissionReceiptSchema.parse(value));
}

export function buildGpuExperimentLeaseV1(input: {
  leaseId: string;
  experimentId: string;
  envelope: GpuResourceEnvelopeV1;
  request: GpuAdmissionRequestV1;
  receipt: GpuAdmissionReceiptV1;
  expiresAt: string;
  exclusive?: boolean;
}): GpuExperimentLeaseV1 {
  const envelope = gpuResourceEnvelopeSchema.parse(input.envelope);
  const request = gpuAdmissionRequestSchema.parse(input.request);
  const receipt = gpuAdmissionReceiptSchema.parse(input.receipt);

  if (!receipt.admitted) throw new Error('AUTORESEARCH_GPU_LEASE_REQUIRES_ADMITTED_RECEIPT');
  if (receipt.operation_id !== request.operation_id) throw new Error('AUTORESEARCH_GPU_LEASE_OPERATION_MISMATCH');
  const expectedTotal = request.required_workspace_bytes + request.required_persistent_bytes;
  if (receipt.required_total_bytes !== expectedTotal) throw new Error('AUTORESEARCH_GPU_LEASE_REQUIRED_BYTES_MISMATCH');

  return gpuExperimentLeaseV1Schema.parse({
    leaseId: input.leaseId,
    experimentId: input.experimentId,
    operationId: request.operation_id,
    deviceId: envelope.device_id,
    gpuResourceSnapshotRevision: envelope.snapshot_revision,
    gpuAdmissionReceiptChecksum: checksumGpuAdmissionReceiptForLeaseV1(receipt),
    maxPersistentBytes: request.required_persistent_bytes,
    maxWorkspaceBytes: request.required_workspace_bytes,
    expiresAt: input.expiresAt,
    exclusive: input.exclusive ?? true,
  });
}

export function executionManifestPairChecksumsV1(input: {
  baseline: AlgorithmExecutionManifestV1;
  candidate: AlgorithmExecutionManifestV1;
}): { baselineExecutionManifestChecksum: string; candidateExecutionManifestChecksum: string } {
  const baseline = algorithmExecutionManifestSchema.parse(input.baseline);
  const candidate = algorithmExecutionManifestSchema.parse(input.candidate);
  return {
    baselineExecutionManifestChecksum: checksumAlgorithmExecutionManifest(baseline),
    candidateExecutionManifestChecksum: checksumAlgorithmExecutionManifest(candidate),
  };
}

export function computeRelativeImprovementV1(input: {
  baselineValue: number;
  candidateValue: number;
  optimizationDirection: ExperimentHypothesisV1['optimizationDirection'];
}): number {
  const scale = Math.max(Math.abs(input.baselineValue), Number.EPSILON);
  return input.optimizationDirection === 'MAXIMIZE'
    ? (input.candidateValue - input.baselineValue) / scale
    : (input.baselineValue - input.candidateValue) / scale;
}

export function decideExperimentPromotionV1(input: {
  hypothesis: ExperimentHypothesisV1;
  receipt: ExperimentRunReceiptV1;
  promotedKernelRevision: string;
}): ExperimentPromotionDecisionV1 {
  const hypothesis = experimentHypothesisV1Schema.parse(input.hypothesis);
  const receipt = experimentRunReceiptV1Schema.parse(input.receipt);
  const hypothesisChecksum = checksumExperimentHypothesisV1(hypothesis);
  const receiptChecksum = checksumExperimentRunReceiptV1(receipt);
  const reasons: string[] = [];

  if (receipt.experimentId !== hypothesis.experimentId) reasons.push('EXPERIMENT_ID_MISMATCH');
  if (receipt.hypothesisChecksum !== hypothesisChecksum) reasons.push('HYPOTHESIS_CHECKSUM_MISMATCH');
  if (receipt.workloadFixtureRevision !== hypothesis.workloadFixtureRevision) reasons.push('WORKLOAD_FIXTURE_REVISION_MISMATCH');
  if (receipt.workloadFixtureChecksum !== hypothesis.workloadFixtureChecksum) reasons.push('WORKLOAD_FIXTURE_CHECKSUM_MISMATCH');
  if (!hypothesis.allowedProviders.includes(receipt.provider)) reasons.push('PROVIDER_NOT_ADMITTED');
  if (receipt.correctness.status !== 'PASS') reasons.push('CORRECTNESS_NOT_PROVEN');
  if (receipt.canonicalStateMutated) reasons.push('CANONICAL_STATE_MUTATED');
  if (receipt.writesOutsideWorktree) reasons.push('WRITE_ESCAPED_WORKTREE');
  if (receipt.benchmark.targetMetric !== hypothesis.targetMetric) reasons.push('TARGET_METRIC_MISMATCH');

  const derivedImprovement = computeRelativeImprovementV1({
    baselineValue: receipt.benchmark.baselineValue,
    candidateValue: receipt.benchmark.candidateValue,
    optimizationDirection: hypothesis.optimizationDirection,
  });
  if (Math.abs(derivedImprovement - receipt.benchmark.relativeImprovement) > 1e-9) {
    reasons.push('RELATIVE_IMPROVEMENT_MISMATCH');
  }
  if (derivedImprovement < hypothesis.minimumRelativeImprovement) reasons.push('IMPROVEMENT_BELOW_FLOOR');

  const blocked = reasons.some((reason) =>
    reason.endsWith('_MISMATCH') ||
    reason === 'PROVIDER_NOT_ADMITTED' ||
    reason === 'CANONICAL_STATE_MUTATED' ||
    reason === 'WRITE_ESCAPED_WORKTREE'
  );
  const decision = reasons.length === 0 ? 'PROMOTE' : blocked ? 'BLOCKED' : 'REJECT';

  return experimentPromotionDecisionV1Schema.parse({
    experimentId: hypothesis.experimentId,
    hypothesisChecksum,
    runReceiptChecksum: receiptChecksum,
    decision,
    reasons: reasons.length ? reasons : ['ALL_PROMOTION_GATES_PASSED'],
    promotedKernelRevision: decision === 'PROMOTE' ? input.promotedKernelRevision : null,
  });
}

export function describeAutoresearchFabricV1(): string {
  return [
    'The autoresearch fabric is a research protocol, not a new canonical authority or agent control plane.',
    'Each run declares exactly one independent variable, executes in an isolated worktree, and compares against a frozen workload fixture.',
    'OaK constrains legal concepts/functions; ACE supplies bounded evidence; Prime/ACP-style workers may propose code; Mastra/Atlas DAGs own durable execution.',
    'Existing GPU resource envelopes and admission receipts remain the VRAM admission owner; an experiment lease only binds that admission to one isolated run.',
    'PyTorch ATen is a preferred reference surface while cuTile, CUDA SIMT, Triton, CuTeDSL, cuVS and cuGraph are explicit challenger/provider labels.',
    'Correctness is evaluated before performance, and performance may promote only when all identity, workload, mutation and independently-derived improvement gates pass.',
    'BitFrost/Valkey may cache or coordinate experiment artifacts and leases but never determine promotion truth.',
    'Experiment outcomes are append-only evidence suitable for later ontology/hypergraph research memory and do-not-repeat retrieval.',
  ].join(' ');
}
