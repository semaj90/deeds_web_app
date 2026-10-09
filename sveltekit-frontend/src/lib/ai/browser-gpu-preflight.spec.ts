import { describe, expect, it, vi } from 'vitest';
import { preflightBrowserGpu, type BrowserGpuAdapterLike } from './browser-gpu-preflight.js';

function adapter(overrides: Partial<BrowserGpuAdapterLike> = {}): BrowserGpuAdapterLike {
	return {
		features: new Set(['shader-f16']),
		limits: { maxBufferSize: 1_073_741_824, maxStorageBufferBindingSize: 134_217_728 },
		...overrides
	};
}

describe('browser GPU preflight', () => {
	it('returns unavailable when WebGPU is absent or adapter discovery throws', async () => {
		await expect(preflightBrowserGpu({ provider: undefined })).resolves.toEqual({
			status: 'UNAVAILABLE', reason: 'WEBGPU_NOT_PRESENT'
		});
		await expect(preflightBrowserGpu({ provider: { requestAdapter: vi.fn().mockRejectedValue(new Error('blocked')) } }))
			.resolves.toEqual({ status: 'UNAVAILABLE', reason: 'ADAPTER_QUERY_FAILED' });
	});

	it('reports missing compatible adapters and unmet feature or limit requirements', async () => {
		await expect(preflightBrowserGpu({ provider: { requestAdapter: vi.fn().mockResolvedValue(null) } }))
			.resolves.toEqual({ status: 'UNSUPPORTED', reasons: ['NO_COMPATIBLE_ADAPTER'], availableFeatures: [] });
		const result = await preflightBrowserGpu({
			provider: { requestAdapter: vi.fn().mockResolvedValue(adapter()) },
			requiredFeatures: ['shader-f16', 'timestamp-query'],
			requiredLimits: { maxBufferSize: 2_000_000_000 }
		});
		expect(result).toEqual({
			status: 'UNSUPPORTED',
			reasons: ['MISSING_FEATURE:timestamp-query', 'INSUFFICIENT_LIMIT:maxBufferSize'],
			availableFeatures: ['shader-f16']
		});
	});

	it('returns sorted capability evidence without requesting a device', async () => {
		const requestAdapter = vi.fn().mockResolvedValue(adapter());
		const result = await preflightBrowserGpu({
			provider: { requestAdapter },
			requiredFeatures: ['shader-f16'],
			requiredLimits: { maxBufferSize: 1024 }
		});
		expect(result).toEqual({
			status: 'SUPPORTED',
			availableFeatures: ['shader-f16'],
			limits: { maxBufferSize: 1_073_741_824, maxStorageBufferBindingSize: 134_217_728 }
		});
		expect(requestAdapter).toHaveBeenCalledTimes(1);
	});

	it('rejects invalid required-limit declarations', async () => {
		await expect(preflightBrowserGpu({
			provider: { requestAdapter: vi.fn().mockResolvedValue(adapter()) },
			requiredLimits: { maxBufferSize: Number.NaN }
		})).resolves.toMatchObject({ status: 'UNSUPPORTED', reasons: ['INVALID_REQUIRED_LIMIT:maxBufferSize'] });
	});
});
