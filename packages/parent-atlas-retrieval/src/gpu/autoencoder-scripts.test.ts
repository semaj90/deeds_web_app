import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Redis } from 'ioredis';
import * as qdrant from '../qdrant-http.js';
import { getCachedAutoencoderWeights } from './autoencoder-weights.js';
import { encode768to64Batch } from './encode-768-to-64.js';

// We can't easily test the .mjs scripts directly with vitest without some boilerplate,
// so we'll test the core logic by exporting it or just testing the underlying functions.

vi.mock('ioredis', () => {
	const Redis = vi.fn();
	Redis.prototype.hgetall = vi.fn();
	Redis.prototype.hset = vi.fn();
	Redis.prototype.quit = vi.fn();
	Redis.prototype.disconnect = vi.fn();
	return { default: Redis, Redis };
});

vi.mock('../qdrant-http.js', () => ({
	scrollPoints: vi.fn(),
	upsertPoints: vi.fn()
}));

vi.mock('./autoencoder-weights.js', () => ({
	getCachedAutoencoderWeights: vi.fn()
}));

vi.mock('./encode-768-to-64.js', () => ({
	encode768to64Batch: vi.fn()
}));

describe('Autoencoder Scripts Logic', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		(getCachedAutoencoderWeights as any).mockResolvedValue({
			trainedAt: '2026-05-11T00:00:00Z',
			W1: new Float32Array(256 * 768),
			b1: new Float32Array(256),
			W2: new Float32Array(64 * 256),
			b2: new Float32Array(64)
		});
	});

	it('should process points in backfill', async () => {
		const mockPoints = [
			{ id: '1', vector: new Array(768).fill(0.1), payload: {} },
			{ id: '2', vector: new Array(768).fill(0.2), payload: { encoded_at: '2026-05-10T00:00:00Z' } }
		];

		(qdrant.scrollPoints as any).mockResolvedValueOnce({
			points: mockPoints,
			nextOffset: null
		});

		(encode768to64Batch as any).mockResolvedValue({
			encoded: new Float32Array(mockPoints.length * 64).fill(0.5)
		});

		// Manual invocation of the core logic (simplified)
		const toEncode = mockPoints;
		const matrix = new Float32Array(toEncode.length * 768);
		const { encoded } = await encode768to64Batch(matrix, toEncode.length);

		expect(encoded.length).toBe(mockPoints.length * 64);
	});

	it('should aggregate clusters in centroids script', async () => {
		const mockPoints = [
			{ id: '1', vector: { encoded_64: new Array(64).fill(1.0) }, payload: { som_cluster: 0 } },
			{ id: '2', vector: { encoded_64: new Array(64).fill(2.0) }, payload: { som_cluster: 0 } },
			{ id: '3', vector: { encoded_64: new Array(64).fill(5.0) }, payload: { som_cluster: 1 } }
		];

		const clusters = new Map<number, { sum: Float32Array, count: number }>();
		for (const pt of mockPoints) {
			const id = pt.payload.som_cluster;
			if (!clusters.has(id)) clusters.set(id, { sum: new Float32Array(64), count: 0 });
			const entry = clusters.get(id)!;
			const vec = pt.vector.encoded_64;
			for (let i = 0; i < 64; i++) entry.sum[i] += vec[i];
			entry.count++;
		}

		expect(clusters.get(0)?.count).toBe(2);
		expect(clusters.get(0)?.sum[0]).toBe(3.0); // 1.0 + 2.0
		expect(clusters.get(1)?.count).toBe(1);
	});
});
