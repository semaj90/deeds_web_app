import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadAutoencoderWeights, probeAutoencoderWeights } from './autoencoder-weights.js';
import { encode768to64 } from './encode-768-to-64.js';
import { Redis } from 'ioredis';

// Mock Redis
vi.mock('ioredis', () => {
	const Redis = vi.fn();
	Redis.prototype.hgetall = vi.fn();
	Redis.prototype.disconnect = vi.fn();
	return { Redis };
});

describe('Autoencoder Weights & Encoding', () => {
	const mockWeights = {
		W1: new Array(256 * 768).fill(0.1).join(','),
		b1: new Array(256).fill(0.01).join(','),
		W2: new Array(64 * 256).fill(0.2).join(','),
		b2: new Array(64).fill(0.02).join(',')
	};

	const mockMeta = {
		trainedAt: '2026-05-11T00:00:00Z',
		bestLoss: '0.05'
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should load weights from Redis', async () => {
		const hgetall = Redis.prototype.hgetall as any;
		hgetall.mockResolvedValueOnce(mockWeights).mockResolvedValueOnce(mockMeta);

		const weights = await loadAutoencoderWeights();

		expect(weights.W1.length).toBe(256 * 768);
		expect(weights.b1.length).toBe(256);
		expect(weights.trainedAt).toBe(mockMeta.trainedAt);
		expect(weights.bestLoss).toBe(0.05);
	});

	it('should pass health probe when weights are valid', async () => {
		const hgetall = Redis.prototype.hgetall as any;
		hgetall.mockResolvedValueOnce(mockWeights).mockResolvedValueOnce(mockMeta);

		const probe = await probeAutoencoderWeights();
		expect(probe.ok).toBe(true);
		expect(probe.shapeOk).toBe(true);
	});

	it('should fail health probe when weights are missing', async () => {
		const hgetall = Redis.prototype.hgetall as any;
		hgetall.mockResolvedValueOnce({}).mockResolvedValueOnce({});

		const probe = await probeAutoencoderWeights();
		expect(probe.ok).toBe(false);
	});

	it('should encode 768d vector to 64d', async () => {
		const hgetall = Redis.prototype.hgetall as any;
		hgetall.mockResolvedValueOnce(mockWeights).mockResolvedValueOnce(mockMeta);

		const input = new Float32Array(768).fill(0.5);
		const encoded = await encode768to64(input, { preferGpu: false });

		expect(encoded.length).toBe(64);
		// Tanh should keep values in [-1, 1]
		encoded.forEach(v => {
			expect(v).toBeGreaterThanOrEqual(-1);
			expect(v).toBeLessThanOrEqual(1);
		});
	});
});
