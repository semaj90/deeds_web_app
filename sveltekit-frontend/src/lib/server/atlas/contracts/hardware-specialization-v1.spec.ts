import { describe, expect, it } from 'vitest';
import {
	HardwareProfileV1Schema,
	KernelPerfReceiptV1Schema,
	promoteHardwareSpecializationV1,
} from './hardware-specialization-v1.js';

describe('hardware-specialization-v1 contracts', () => {
	it('accepts an RTX 3060 Ti sm_86 target profile', () => {
		const profile = HardwareProfileV1Schema.parse({
			schema_version: 'atlas.hardware-profile.v1',
			profile_id: 'gpu:rtx3060ti:sm86',
			device_name: 'NVIDIA GeForce RTX 3060 Ti',
			architecture: 'sm_86',
			compute_capability_major: 8,
			compute_capability_minor: 6,
			vram_total_bytes: 8 * 1024 * 1024 * 1024,
			vram_source: 'nvml',
			driver_version: 'example-driver',
			cuda_runtime_version: '13.0',
			libtorch_version: '2.9.0+cu130',
			capabilities: {
				fp16: true,
				bf16: true,
				tf32: true,
				int8: true,
				fp8: false,
				fp4: false,
			},
			observed_at: '2026-08-15T00:00:00.000Z',
			producer_revision: 'test',
		});

		expect(profile.architecture).toBe('sm_86');
		expect(profile.capabilities.bf16).toBe(true);
	});

	it('rejects an architecture label that disagrees with compute capability', () => {
		expect(() => HardwareProfileV1Schema.parse({
			schema_version: 'atlas.hardware-profile.v1',
			profile_id: 'bad-profile',
			device_name: 'NVIDIA GeForce RTX 3060 Ti',
			architecture: 'sm_89',
			compute_capability_major: 8,
			compute_capability_minor: 6,
			vram_total_bytes: 8 * 1024 * 1024 * 1024,
			vram_source: 'unknown',
			capabilities: {
				fp16: true,
				bf16: true,
				tf32: true,
				int8: true,
				fp8: false,
				fp4: false,
			},
			observed_at: '2026-08-15T00:00:00.000Z',
			producer_revision: 'test',
		})).toThrow(/does not match compute capability/);
	});

	it('keeps a Blackwell-side estimate distinct from a real-target benchmark', () => {
		const estimated = KernelPerfReceiptV1Schema.parse({
			schema_version: 'atlas.kernel-perf-receipt.v1',
			receipt_id: 'receipt:estimate:1',
			target_profile_id: 'gpu:rtx3060ti:sm86',
			measurement_kind: 'learned_estimate',
			measured_architecture: 'sm_86',
			problem: {
				operation: 'gemm',
				m: 4096,
				n: 64,
				k: 16,
				batch_size: 1,
			},
			configuration: {
				kernel_id: 'cutlass:gemm:candidate-17',
				backend: 'cutlass',
				architecture_target: 'sm_86',
				precision: 'bf16',
				accumulator_precision: 'fp32',
				block_m: 128,
				block_n: 64,
				block_k: 16,
				num_warps: 4,
			},
			parity: {
				reference_backend: 'cublaslt',
				passed: true,
			},
			observed_at: '2026-08-15T00:00:00.000Z',
			producer_revision: 'cloud-search@test',
		});

		expect(estimated.measurement_kind).toBe('learned_estimate');
		expect(estimated.latency_us_p50).toBeUndefined();
	});

	it('promotes only a parity-passing receipt measured on the real target', () => {
		const realReceipt = KernelPerfReceiptV1Schema.parse({
			schema_version: 'atlas.kernel-perf-receipt.v1',
			receipt_id: 'receipt:3060ti:gemm:17',
			target_profile_id: 'gpu:rtx3060ti:sm86',
			measurement_kind: 'real_target',
			measured_device_name: 'NVIDIA GeForce RTX 3060 Ti',
			measured_architecture: 'sm_86',
			problem: {
				operation: 'gemm',
				m: 4096,
				n: 64,
				k: 16,
				batch_size: 1,
			},
			configuration: {
				kernel_id: 'cutlass:gemm:candidate-17',
				backend: 'cutlass',
				architecture_target: 'sm_86',
				precision: 'bf16',
				accumulator_precision: 'fp32',
				block_m: 128,
				block_n: 64,
				block_k: 16,
				num_warps: 4,
			},
			latency_us_p50: 31.8,
			latency_us_p95: 33.1,
			peak_vram_bytes: 32 * 1024 * 1024,
			parity: {
				reference_backend: 'cublaslt',
				passed: true,
				max_abs_error: 0.0005,
				max_rel_error: 0.001,
			},
			observed_at: '2026-08-15T00:00:00.000Z',
			producer_revision: 'local-benchmark@test',
		});

		const promoted = promoteHardwareSpecializationV1({
			candidate: {
				schema_version: 'atlas.hardware-specialization.v1',
				specialization_id: 'specialization:3060ti:1',
				target_profile_id: 'gpu:rtx3060ti:sm86',
				workspace_revision: 'workspace:test',
				feature_revision: 'feature:test',
				selections: [{
					operation_key: 'derived_feature_projection',
					problem_family: 'candidate-feature-matrix',
					selected_kernel_id: 'cutlass:gemm:candidate-17',
					backend: 'cutlass',
					precision: 'bf16',
					evidence_receipt_ids: [realReceipt.receipt_id],
				}],
				candidate_receipt_ids: ['receipt:estimate:1', realReceipt.receipt_id],
				created_at: '2026-08-15T00:00:00.000Z',
				producer_revision: 'test',
			},
			receipts: [realReceipt],
		});

		expect(promoted.status).toBe('TARGET_VALIDATED');
		expect(promoted.validated_real_target_receipt_ids).toEqual([realReceipt.receipt_id]);
	});

	it('refuses to promote a learned estimate as target validation', () => {
		const estimate = KernelPerfReceiptV1Schema.parse({
			schema_version: 'atlas.kernel-perf-receipt.v1',
			receipt_id: 'receipt:estimate:only',
			target_profile_id: 'gpu:rtx3060ti:sm86',
			measurement_kind: 'learned_estimate',
			measured_architecture: 'sm_86',
			problem: { operation: 'gemm', m: 4096, n: 64, k: 16, batch_size: 1 },
			configuration: {
				kernel_id: 'cutlass:gemm:candidate-17',
				backend: 'cutlass',
				architecture_target: 'sm_86',
				precision: 'bf16',
			},
			parity: { reference_backend: 'cublaslt', passed: true },
			observed_at: '2026-08-15T00:00:00.000Z',
			producer_revision: 'cloud-search@test',
		});

		expect(() => promoteHardwareSpecializationV1({
			candidate: {
				schema_version: 'atlas.hardware-specialization.v1',
				specialization_id: 'specialization:3060ti:estimate-only',
				target_profile_id: 'gpu:rtx3060ti:sm86',
				selections: [{
					operation_key: 'derived_feature_projection',
					problem_family: 'candidate-feature-matrix',
					selected_kernel_id: 'cutlass:gemm:candidate-17',
					backend: 'cutlass',
					precision: 'bf16',
					evidence_receipt_ids: [estimate.receipt_id],
				}],
				candidate_receipt_ids: [estimate.receipt_id],
				created_at: '2026-08-15T00:00:00.000Z',
				producer_revision: 'test',
			},
			receipts: [estimate],
		})).toThrow(/lacks a parity-passing real-target receipt/);
	});
});
