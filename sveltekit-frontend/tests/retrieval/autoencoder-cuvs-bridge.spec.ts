import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	redisGet: vi.fn(),
	redisMget: vi.fn(),
	grpcHealth: vi.fn(),
	grpcSearch: vi.fn(),
}));

vi.mock('$lib/server/cache.js', () => ({
	getRedisClient: vi.fn(async () => ({
		get: mocks.redisGet,
		mget: mocks.redisMget,
	})),
}));

vi.mock('$lib/server/grpc/turbovec-cuda-client.js', () => ({
	turbovecGrpcHealth: mocks.grpcHealth,
	turbovecGrpcSearch: mocks.grpcSearch,
}));

import { healthCheckStage3, runStage3Prefilter } from '$lib/server/retrieval/autoencoder-cuvs-bridge.js';

describe('autoencoder-cuvs-bridge', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.redisGet.mockImplementation(async (key: string) => {
			if (key === 'ace:autoencoder:weights') {
				return JSON.stringify({
					encoder_W: Array.from({ length: 64 * 768 }, () => 0.001),
					encoder_b: Array.from({ length: 64 }, () => 0),
					encoder_hidden_dim: 64,
				});
			}
			if (key === 'ace:cuvs:index:meta') {
				return JSON.stringify({ n_points: 1, n_dim: 64 });
			}
			return null;
		});
		mocks.redisMget.mockResolvedValue(['packet-123']);
		mocks.grpcHealth.mockResolvedValue({ ok: true, indexed: 1, dim: 64, bits: 4, backend: 'grpc' });
		mocks.grpcSearch.mockResolvedValue({
			backend: 'grpc',
			indexed: 1,
			candidates: [{ id: '42', score: 0.95, clusterId: 7 }],
		});
	});

	it('loads the bridge module and exposes stage-3 functions', () => {
		expect(typeof runStage3Prefilter).toBe('function');
		expect(typeof healthCheckStage3).toBe('function');
	});

	it('returns mapped candidates from the GPU topology lane', async () => {
		const result = await runStage3Prefilter(new Float32Array(768));

		expect(result.candidates).toHaveLength(1);
		expect(result.candidates[0]?.packetKey).toBe('packet-123');
		expect(result.candidates[0]?.rank).toBe(1);
		expect(result.candidates[0]?.distance).toBeCloseTo(0.05, 5);
	});

	it('treats the WSL2 gRPC lane as the stage-3 health gate', async () => {
		const result = await healthCheckStage3();

		expect(result.healthy).toBe(true);
		expect(result.addonLoaded).toBe(true);
		expect(result.indexInRedis).toBe(true);
		expect(result.sampleLatencyMs).toBeGreaterThanOrEqual(0);
	});
});
