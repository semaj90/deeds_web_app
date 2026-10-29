import { describe, expect, it, vi } from 'vitest';
import { createRetargetAssetFetchCacheV1 } from './retarget-asset-fetch-cache-v1.js';

describe('retarget asset fetch cache', () => {
	it('fetches repeated clip URLs once and gives each consumer a fresh buffer', async () => {
		const bytes = new Uint8Array([1, 2, 3]).buffer;
		const fetchAsset = vi.fn(async () => ({ ok: true, arrayBuffer: async () => bytes }));
		const cache = createRetargetAssetFetchCacheV1(fetchAsset);

		const first = await cache.fetch('/walk.glb');
		const firstBytes = await first.arrayBuffer();
		new Uint8Array(firstBytes)[0] = 9;
		const second = await cache.fetch('/walk.glb');
		const secondBytes = await second.arrayBuffer();

		expect(fetchAsset).toHaveBeenCalledTimes(1);
		expect(new Uint8Array(secondBytes)[0]).toBe(1);
		expect(cache.size()).toBe(1);
	});

	it('does not cache failed responses or rejected fetches', async () => {
		const fetchAsset = vi.fn()
			.mockResolvedValueOnce({ ok: false, arrayBuffer: async () => new ArrayBuffer(0) })
			.mockRejectedValueOnce(new Error('offline'))
			.mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) });
		const cache = createRetargetAssetFetchCacheV1(fetchAsset);

		expect((await cache.fetch('/clip.glb')).ok).toBe(false);
		await expect(cache.fetch('/clip.glb')).rejects.toThrow('offline');
		expect((await cache.fetch('/clip.glb')).ok).toBe(true);
		expect(fetchAsset).toHaveBeenCalledTimes(3);
		expect(cache.size()).toBe(1);
	});
});
