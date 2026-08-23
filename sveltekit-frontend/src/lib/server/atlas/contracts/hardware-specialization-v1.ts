import { z } from 'zod';

/**
 * Parent Atlas hardware specialization contracts.
 *
 * Ownership boundary:
 * - model/policy learning may occur on any suitable accelerator;
 * - architecture candidates may be generated or cross-compiled off-target;
 * - measured performance is authoritative only when it comes from the target device;
 * - hardware specialization is derived execution policy, never canonical knowledge truth.
 */

export const HardwareArchitectureSchema = z.enum([
	'sm_80',
	'sm_86',
	'sm_87',
	'sm_88',
	'sm_89',
	'sm_90',
	'sm_90a',
	'sm_100',
	'sm_103',
	'sm_110',
	'sm_120',
	'sm_121',
]);

export const HardwarePrecisionSchema = z.enum([
	'fp32',
	'tf32',
	'bf16',
	'fp16',
	'int8',
	'fp8',
	'fp4',
]);

export const KernelBackendSchema = z.enum([
	'cpu',
	'libtorch',
	'cublas',
	'cublaslt',
	'cutlass',
	'cutile',
	'cuvs',
	'cugraph',
	'tensorrt',
	'tensorrt_llm',
	'tensorrt_rtx',
	'custom_cuda',
]);

export const HardwareMeasurementKindSchema = z.enum([
	'real_target',
	'analytical_estimate',
	'learned_estimate',
	'cross_compile_validation',
]);

export const HardwareProfileV1Schema = z.object({
	schema_version: z.literal('atlas.hardware-profile.v1'),
	profile_id: z.string().min(1),
	device_name: z.string().min(1),
	device_uuid: z.string().min(1).nullable().optional(),
	pci_bus_id: z.string().min(1).nullable().optional(),
	architecture: HardwareArchitectureSchema,
	compute_capability_major: z.number().int().nonnegative(),
	compute_capability_minor: z.number().int().nonnegative(),
	vram_total_bytes: z.number().int().positive(),
	vram_source: z.enum(['cuda_runtime', 'nvml', 'nvidia_smi', 'bridge', 'unknown']),
	driver_version: z.string().min(1).nullable().optional(),
	cuda_runtime_version: z.string().min(1).nullable().optional(),
	libtorch_version: z.string().min(1).nullable().optional(),
	capabilities: z.object({
		fp16: z.boolean(),
		bf16: z.boolean(),
		tf32: z.boolean(),
		int8: z.boolean(),
		fp8: z.boolean(),
		fp4: z.boolean(),
	}),
	observed_at: z.string().datetime(),
	producer_revision: z.string().min(1),
}).superRefine((profile, ctx) => {
	const expected = `sm_${profile.compute_capability_major}${profile.compute_capability_minor}`;
	if (profile.architecture !== expected) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['architecture'],
			message: `architecture ${profile.architecture} does not match compute capability ${profile.compute_capability_major}.${profile.compute_capability_minor}`,
		});
	}
});

export type HardwareProfileV1 = z.infer<typeof HardwareProfileV1Schema>;

export const KernelProblemShapeV1Schema = z.object({
	operation: z.enum([
		'gemm',
		'cosine',
		'attention',
		'topk',
		'pca',
		'projection',
		'knn_exact',
		'ann_search',
		'graph',
	]),
	m: z.number().int().positive().nullable().optional(),
	n: z.number().int().positive().nullable().optional(),
	k: z.number().int().positive().nullable().optional(),
	dimension: z.number().int().positive().nullable().optional(),
	batch_size: z.number().int().positive().default(1),
	candidate_count: z.number().int().nonnegative().nullable().optional(),
});

export const KernelConfigurationV1Schema = z.object({
	kernel_id: z.string().min(1),
	backend: KernelBackendSchema,
	architecture_target: HardwareArchitectureSchema,
	precision: HardwarePrecisionSchema,
	accumulator_precision: HardwarePrecisionSchema.optional(),
	block_m: z.number().int().positive().nullable().optional(),
	block_n: z.number().int().positive().nullable().optional(),
	block_k: z.number().int().positive().nullable().optional(),
	num_warps: z.number().int().positive().nullable().optional(),
	stages: z.number().int().positive().nullable().optional(),
	shared_memory_bytes: z.number().int().nonnegative().nullable().optional(),
	registers_per_thread: z.number().int().nonnegative().nullable().optional(),
	artifact_digest: z.string().min(1).nullable().optional(),
	compiler_revision: z.string().min(1).nullable().optional(),
});

export const KernelPerfReceiptV1Schema = z.object({
	schema_version: z.literal('atlas.kernel-perf-receipt.v1'),
	receipt_id: z.string().min(1),
	target_profile_id: z.string().min(1),
	measurement_kind: HardwareMeasurementKindSchema,
	measured_device_name: z.string().min(1).nullable().optional(),
	measured_architecture: HardwareArchitectureSchema,
	problem: KernelProblemShapeV1Schema,
	configuration: KernelConfigurationV1Schema,
	latency_us_p50: z.number().finite().nonnegative().nullable().optional(),
	latency_us_p95: z.number().finite().nonnegative().nullable().optional(),
	throughput_per_second: z.number().finite().nonnegative().nullable().optional(),
	peak_vram_bytes: z.number().int().nonnegative().nullable().optional(),
	workspace_bytes: z.number().int().nonnegative().nullable().optional(),
	parity: z.object({
		reference_backend: KernelBackendSchema,
		passed: z.boolean(),
		max_abs_error: z.number().finite().nonnegative().nullable().optional(),
		max_rel_error: z.number().finite().nonnegative().nullable().optional(),
	}),
	observed_at: z.string().datetime(),
	producer_revision: z.string().min(1),
}).superRefine((receipt, ctx) => {
	if (receipt.configuration.architecture_target !== receipt.measured_architecture) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['configuration', 'architecture_target'],
			message: 'kernel architecture target must match the architecture represented by the receipt',
		});
	}

	if (receipt.measurement_kind === 'real_target') {
		if (!receipt.measured_device_name) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['measured_device_name'],
				message: 'real_target measurements require the measured device name',
			});
		}
		if (receipt.latency_us_p50 == null) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['latency_us_p50'],
				message: 'real_target measurements require measured latency',
			});
		}
	}
});

export type KernelPerfReceiptV1 = z.infer<typeof KernelPerfReceiptV1Schema>;

export const HardwareSpecializationSelectionV1Schema = z.object({
	operation_key: z.string().min(1),
	problem_family: z.string().min(1),
	selected_kernel_id: z.string().min(1),
	backend: KernelBackendSchema,
	precision: HardwarePrecisionSchema,
	minimum_candidate_count: z.number().int().nonnegative().nullable().optional(),
	maximum_candidate_count: z.number().int().nonnegative().nullable().optional(),
	evidence_receipt_ids: z.array(z.string().min(1)).min(1),
});

export const HardwareSpecializationV1Schema = z.object({
	schema_version: z.literal('atlas.hardware-specialization.v1'),
	specialization_id: z.string().min(1),
	target_profile_id: z.string().min(1),
	workspace_revision: z.string().min(1).nullable().optional(),
	feature_revision: z.string().min(1).nullable().optional(),
	selections: z.array(HardwareSpecializationSelectionV1Schema).min(1),
	validated_real_target_receipt_ids: z.array(z.string().min(1)).default([]),
	candidate_receipt_ids: z.array(z.string().min(1)).default([]),
	status: z.enum(['CANDIDATE', 'TARGET_VALIDATED', 'SUPERSEDED']),
	created_at: z.string().datetime(),
	producer_revision: z.string().min(1),
}).superRefine((specialization, ctx) => {
	if (specialization.status === 'TARGET_VALIDATED' && specialization.validated_real_target_receipt_ids.length === 0) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['validated_real_target_receipt_ids'],
			message: 'TARGET_VALIDATED specialization requires at least one real target receipt',
		});
	}
});

export type HardwareSpecializationV1 = z.infer<typeof HardwareSpecializationV1Schema>;

/**
 * Promote a candidate specialization only when every selected kernel is backed by
 * a parity-passing receipt measured on the declared target profile.
 */
export function promoteHardwareSpecializationV1(input: {
	candidate: Omit<HardwareSpecializationV1, 'status' | 'validated_real_target_receipt_ids'>;
	receipts: KernelPerfReceiptV1[];
}): HardwareSpecializationV1 {
	const receipts = input.receipts.map((receipt) => KernelPerfReceiptV1Schema.parse(receipt));
	const byId = new Map(receipts.map((receipt) => [receipt.receipt_id, receipt]));
	const validated = new Set<string>();

	for (const selection of input.candidate.selections) {
		const matching = selection.evidence_receipt_ids
			.map((id) => byId.get(id))
			.filter((receipt): receipt is KernelPerfReceiptV1 => Boolean(receipt))
			.filter((receipt) =>
				receipt.target_profile_id === input.candidate.target_profile_id &&
				receipt.measurement_kind === 'real_target' &&
				receipt.configuration.kernel_id === selection.selected_kernel_id &&
				receipt.parity.passed
			);

		if (matching.length === 0) {
			throw new Error(`selection ${selection.operation_key} lacks a parity-passing real-target receipt`);
		}
		for (const receipt of matching) validated.add(receipt.receipt_id);
	}

	return HardwareSpecializationV1Schema.parse({
		...input.candidate,
		status: 'TARGET_VALIDATED',
		validated_real_target_receipt_ids: [...validated].sort(),
	});
}
