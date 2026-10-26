import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ redis: null as any }));

vi.mock('$lib/server/redis.js', () => ({ getRedis: () => mocks.redis }));

import {
	acquireGpuLease,
	getGpuLeaseStatus,
	releaseGpuLease,
	type InferenceBackend
} from './gpu-arbiter.js';

class FakeRedis {
	value: string | null = null;
	evalCalls = 0;

	async get(): Promise<string | null> {
		return this.value;
	}

	async eval(script: string, _keyCount: number, _key: string, ...args: Array<string | number>): Promise<any> {
		this.evalCalls += 1;
		const backend = String(args[0]) as InferenceBackend;
		const leaseId = String(args[1] ?? '');
		if (script.includes("redis.call('SET'")) {
			const now = Number(args[2]);
			const ttlSeconds = Number(args[3]);
			const current = this.value ? JSON.parse(this.value) : null;
			if (current && current.expiresAt > now && (current.backend !== backend || (backend === 'cuvs' && current.leaseId !== leaseId))) return [0, this.value];
			const lease = {
				backend,
				acquiredAt: current?.backend === backend && current.expiresAt > now ? current.acquiredAt : now,
				expiresAt: now + ttlSeconds * 1000,
				leaseId: current?.backend === backend && current.expiresAt > now ? current.leaseId : leaseId
			};
			this.value = JSON.stringify(lease);
			return [1, this.value];
		}
		if (script.includes("redis.call('DEL'")) {
			if (!this.value) return 1;
			const current = JSON.parse(this.value);
			if (current.backend !== backend || (backend === 'cuvs' && current.leaseId !== leaseId)) return 0;
			this.value = null;
			return 1;
		}
		throw new Error('Unexpected Redis script');
	}
}

describe('GPU arbiter lease', () => {
	let redis: FakeRedis;

	beforeEach(() => {
		redis = new FakeRedis();
		mocks.redis = redis;
	});

	it('atomically permits only one active backend, including cuVS', async () => {
		const results = await Promise.all([
			acquireGpuLease('cuvs', 60),
			acquireGpuLease('ollama', 60)
		]);

		expect(results.filter(Boolean)).toHaveLength(1);
		expect(await getGpuLeaseStatus()).toMatchObject({ backend: 'cuvs' });
	});

	it('renews a cuVS lease only with its holder token and releases only that token', async () => {
		const first = await acquireGpuLease('cuvs', 60);
		const renewed = await acquireGpuLease('cuvs', 120, first?.leaseId);

		expect(first).not.toBeNull();
		expect(renewed?.acquiredAt).toBe(first?.acquiredAt);
		expect(await acquireGpuLease('cuvs', 60)).toBeNull();
		expect(await releaseGpuLease('cuvs', '00000000-0000-4000-8000-000000000000')).toBe(false);
		expect(await getGpuLeaseStatus()).toMatchObject({ backend: 'cuvs' });
		expect(await releaseGpuLease('cuvs', first?.leaseId)).toBe(true);
		expect(await getGpuLeaseStatus()).toBeNull();
	});

	it('rejects invalid TTLs without contacting Redis', async () => {
		expect(await acquireGpuLease('cuvs', 0)).toBeNull();
		expect(await acquireGpuLease('cuvs', 3601)).toBeNull();
		expect(redis.evalCalls).toBe(0);
	});
});
