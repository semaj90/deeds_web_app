import { describe, expect, it } from 'vitest';
import {
  HardwareProfileV1Schema,
  KernelPerfReceiptV1Schema,
  promoteHardwareSpecializationV1,
} from './hardware-specialization-v1.js';

const problem = { operation: 'gemm' as const, m: 128, n: 768, k: 64, batch_size: 1 };
const config = {
  kernel_id: 'atlas_feature_projection:sm86:1',
  backend: 'cutile' as const,
  architecture_target: 'sm_86' as const,
  precision: 'bf16' as const,
  accumulator_precision: 'fp32' as const,
};

describe('hardware specialization estimator gates', () => {
  it('accepts an RTX 3060 Ti sm_86 profile', () => {
    const profile = HardwareProfileV1Schema.parse({
      schema_version: 'atlas.hardware-profile.v1',
      profile_id: 'gpu:rtx3060ti:sm86',
      device_name: 'NVIDIA GeForce RTX 3060 Ti',
      architecture: 'sm_86',
      compute_capability_major: 8,
      compute_capability_minor: 6,
      vram_total_bytes: 8 * 1024 * 1024 * 1024,
      vram_source: 'nvml',
      capabilities: { fp16:true, bf16:true, tf32:true, int8:true, fp8:false, fp4:false },
      observed_at: '2026-08-22T00:00:00.000Z',
      producer_revision: 'test',
    });
    expect(profile.architecture).toBe('sm_86');
  });

  it('rejects CUTLASS official heuristic as an sm_86 estimator', () => {
    expect(() => KernelPerfReceiptV1Schema.parse({
      schema_version: 'atlas.kernel-perf-receipt.v1',
      receipt_id: 'estimate:cutlass:sm86',
      target_profile_id: 'gpu:rtx3060ti:sm86',
      measurement_kind: 'analytical_estimate',
      estimator: {
        kind: 'CUTLASS_HEURISTIC',
        supported_target: false,
        estimator_revision: 'nvidia-matmul-heuristics@current',
      },
      measured_architecture: 'sm_86',
      problem,
      configuration: { ...config, backend: 'cutlass' },
      parity: { reference_backend: 'cublaslt', passed: false },
      observed_at: '2026-08-22T00:00:00.000Z',
      producer_revision: 'test',
    })).toThrow(/CUTLASS_HEURISTIC does not support target sm_86/);
  });

  it('accepts a learned sm_86 cost-model estimate without treating it as target proof', () => {
    const estimate = KernelPerfReceiptV1Schema.parse({
      schema_version: 'atlas.kernel-perf-receipt.v1',
      receipt_id: 'estimate:learned:sm86',
      target_profile_id: 'gpu:rtx3060ti:sm86',
      measurement_kind: 'learned_estimate',
      estimator: {
        kind: 'LEARNED_COST_MODEL',
        supported_target: true,
        estimator_revision: 'sm86-kernel-cost-model-v1',
      },
      measured_architecture: 'sm_86',
      problem,
      configuration: config,
      parity: { reference_backend: 'cublaslt', passed: true },
      observed_at: '2026-08-22T00:00:00.000Z',
      producer_revision: 'cloud-search@test',
    });
    expect(estimate.measurement_kind).toBe('learned_estimate');
    expect(estimate.estimator.kind).toBe('LEARNED_COST_MODEL');
  });

  it('requires real-target receipts to use estimator NONE', () => {
    expect(() => KernelPerfReceiptV1Schema.parse({
      schema_version: 'atlas.kernel-perf-receipt.v1',
      receipt_id: 'bad:real-target:estimator',
      target_profile_id: 'gpu:rtx3060ti:sm86',
      measurement_kind: 'real_target',
      estimator: {
        kind: 'LEARNED_COST_MODEL',
        supported_target: true,
        estimator_revision: 'sm86-kernel-cost-model-v1',
      },
      measured_device_name: 'NVIDIA GeForce RTX 3060 Ti',
      measured_architecture: 'sm_86',
      problem,
      configuration: config,
      latency_us_p50: 12.5,
      parity: { reference_backend: 'cublaslt', passed: true },
      observed_at: '2026-08-22T00:00:00.000Z',
      producer_revision: 'test',
    })).toThrow(/real_target receipts must use estimator kind NONE/);
  });

  it('promotes only parity-passing real target evidence', () => {
    const receipt = KernelPerfReceiptV1Schema.parse({
      schema_version: 'atlas.kernel-perf-receipt.v1',
      receipt_id: 'receipt:3060ti:cutile:1',
      target_profile_id: 'gpu:rtx3060ti:sm86',
      measurement_kind: 'real_target',
      estimator: { kind: 'NONE', supported_target: true, estimator_revision: null },
      measured_device_name: 'NVIDIA GeForce RTX 3060 Ti',
      measured_architecture: 'sm_86',
      problem,
      configuration: config,
      latency_us_p50: 12.5,
      latency_us_p95: 13.1,
      parity: { reference_backend: 'cublaslt', passed: true, max_abs_error: 0.001 },
      observed_at: '2026-08-22T00:00:00.000Z',
      producer_revision: 'local-benchmark@test',
    });

    const promoted = promoteHardwareSpecializationV1({
      candidate: {
        schema_version: 'atlas.hardware-specialization.v1',
        specialization_id: 'specialization:3060ti:1',
        target_profile_id: 'gpu:rtx3060ti:sm86',
        selections: [{
          operation_key: 'atlas_feature_projection',
          problem_family: 'candidate-feature-matrix',
          selected_kernel_id: receipt.configuration.kernel_id,
          backend: receipt.configuration.backend,
          precision: receipt.configuration.precision,
          evidence_receipt_ids: [receipt.receipt_id],
        }],
        candidate_receipt_ids: [receipt.receipt_id],
        created_at: '2026-08-22T00:00:00.000Z',
        producer_revision: 'test',
      },
      receipts: [receipt],
    });

    expect(promoted.status).toBe('TARGET_VALIDATED');
    expect(promoted.validated_real_target_receipt_ids).toEqual([receipt.receipt_id]);
  });
});
