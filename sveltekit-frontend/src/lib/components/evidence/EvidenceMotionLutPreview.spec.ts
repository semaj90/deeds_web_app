import { cleanup, render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeVideoMotionLutV1 } from '$lib/shared/video-motion-lut-v1.js';

const lodMocks = vi.hoisted(() => ({
	initialize: vi.fn(),
	getDevice: vi.fn(),
	hasTexture: vi.fn(),
	registerTexture: vi.fn(),
	requestTexture: vi.fn(),
	unregisterTexture: vi.fn(),
}));

vi.mock('$lib/webgpu/N64TextureLODSystem.js', () => ({ n64TextureLOD: lodMocks }));

import EvidenceMotionLutPreview from './EvidenceMotionLutPreview.svelte';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => { resolve = done; });
	return { promise, resolve };
}

function fixtureTile(): ArrayBuffer {
	const encoded = encodeVideoMotionLutV1(null, new Uint8Array(64 * 128));
	return encoded.bytes.slice().buffer as ArrayBuffer;
}

describe('EvidenceMotionLutPreview residency lifecycle', () => {
	let oldRequest: ReturnType<typeof deferred<GPUTexture | null>>;
	let newRequest: ReturnType<typeof deferred<GPUTexture | null>>;
	let gpuTexture: { createView: () => object };
	let navigatorGpuDescriptor: PropertyDescriptor | undefined;

	beforeEach(() => {
		vi.clearAllMocks();
		oldRequest = deferred();
		newRequest = deferred();
		gpuTexture = { createView: () => ({}) };
		lodMocks.initialize.mockResolvedValue(true);
		lodMocks.getDevice.mockReturnValue({
			createShaderModule: () => ({}),
			createRenderPipeline: () => ({ getBindGroupLayout: () => ({}) }),
			createBindGroup: () => ({}),
			createCommandEncoder: () => ({
				beginRenderPass: () => ({ setPipeline: vi.fn(), setBindGroup: vi.fn(), draw: vi.fn(), end: vi.fn() }),
				finish: () => ({}),
			}),
			queue: { submit: vi.fn() },
		});
		lodMocks.hasTexture.mockReturnValue(false);
		lodMocks.requestTexture
			.mockReturnValueOnce(oldRequest.promise)
			.mockReturnValueOnce(newRequest.promise);
		navigatorGpuDescriptor = Object.getOwnPropertyDescriptor(navigator, 'gpu');
		Object.defineProperty(navigator, 'gpu', { configurable: true, value: { getPreferredCanvasFormat: () => 'bgra8unorm' } });
		vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((kind: string) => kind === 'webgpu'
			? { configure: vi.fn(), unconfigure: vi.fn(), getCurrentTexture: () => ({ createView: () => ({}) }) }
			: null) as typeof HTMLCanvasElement.prototype.getContext);
		vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			const isNew = url.includes('frame-new');
			return {
				ok: true,
				headers: new Headers({
					'X-Source-Revision': isNew ? 'sha256:new' : 'sha256:old',
					'X-Analysis-Revision': isNew ? 'analysis-new' : 'analysis-old',
					'X-Frame-Timestamp-Ms': isNew ? '2000' : '1000',
				}),
				arrayBuffer: async () => fixtureTile(),
			} as Response;
		}));
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		if (navigatorGpuDescriptor) Object.defineProperty(navigator, 'gpu', navigatorGpuDescriptor);
		else delete (navigator as Navigator & { gpu?: unknown }).gpu;
	});

	it('does not let an aborted old-frame request unregister the newer revision texture', async () => {
		const view = render(EvidenceMotionLutPreview, {
			props: { url: '/frame-old', sourceRevision: 'sha256:old', analysisRevision: 'analysis-old', timestampMs: 1000, motionScore: 0.1 },
		});
		await waitFor(() => expect(lodMocks.requestTexture).toHaveBeenCalledTimes(1));
		const oldTextureId = lodMocks.requestTexture.mock.calls[0]?.[0] as string;

		await view.rerender({ url: '/frame-new', sourceRevision: 'sha256:new', analysisRevision: 'analysis-new', timestampMs: 2000, motionScore: 0.2 });
		await waitFor(() => expect(lodMocks.requestTexture).toHaveBeenCalledTimes(2));
		const newTextureId = lodMocks.requestTexture.mock.calls[1]?.[0] as string;
		expect(newTextureId).not.toBe(oldTextureId);

		oldRequest.resolve(gpuTexture as unknown as GPUTexture);
		await waitFor(() => expect(lodMocks.unregisterTexture).toHaveBeenCalledWith(oldTextureId));
		expect(lodMocks.unregisterTexture).not.toHaveBeenCalledWith(newTextureId);

		newRequest.resolve(gpuTexture as unknown as GPUTexture);
		await waitFor(() => expect(view.container.querySelector('[data-renderer="webgpu"]')).toBeTruthy());
		view.unmount();
		expect(lodMocks.unregisterTexture).toHaveBeenCalledWith(newTextureId);
	});
});
