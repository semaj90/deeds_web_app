import { z } from 'zod';

export const GpuRuntimeAbiV1Schema = z.object({
	 schema: z.literal('atlas.gpu-runtime-abi.v1'),
	 runtime_id: z.string().min(1),
	 gpu_name: z.string().min(1),
	 compute_capability: z.string().regex(/^sm\d+$/),
	 driver_version: z.string().min(1),
	 system_toolkit_version: z.string().min(1),
	 compiler_toolkit_version: z.string().min(1).nullable(),
	 framework: z.enum(['pytorch', 'libtorch', 'cuda_python', 'cugraph', 'cutlass', 'cutile']),
	 framework_version: z.string().min(1),
	 framework_cuda_runtime_version: z.string().min(1).nullable(),
	 node_api: z.object({
		 addon_name: z.string().min(1),
		 node_abi: z.string().min(1),
		 abi_stable: z.boolean(),
	}),
	 libtorch: z.object({
		 mode: z.enum(['VERSION_PINNED', 'LIMITED_STABLE_ABI', 'NOT_USED']),
		 version: z.string().min(1).nullable(),
		 stable_subset_only: z.boolean(),
	}),
	 cutile: z.object({
		 version: z.string().min(1).nullable(),
		 target_supported: z.boolean(),
		 toolkit_minimum: z.string().min(1).nullable(),
	}),
	 shared_memory: z.object({
		 bytes: z.number().int().nonnegative().nullable(),
		 registers_per_thread: z.number().int().nonnegative().nullable(),
		 workspace_bytes: z.number().int().nonnegative().nullable(),
	}),
	 checkpointing: z.object({
		 enabled: z.boolean(),
		policy: z.enum(['OFF', 'RECOMPUTE_BOUNDED', 'UNKNOWN']),
	}),
	 real_target_execution: z.boolean(),
	 numerical_parity_passed: z.boolean(),
	 canonical_authority: z.literal(false),
});

export type GpuRuntimeAbiV1 = z.infer<typeof GpuRuntimeAbiV1Schema>;

export function assertGpuRuntimeAbiPromotion(input: unknown): GpuRuntimeAbiV1 {
	const receipt = GpuRuntimeAbiV1Schema.parse(input);
	if (!receipt.real_target_execution || !receipt.numerical_parity_passed) {
		throw new Error('GPU_RUNTIME_ABI_REQUIRES_REAL_TARGET_PARITY');
	}
	if (receipt.framework === 'cutile' && !receipt.cutile.target_supported) {
		throw new Error('CUTILE_TARGET_UNSUPPORTED');
	}
	return receipt;
}
