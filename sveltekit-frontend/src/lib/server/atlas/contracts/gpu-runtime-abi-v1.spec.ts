import { describe, expect, it } from 'vitest';
import { assertGpuRuntimeAbiPromotion, GpuRuntimeAbiV1Schema } from './gpu-runtime-abi-v1.js';

const base = {
	schema: 'atlas.gpu-runtime-abi.v1' as const,
	runtime_id: 'rtx3060ti-sm86-cpu-reference',
	gpu_name: 'NVIDIA GeForce RTX 3060 Ti',
	compute_capability: 'sm86',
	driver_version: '580.88',
	system_toolkit_version: '13.0',
	compiler_toolkit_version: '13.3',
	framework: 'pytorch' as const,
	framework_version: '2.13.0+cu130',
	framework_cuda_runtime_version: '13.0',
	node_api: { addon_name: 'atlas_gpu', node_abi: 'napi-10', abi_stable: true },
	libtorch: { mode: 'VERSION_PINNED' as const, version: '2.13.0', stable_subset_only: false },
	cutile: { version: null, target_supported: false, toolkit_minimum: '13.2' },
	shared_memory: { bytes: null, registers_per_thread: null, workspace_bytes: null },
	checkpointing: { enabled: false, policy: 'OFF' as const },
	real_target_execution: false,
	numerical_parity_passed: false,
	canonical_authority: false as const,
};

describe('GPU runtime ABI v1', () => {
	it('keeps Node ABI separate from LibTorch ABI', () => {
		const parsed = GpuRuntimeAbiV1Schema.parse(base);
		expect(parsed.node_api.abi_stable).toBe(true);
		expect(parsed.libtorch.mode).toBe('VERSION_PINNED');
	});

	it('rejects promotion without real target parity', () => {
		expect(() => assertGpuRuntimeAbiPromotion(base)).toThrow('REAL_TARGET_PARITY');
	});

	it('accepts a parity-passing supported cuTile target', () => {
		const receipt = { ...base, framework: 'cutile' as const, real_target_execution: true, numerical_parity_passed: true,
			cutile: { version: '1.2.0', target_supported: true, toolkit_minimum: '13.2' } };
		expect(assertGpuRuntimeAbiPromotion(receipt).canonical_authority).toBe(false);
	});
});
