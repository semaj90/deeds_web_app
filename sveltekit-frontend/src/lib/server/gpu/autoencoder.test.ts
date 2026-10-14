import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadAutoencoderWeights, probeAutoencoderWeights } from './autoencoder-weights.js';
import { encode768to64 } from './encode-768-to-64.js';
import { Redis } from 'ioredis';

vi.mock('ioredis', () => {
	const Redis = vi.fn();
	Redis.prototype.hgetall = vi.fn();
	Redis.prototype.disconnect = vi.fn();
	Redis.prototype.on = vi.fn();
	return { Redis, default: Redis };
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

	it('rejects unadmitted checkpoint weights before reading Redis', async () => {
		const hgetall = Redis.prototype.hgetall as any;
		hgetall.mockResolvedValueOnce(mockWeights).mockResolvedValueOnce(mockMeta);

		await expect(loadAutoencoderWeights()).rejects.toThrow(/AUTOENCODER_CHECKPOINT_NOT_ADMITTED/);
		expect(hgetall).not.toHaveBeenCalled();
	});

	it('health probe reports the unadmitted checkpoint as unavailable', async () => {
		const hgetall = Redis.prototype.hgetall as any;
		hgetall.mockResolvedValueOnce(mockWeights).mockResolvedValueOnce(mockMeta);

		const probe = await probeAutoencoderWeights();
		expect(probe.ok).toBe(false);
		expect(probe.reason).toMatch(/AUTOENCODER_CHECKPOINT_NOT_ADMITTED/);
		expect(hgetall).not.toHaveBeenCalled();
	});

	it('should fail health probe when weights are missing', async () => {
		const hgetall = Redis.prototype.hgetall as any;
		hgetall.mockResolvedValueOnce({}).mockResolvedValueOnce({});

		const probe = await probeAutoencoderWeights();
		expect(probe.ok).toBe(false);
	});

	it('does not encode with an unadmitted checkpoint', async () => {
		const hgetall = Redis.prototype.hgetall as any;
		hgetall.mockResolvedValueOnce(mockWeights).mockResolvedValueOnce(mockMeta);

		const input = new Float32Array(768).fill(0.5);
		await expect(encode768to64(input, { preferGpu: false })).rejects.toThrow(/AUTOENCODER_CHECKPOINT_NOT_ADMITTED/);
		expect(hgetall).not.toHaveBeenCalled();
	});
});
