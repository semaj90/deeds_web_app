import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeVideoMotionLutV1, VIDEO_MOTION_COMPACT_LOD_V1 } from '$lib/shared/video-motion-lut-v1.js';

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
			const lod = VIDEO_MOTION_COMPACT_LOD_V1;
			const compact = new URL(url).searchParams.get('lod') === lod.token;
			return {
				ok: true,
				headers: new Headers({
					'X-Source-Revision': isNew ? 'sha256:new' : 'sha256:old',
					'X-Analysis-Revision': isNew ? 'analysis-new' : 'analysis-old',
					'X-Frame-Timestamp-Ms': isNew ? '2000' : '1000',
					...(compact ? { 'X-Motion-LOD': lod.token, 'Content-Type': lod.contentType } : {}),
				}),
				arrayBuffer: async () => compact ? new ArrayBuffer(lod.byteLength) : fixtureTile(),
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

	it('does not describe a first sample as measured zero movement', async () => {
		const view = render(EvidenceMotionLutPreview, {
			props: { url: '/frame-old', sourceRevision: 'sha256:old', analysisRevision: 'analysis-old', timestampMs: 1000, previousTimestampMs: null, motionScore: 0 },
		});
		oldRequest.resolve(gpuTexture as unknown as GPUTexture);
		await waitFor(() => expect(view.getByText('First sample: no comparison frame')).toBeTruthy());
		expect(view.queryByText(/0% change/)).toBeNull();
	});

	it('downloads only the compact tile until full detail is requested', async () => {
		const view = render(EvidenceMotionLutPreview, {
			props: { url: '/frame-old', sourceRevision: 'sha256:old', analysisRevision: 'analysis-old', timestampMs: 1000, motionScore: 0.1 },
		});
		await waitFor(() => expect(lodMocks.requestTexture).toHaveBeenCalledTimes(1));
		const [textureId, lodLevel] = lodMocks.requestTexture.mock.calls[0] as [string, number];
		expect(lodLevel).toBe(3);
		expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toContain('lod=32x64');
		const registered = lodMocks.registerTexture.mock.calls[0]?.[2] as Array<{ level: number; width: number; height: number; data: ArrayBuffer }>;
		expect(registered.map(({ level, width, height, data }) => [level, width, height, data.byteLength])).toEqual([
			[3, 16, 64, 1024],
		]);
		oldRequest.resolve(gpuTexture as unknown as GPUTexture);
		await waitFor(() => expect(view.container.querySelector('[data-renderer="webgpu"]')).toBeTruthy());
		await fireEvent.click(view.getByRole('button', { name: 'Full motion detail' }));
		await waitFor(() => expect(lodMocks.requestTexture).toHaveBeenCalledTimes(2));
		expect(new URL(String(vi.mocked(fetch).mock.calls[1]?.[0])).searchParams.has('lod')).toBe(false);
		const [fullTextureId, fullLod] = lodMocks.requestTexture.mock.calls[1] as [string, number];
		expect(fullLod).toBe(4);
		expect(lodMocks.registerTexture.mock.calls[1]?.[2]).toEqual([
			expect.objectContaining({ level: 4, width: 32, height: 128, data: new ArrayBuffer(4096) }),
		]);
		newRequest.resolve(gpuTexture as unknown as GPUTexture);
		await waitFor(() => expect(view.container.querySelector('[data-renderer="webgpu"]')).toBeTruthy());
		view.unmount();
		expect(lodMocks.unregisterTexture).toHaveBeenCalledWith(textureId);
		expect(lodMocks.unregisterTexture).toHaveBeenCalledWith(fullTextureId);
	});

	it('does not release another viewer’s texture when both show the same frame', async () => {
		const props = { url: '/frame-old', sourceRevision: 'sha256:old', analysisRevision: 'analysis-old', timestampMs: 1000, motionScore: 0.1 };
		const first = render(EvidenceMotionLutPreview, { props });
		const second = render(EvidenceMotionLutPreview, { props });
		await waitFor(() => expect(lodMocks.requestTexture).toHaveBeenCalledTimes(2));
		const firstId = lodMocks.requestTexture.mock.calls[0]?.[0] as string;
		const secondId = lodMocks.requestTexture.mock.calls[1]?.[0] as string;
		expect(firstId).not.toBe(secondId);
		oldRequest.resolve(gpuTexture as unknown as GPUTexture);
		newRequest.resolve(gpuTexture as unknown as GPUTexture);
		await waitFor(() => expect(second.container.querySelector('[data-renderer="webgpu"]')).toBeTruthy());
		first.unmount();
		expect(lodMocks.unregisterTexture).toHaveBeenCalledWith(firstId);
		expect(lodMocks.unregisterTexture).not.toHaveBeenCalledWith(secondId);
		second.unmount();
		expect(lodMocks.unregisterTexture).toHaveBeenCalledWith(secondId);
	});

	it('keeps the latest texture when an earlier request for the same frame finishes late', async () => {
		const lastRequest = deferred<GPUTexture | null>();
		lodMocks.requestTexture.mockReturnValueOnce(lastRequest.promise);
		const firstProps = { url: '/frame-old', sourceRevision: 'sha256:old', analysisRevision: 'analysis-old', timestampMs: 1000, motionScore: 0.1 };
		const secondProps = { url: '/frame-new', sourceRevision: 'sha256:new', analysisRevision: 'analysis-new', timestampMs: 2000, motionScore: 0.2 };
		const view = render(EvidenceMotionLutPreview, { props: firstProps });
		await waitFor(() => expect(lodMocks.requestTexture).toHaveBeenCalledTimes(1));
		await view.rerender(secondProps);
		await waitFor(() => expect(lodMocks.requestTexture).toHaveBeenCalledTimes(2));
		await view.rerender(firstProps);
		await waitFor(() => expect(lodMocks.requestTexture).toHaveBeenCalledTimes(3));
		const firstId = lodMocks.requestTexture.mock.calls[0]?.[0] as string;
		const lastId = lodMocks.requestTexture.mock.calls[2]?.[0] as string;
		expect(firstId).not.toBe(lastId);
		oldRequest.resolve(gpuTexture as unknown as GPUTexture);
		newRequest.resolve(gpuTexture as unknown as GPUTexture);
		await waitFor(() => expect(lodMocks.unregisterTexture).toHaveBeenCalledWith(firstId));
		expect(lodMocks.unregisterTexture).not.toHaveBeenCalledWith(lastId);
		lastRequest.resolve(gpuTexture as unknown as GPUTexture);
		await waitFor(() => expect(view.container.querySelector('[data-renderer="webgpu"]')).toBeTruthy());
		view.unmount();
		expect(lodMocks.unregisterTexture).toHaveBeenCalledWith(lastId);
	});
});
