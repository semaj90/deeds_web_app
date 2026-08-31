import { describe, expect, it } from 'vitest';
import {
  buildGpuExperimentLeaseV1,
  checksumExperimentHypothesisV1,
  checksumExperimentWorktreeV1,
  checksumHardwareProfileV1,
  computeRelativeImprovementV1,
  decideExperimentPromotionV1,
  experimentHypothesisV1Schema,
  experimentRunReceiptV1Schema,
  hardwareProfileV1Schema,
  experimentWorktreeV1Schema,
} from './autoresearch-fabric-v1.js';
import {
  evaluateGpuAdmission,
  gpuAdmissionRequestSchema,
  gpuResourceEnvelopeSchema,
} from './gpu-resource-envelope.js';

const checksum = (ch: string) => ch.repeat(64);

function hypothesis() {
  return experimentHypothesisV1Schema.parse({
    experimentId: 'exp:rmsnorm:cutile:001',
    campaignId: 'campaign:rmsnorm:sm86',
    parentRevision: 'git:abc123',
    taskClass: 'GPU_KERNEL_OPTIMIZATION',
    hypothesis: 'cuTile tiled RMSNorm reduces p50 latency while preserving PyTorch-reference correctness.',
    independentVariable: {
      key: 'provider',
      baselineValue: 'PYTORCH_ATEN',
      candidateValue: 'CUTILE',
    },
    controlledVariables: {
      dtype: 'bf16',
      shape: '[4096,768]',
      device: 'sm_86',
    },
    targetMetric: 'p50_latency_us',
    optimizationDirection: 'MINIMIZE',
    minimumRelativeImprovement: 0.05,
    workloadFixtureRevision: 'fixture:rmsnorm:v1',
    workloadFixtureChecksum: checksum('a'),
    oakKernelRevision: 'oak:kernel:v1',
    acePacketChecksum: checksum('b'),
    allowedProviders: ['PYTORCH_ATEN', 'CUTILE', 'CUDA_SIMT'],
    mutationScope: 'ISOLATED_WORKTREE',
  });
}

function hardware() {
  return hardwareProfileV1Schema.parse({
    profileRevision: 'hardware:sm86:cuda13.2:v1',
    hostClass: 'LOCAL_WORKSTATION',
    os: { family: 'windows', version: '10' },
    cpu: { model: 'Intel 11th Gen', logicalCores: 16 },
    ramBytes: 64 * 1024 ** 3,
    gpu: {
      deviceId: 'cuda:0',
      name: 'NVIDIA GeForce RTX 3060 Ti',
      computeCapability: '8.6',
      totalVramBytes: 8 * 1024 ** 3,
      driverRevision: '580.88',
      cudaToolkitRevision: '13.2',
    },
    toolchain: {
      pythonRevision: '3.13',
      pytorchRevision: '2.13.0',
      cutileRevision: '1.5.0',
    },
    producerRevision: 'hardware-profiler:v1',
  });
}

function worktree() {
  return experimentWorktreeV1Schema.parse({
    experimentId: 'exp:rmsnorm:cutile:001',
    parentRevision: 'git:abc123',
    worktreeRevision: 'git:def456',
    worktreePath: '.runtime/worktrees/exp-rmsnorm-cutile-001',
    allowedMutationPaths: ['python/kernels/rmsnorm_cutile.py'],
    forbiddenMutationPaths: ['migrations/', 'docs/reports/canonical/'],
    sourceMutationIsolated: true,
    canonicalStateWritable: false,
  });
}

function receipt(overrides: Record<string, unknown> = {}) {
  const h = hypothesis();
  const relativeImprovement = computeRelativeImprovementV1({
    baselineValue: 100,
    candidateValue: 80,
    optimizationDirection: h.optimizationDirection,
  });
  return experimentRunReceiptV1Schema.parse({
    experimentId: h.experimentId,
    hypothesisChecksum: checksumExperimentHypothesisV1(h),
    hardwareProfileChecksum: checksumHardwareProfileV1(hardware()),
    worktreeChecksum: checksumExperimentWorktreeV1(worktree()),
    workloadFixtureRevision: h.workloadFixtureRevision,
    workloadFixtureChecksum: h.workloadFixtureChecksum,
    provider: 'CUTILE',
    providerRevision: 'cutile:rmsnorm:v1',
    baselineExecutionManifestChecksum: checksum('c'),
    candidateExecutionManifestChecksum: checksum('d'),
    correctness: {
      status: 'PASS',
      referenceProvider: 'PYTORCH_ATEN',
      maxAbsError: 1e-5,
      meanAbsError: 1e-6,
      outputChecksum: checksum('e'),
    },
    benchmark: {
      targetMetric: h.targetMetric,
      baselineValue: 100,
      candidateValue: 80,
      relativeImprovement,
      distribution: {
        warmupRuns: 20,
        measuredRuns: 100,
        p50: 80,
        p95: 84,
        mean: 80.5,
        unit: 'us',
      },
      peakVramBytes: 32 * 1024 ** 2,
    },
    evidenceRefs: ['fixture:rmsnorm:v1', 'test:rmsnorm-parity:v1'],
    canonicalStateMutated: false,
    writesOutsideWorktree: false,
    ...overrides,
  });
}

function gpuEnvelope(freeBytes = 6 * 1024 ** 3) {
  return gpuResourceEnvelopeSchema.parse({
    device_id: 'cuda:0',
    snapshot_revision: 'gpu-snapshot:v1',
    total_bytes: 8 * 1024 ** 3,
    free_bytes: freeBytes,
    safety_reserve_bytes: 1024 ** 3,
    resident_workloads: [],
    producer_revision: 'gpu-profiler:v1',
  });
}

describe('Parent Atlas autoresearch fabric v1', () => {
  it('rejects a no-op or ambiguous single-change hypothesis', () => {
    expect(() => experimentHypothesisV1Schema.parse({
      ...hypothesis(),
      independentVariable: { key: 'provider', baselineValue: 'CUTILE', candidateValue: 'CUTILE' },
    })).toThrow();

    expect(() => experimentHypothesisV1Schema.parse({
      ...hypothesis(),
      controlledVariables: { provider: 'CUTILE' },
    })).toThrow();
  });

  it('produces stable checksums for hypothesis and hardware evidence', () => {
    const h = hypothesis();
    const hw = hardware();
    expect(checksumExperimentHypothesisV1(h)).toBe(checksumExperimentHypothesisV1({ ...h }));
    expect(checksumHardwareProfileV1(hw)).toBe(checksumHardwareProfileV1({ ...hw }));
  });

  it('binds an already-admitted GPU operation to an experiment lease', () => {
    const request = gpuAdmissionRequestSchema.parse({
      operation_id: 'op:exp:rmsnorm:cutile:001',
      operation_kind: 'other',
      required_workspace_bytes: 256 * 1024 ** 2,
      required_persistent_bytes: 64 * 1024 ** 2,
      may_evict: false,
    });
    const envelope = gpuEnvelope();
    const admission = evaluateGpuAdmission({ envelope, request });
    const lease = buildGpuExperimentLeaseV1({
      leaseId: 'lease:1',
      experimentId: hypothesis().experimentId,
      envelope,
      request,
      receipt: admission,
      expiresAt: '2026-09-01T00:00:00.000Z',
    });
    expect(lease.deviceId).toBe('cuda:0');
    expect(lease.operationId).toBe(request.operation_id);
    expect(lease.maxWorkspaceBytes).toBe(request.required_workspace_bytes);
    expect(lease.canonicalAuthority).toBe(false);
  });

  it('cannot mint an experiment lease from an insufficient-VRAM admission receipt', () => {
    const request = gpuAdmissionRequestSchema.parse({
      operation_id: 'op:too-large',
      operation_kind: 'other',
      required_workspace_bytes: 7 * 1024 ** 3,
      required_persistent_bytes: 0,
      may_evict: false,
    });
    const envelope = gpuEnvelope(2 * 1024 ** 3);
    const admission = evaluateGpuAdmission({ envelope, request });
    expect(admission.admitted).toBe(false);
    expect(() => buildGpuExperimentLeaseV1({
      leaseId: 'lease:blocked',
      experimentId: hypothesis().experimentId,
      envelope,
      request,
      receipt: admission,
      expiresAt: '2026-09-01T00:00:00.000Z',
    })).toThrow('AUTORESEARCH_GPU_LEASE_REQUIRES_ADMITTED_RECEIPT');
  });

  it('promotes a correct admitted experiment that clears the measured improvement floor', () => {
    const decision = decideExperimentPromotionV1({
      hypothesis: hypothesis(),
      receipt: receipt(),
      promotedKernelRevision: 'kernel:rmsnorm:cutile:v1',
    });
    expect(decision.decision).toBe('PROMOTE');
    expect(decision.reasons).toEqual(['ALL_PROMOTION_GATES_PASSED']);
    expect(decision.promotedKernelRevision).toBe('kernel:rmsnorm:cutile:v1');
  });

  it('rejects a correct candidate that is slower than baseline', () => {
    const h = hypothesis();
    const r = receipt({
      benchmark: {
        targetMetric: h.targetMetric,
        baselineValue: 100,
        candidateValue: 110,
        relativeImprovement: -0.1,
        distribution: { warmupRuns: 20, measuredRuns: 100, p50: 110, p95: 114, mean: 110.5, unit: 'us' },
        peakVramBytes: 32 * 1024 ** 2,
      },
    });
    const decision = decideExperimentPromotionV1({
      hypothesis: h,
      receipt: r,
      promotedKernelRevision: 'kernel:unused',
    });
    expect(decision.decision).toBe('REJECT');
    expect(decision.reasons).toContain('IMPROVEMENT_BELOW_FLOOR');
  });

  it('blocks a worker that reports an improvement inconsistent with raw measurements', () => {
    const h = hypothesis();
    const r = receipt({
      benchmark: {
        targetMetric: h.targetMetric,
        baselineValue: 100,
        candidateValue: 80,
        relativeImprovement: 0.9,
        distribution: { warmupRuns: 20, measuredRuns: 100, p50: 80, p95: 84, mean: 80.5, unit: 'us' },
        peakVramBytes: 32 * 1024 ** 2,
      },
    });
    const decision = decideExperimentPromotionV1({
      hypothesis: h,
      receipt: r,
      promotedKernelRevision: 'kernel:unused',
    });
    expect(decision.decision).toBe('BLOCKED');
    expect(decision.reasons).toContain('RELATIVE_IMPROVEMENT_MISMATCH');
  });

  it('preserves an escaped write as evidence and blocks promotion', () => {
    const decision = decideExperimentPromotionV1({
      hypothesis: hypothesis(),
      receipt: receipt({ writesOutsideWorktree: true }),
      promotedKernelRevision: 'kernel:unused',
    });
    expect(decision.decision).toBe('BLOCKED');
    expect(decision.reasons).toContain('WRITE_ESCAPED_WORKTREE');
  });
});
