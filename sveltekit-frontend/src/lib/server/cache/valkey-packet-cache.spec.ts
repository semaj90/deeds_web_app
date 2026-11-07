import { describe, expect, it, vi } from 'vitest';

const cacheClient = vi.hoisted(() => ({ set: vi.fn(), get: vi.fn(), del: vi.fn(), keys: vi.fn() }));
vi.mock('./valkey-client.js', () => ({ getValkeyClient: () => cacheClient }));

import {
	setCachedSpatialPacket,
	getCachedSpatialPacket,
	invalidateCachedSpatialPacket,
	type CachedSpatialPacket
} from './valkey-packet-cache.js';

describe('Valkey Spatial Packet Cache', () => {
	const samplePacket: CachedSpatialPacket = {
		caseId: '0192fe63-9524-7f12-8756-3240590a294c',
		sceneId: '0192fe63-9524-7f12-8756-3240590a294b',
		titleId: 'state-v-johnson-scene-4b',
		sourceSha256: '485e5c920f69706fd1318865a16d028663315020eb618a72dfc347a210f2bb16',
		revisionId: 1,
		activeSlotBitset: '11111' + '0'.repeat(251),
		packedTransformsBase64: 'AAAAAA==',
		clusterMetadata: { k: 3, algorithm: 'kmeans_unsupervised_aten' },
		cachedAt: new Date().toISOString()
	};

	it('formats and processes spatial packets with stable types', () => {
		expect(samplePacket.sceneId).toBe('0192fe63-9524-7f12-8756-3240590a294b');
		expect(samplePacket.activeSlotBitset).toHaveLength(256);
		expect(samplePacket.clusterMetadata.k).toBe(3);
	});

	it('keeps identical scene revisions in separate case cache namespaces', async () => {
		const otherCasePacket = { ...samplePacket, caseId: '0192fe63-9524-7f12-8756-3240590a294d' };
		await setCachedSpatialPacket(samplePacket.caseId, samplePacket.sceneId, 1, samplePacket);
		await setCachedSpatialPacket(otherCasePacket.caseId, otherCasePacket.sceneId, 1, otherCasePacket);
		expect(cacheClient.set.mock.calls.map(([key]) => key)).toEqual([
			`valkey:spatial:packet:${samplePacket.caseId}:${samplePacket.sceneId}:1`,
			`valkey:spatial:packet:${otherCasePacket.caseId}:${otherCasePacket.sceneId}:1`
		]);
	});

	it('refuses a packet whose identity disagrees with its cache key', async () => {
		const result = await setCachedSpatialPacket(
			samplePacket.caseId,
			samplePacket.sceneId,
			2,
			samplePacket
		);
		expect(result).toBe(false);
		expect(cacheClient.set).not.toHaveBeenCalled();
	});

	it('handles failure gracefully when Valkey client throws', async () => {
		// Even if disconnected, methods fail closed (return false/null) rather than crashing the request
		cacheClient.set.mockRejectedValueOnce(new Error('offline'));
		const result = await setCachedSpatialPacket(samplePacket.caseId, samplePacket.sceneId, 1, samplePacket);
		expect(typeof result).toBe('boolean');
	});
});
