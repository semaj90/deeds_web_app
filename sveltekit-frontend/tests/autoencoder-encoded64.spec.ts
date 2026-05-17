// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks (must be referenced inside vi.mock factories) ───────────
const mockHgetall = vi.hoisted(() => vi.fn());
const mockHget    = vi.hoisted(() => vi.fn());
const mockAutoencoderEncode2Layer = vi.hoisted(() => vi.fn());

vi.mock('$lib/server/redis.js', () => ({
	getRedis: () => ({ hgetall: mockHgetall, hget: mockHget }),
}));

vi.mock('$lib/server/gpu/topology-projection.js', () => ({
	autoencoderEncode2Layer: mockAutoencoderEncode2Layer,
}));

// ── Weight shape constants ─────────────────────────────────────────────────
const W1_SIZE = 256 * 768;  // 196,608
const B1_SIZE = 256;
const W2_SIZE = 64  * 256;  // 16,384
const B2_SIZE = 64;

function makeWeightCsv(n: number): string {
	return Array.from({ length: n }, (_, i) => ((i % 100) * 0.001).toFixed(6)).join(',');
}

const VALID_WEIGHTS = {
	W1: makeWeightCsv(W1_SIZE),
	b1: makeWeightCsv(B1_SIZE),
	W2: makeWeightCsv(W2_SIZE),
	b2: makeWeightCsv(B2_SIZE),
};

const TRAINED_AT_V1 = '2026-05-11T12:00:00.000Z';
const TRAINED_AT_V2 = '2026-05-12T00:00:00.000Z';

const VALID_META_V1 = { trainedAt: TRAINED_AT_V1, bestLoss: '0.042' };
const VALID_META_V2 = { trainedAt: TRAINED_AT_V2, bestLoss: '0.038' };

// Reset module registry + all mocks before each test for clean state.
beforeEach(() => {
	vi.resetModules();
	vi.resetAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────
// autoencoder-weights
// ─────────────────────────────────────────────────────────────────────────
describe('autoencoder-weights', () => {
	it('loadAutoencoderWeights: parses valid Redis weights with correct shapes', async () => {
		mockHgetall
			.mockResolvedValueOnce(VALID_WEIGHTS)
			.mockResolvedValueOnce(VALID_META_V1);

		const { loadAutoencoderWeights } = await import('$lib/server/gpu/autoencoder-weights.js');
		const w = await loadAutoencoderWeights();

		expect(w.W1).toBeInstanceOf(Float32Array);
		expect(w.W1.length).toBe(W1_SIZE);
		expect(w.b1.length).toBe(B1_SIZE);
		expect(w.W2.length).toBe(W2_SIZE);
		expect(w.b2.length).toBe(B2_SIZE);
		expect(w.trainedAt).toBe(TRAINED_AT_V1);
		expect(w.bestLoss).toBeCloseTo(0.042);
	});

	it('loadAutoencoderWeights: throws when W1 missing from Redis', async () => {
		mockHgetall
			.mockResolvedValueOnce({}) // empty weights hash
			.mockResolvedValueOnce(VALID_META_V1);

		const { loadAutoencoderWeights } = await import('$lib/server/gpu/autoencoder-weights.js');
		await expect(loadAutoencoderWeights()).rejects.toThrow(
			'Autoencoder weights or metadata missing in Redis'
		);
	});

	it('loadAutoencoderWeights: throws when trainedAt missing from meta', async () => {
		mockHgetall
			.mockResolvedValueOnce(VALID_WEIGHTS)
			.mockResolvedValueOnce({ bestLoss: '0.05' }); // no trainedAt

		const { loadAutoencoderWeights } = await import('$lib/server/gpu/autoencoder-weights.js');
		await expect(loadAutoencoderWeights()).rejects.toThrow(
			'Autoencoder weights or metadata missing in Redis'
		);
	});

	it('probeAutoencoderWeights: returns ok:true and shapeOk:true for valid weights', async () => {
		mockHgetall
			.mockResolvedValueOnce(VALID_WEIGHTS)
			.mockResolvedValueOnce(VALID_META_V1);

		const { probeAutoencoderWeights } = await import('$lib/server/gpu/autoencoder-weights.js');
		const result = await probeAutoencoderWeights();

		expect(result.ok).toBe(true);
		expect(result.shapeOk).toBe(true);
		expect(result.trainedAt).toBe(TRAINED_AT_V1);
		expect(result.loss).toBeCloseTo(0.042);
	});

	it('probeAutoencoderWeights: returns ok:false when Redis is unavailable', async () => {
		mockHgetall.mockRejectedValue(new Error('ECONNREFUSED'));

		const { probeAutoencoderWeights } = await import('$lib/server/gpu/autoencoder-weights.js');
		const result = await probeAutoencoderWeights();

		expect(result.ok).toBe(false);
		expect(result.shapeOk).toBe(false);
		expect(result.trainedAt).toBeNull();
		expect(result.reason).toMatch(/ECONNREFUSED/);
	});

	it('getCachedAutoencoderWeights: returns same instance on second call (cache hit)', async () => {
		mockHgetall
			.mockResolvedValueOnce(VALID_WEIGHTS)
			.mockResolvedValueOnce(VALID_META_V1);
		mockHget.mockResolvedValue(TRAINED_AT_V1); // ETag probe: same version

		const { getCachedAutoencoderWeights } = await import('$lib/server/gpu/autoencoder-weights.js');
		const first  = await getCachedAutoencoderWeights();
		const second = await getCachedAutoencoderWeights();

		// loadAutoencoderWeights (hgetall×2) called only once
		expect(mockHgetall).toHaveBeenCalledTimes(2);
		expect(second).toBe(first); // same object reference
	});

	it('getCachedAutoencoderWeights: invalidates cache when Redis trainedAt changes', async () => {
		// First load
		mockHgetall
			.mockResolvedValueOnce(VALID_WEIGHTS)
			.mockResolvedValueOnce(VALID_META_V1);
		mockHget.mockResolvedValueOnce(TRAINED_AT_V2); // ETag: different → invalidate

		// Re-fetch after invalidation
		mockHgetall
			.mockResolvedValueOnce(VALID_WEIGHTS)
			.mockResolvedValueOnce(VALID_META_V2);

		const { getCachedAutoencoderWeights } = await import('$lib/server/gpu/autoencoder-weights.js');
		const first  = await getCachedAutoencoderWeights();   // loads from Redis (v1)
		const second = await getCachedAutoencoderWeights();   // ETag differs → reload (v2)

		expect(first.trainedAt).toBe(TRAINED_AT_V1);
		expect(second.trainedAt).toBe(TRAINED_AT_V2);
		// hgetall called 4× total (2 for first load, 2 for re-fetch)
		expect(mockHgetall).toHaveBeenCalledTimes(4);
	});
});

// ─────────────────────────────────────────────────────────────────────────
// encode-768-to-64
// ─────────────────────────────────────────────────────────────────────────
describe('encode-768-to-64', () => {
	function setupWeights() {
		mockHgetall
			.mockResolvedValueOnce(VALID_WEIGHTS)
			.mockResolvedValueOnce(VALID_META_V1);
		mockHget.mockResolvedValue(TRAINED_AT_V1);
	}

	it('encode768to64: returns Float32Array of length 64 for a single 768d input', async () => {
		setupWeights();
		mockAutoencoderEncode2Layer
			.mockResolvedValueOnce({ ok: true, projected: new Float32Array(64).fill(0.05), source: 'cpu' });

		const { encode768to64 } = await import('$lib/server/gpu/encode-768-to-64.js');
		const result = await encode768to64(new Float32Array(768).fill(0.5));

		expect(result).toBeInstanceOf(Float32Array);
		expect(result.length).toBe(64);
		expect(mockAutoencoderEncode2Layer).toHaveBeenCalledTimes(1);
	});

	it('encode768to64: Layer 1 and Layer 2 are executed in a single 2-layer call', async () => {
		setupWeights();
		mockAutoencoderEncode2Layer
			.mockResolvedValueOnce({ ok: true, projected: new Float32Array(64).fill(0.05), source: 'cpu' });

		const { encode768to64 } = await import('$lib/server/gpu/encode-768-to-64.js');
		await encode768to64(new Float32Array(768).fill(0.3));

		const [call1] = mockAutoencoderEncode2Layer.mock.calls;
		expect(call1[2]).toMatchObject({ n: 1, dim: 768 });
	});

	it('encode768to64: CPU fallback works (preferGpu: false)', async () => {
		setupWeights();
		mockAutoencoderEncode2Layer
			.mockResolvedValueOnce({ ok: true, projected: new Float32Array(64).fill(0.05), source: 'cpu' });

		const { encode768to64 } = await import('$lib/server/gpu/encode-768-to-64.js');
		const result = await encode768to64(new Float32Array(768).fill(0.3), { preferGpu: false });

		expect(result.length).toBe(64);
		const [call1] = mockAutoencoderEncode2Layer.mock.calls;
		expect(call1[2]).toMatchObject({ preferGpu: false });
	});

	it('encode768to64: throws "Autoencoder 2-layer encode failed" when Layer ok:false', async () => {
		setupWeights();
		mockAutoencoderEncode2Layer
			.mockResolvedValueOnce({ ok: false, projected: new Float32Array(0), source: 'cpu' });

		const { encode768to64 } = await import('$lib/server/gpu/encode-768-to-64.js');
		await expect(encode768to64(new Float32Array(768).fill(0.5))).rejects.toThrow(
			'Autoencoder 2-layer encode failed'
		);
	});

	it('encode768to64Batch: returns n×64 encoded matrix and correct metadata', async () => {
		const n = 4;
		setupWeights();
		mockAutoencoderEncode2Layer
			.mockResolvedValueOnce({ ok: true, projected: new Float32Array(n * 64).fill(0.05), source: 'gpu' });

		const { encode768to64Batch } = await import('$lib/server/gpu/encode-768-to-64.js');
		const result = await encode768to64Batch(new Float32Array(n * 768).fill(0.5), n);

		expect(result.encoded).toBeInstanceOf(Float32Array);
		expect(result.encoded.length).toBe(n * 64);
		expect(result.n).toBe(n);
		expect(result.durationMs).toBeGreaterThanOrEqual(0);
		expect(result.gpuPath).toBe(true);
	});

	it('No Redis writes occur during encode768to64', async () => {
		const mockSet  = vi.fn();
		const mockHset = vi.fn();
		vi.doMock('$lib/server/redis.js', () => ({
			getRedis: () => ({ hgetall: mockHgetall, hget: mockHget, set: mockSet, hset: mockHset }),
		}));

		setupWeights();
		mockAutoencoderEncode2Layer
			.mockResolvedValueOnce({ ok: true, projected: new Float32Array(64).fill(0.05), source: 'cpu' });

		const { encode768to64 } = await import('$lib/server/gpu/encode-768-to-64.js');
		await encode768to64(new Float32Array(768).fill(0.5));

		expect(mockSet).not.toHaveBeenCalled();
		expect(mockHset).not.toHaveBeenCalled();
	});
});
