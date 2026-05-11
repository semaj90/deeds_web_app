import { describe, it, expect, vi, beforeEach } from 'vitest';
import { encodedClusterPrefilter } from './encoded-cluster-prefilter.js';
import { Redis } from 'ioredis';
import { encode768to64 } from '../gpu/encode-768-to-64.js';

// Mock Redis
vi.mock('ioredis', () => {
	const Redis = vi.fn();
	Redis.prototype.hgetall = vi.fn();
	Redis.prototype.disconnect = vi.fn();
	return { Redis };
});

// Mock encoder
vi.mock('../gpu/encode-768-to-64.js', () => ({
	encode768to64: vi.fn()
}));

describe('Encoded Cluster Prefilter', () => {
	const mockCentroids = {
		cluster_0: new Array(64).fill(0.1).map((v, i) => i === 0 ? 0.2 : v).join(','),
		cluster_1: new Array(64).fill(0.5).join(','),
		cluster_2: new Array(64).fill(-0.3).join(',')
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should return top-K clusters based on cosine similarity', async () => {
		const hgetall = Redis.prototype.hgetall as any;
		hgetall.mockResolvedValueOnce(mockCentroids);

		// Mock encoded query to be identical to cluster_1
		(encode768to64 as any).mockResolvedValueOnce(new Float32Array(64).fill(0.5));

		const result = await encodedClusterPrefilter(new Float32Array(768), {
			topK: 2,
			forceEnable: true
		});

		expect(result.applied).toBe(true);
		expect(result.clusterIds[0]).toBe(1); // Cluster 1 should be first
		expect(result.clusterIds.length).toBe(2);
	});

	it('should return applied: false when feature flag is off', async () => {
		const result = await encodedClusterPrefilter(new Float32Array(768), {
			forceEnable: false
		});

		expect(result.applied).toBe(false);
		expect(result.fallbackReason).toBe('feature_flag_off');
	});

	it('should handle missing centroids gracefully', async () => {
		const hgetall = Redis.prototype.hgetall as any;
		hgetall.mockResolvedValueOnce({});
		(encode768to64 as any).mockResolvedValueOnce(new Float32Array(64).fill(0.1));

		const result = await encodedClusterPrefilter(new Float32Array(768), {
			forceEnable: true
		});

		expect(result.applied).toBe(false);
		expect(result.fallbackReason).toBe('centroids_missing');
	});
});
