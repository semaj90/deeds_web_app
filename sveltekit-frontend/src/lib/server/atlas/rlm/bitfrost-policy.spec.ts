import { describe, expect, it } from 'vitest';
import { enableBitfrostTracking, negativeEligibilityKey, readRevisionedBitfrost, writeRevisionedBitfrost } from './bitfrost-policy.js';

function memoryCache(initial: string | null = null) {
	let value = initial;
	return { get: async () => value, set: async (_key: string, next: string) => { value = next; } };
}

describe('revision-safe BitFrost policy', () => {
	it('rejects stale revision envelopes', async () => {
		const cache = memoryCache();
		await writeRevisionedBitfrost(cache, 'key', { packetKey: 'p1' }, 'workspace-r1', 'policy-r1', 30);
		expect(await readRevisionedBitfrost(cache, 'key', 'workspace-r2', 'policy-r1')).toBeNull();
		expect(await readRevisionedBitfrost(cache, 'key', 'workspace-r1', 'policy-r1')).toMatchObject({ value: { packetKey: 'p1' } });
	});

	it('fails open on cache errors and namespaces eligibility by revision', async () => {
		const broken = { get: async () => { throw new Error('Valkey down'); }, set: async () => { throw new Error('Valkey down'); } };
		expect(await readRevisionedBitfrost(broken, 'key', 'r1', 'p1')).toBeNull();
		expect(await writeRevisionedBitfrost(broken, 'key', false, 'r1', 'p1', 30, true)).toBe(false);
		expect(negativeEligibilityKey('r1', 'p1', 'h')).not.toBe(negativeEligibilityKey('r2', 'p1', 'h'));
	});

	it('keeps CLIENT TRACKING opt-in and prefix-scoped', async () => {
		const calls: string[][] = [];
		expect(await enableBitfrostTracking({ call: async (...args) => { calls.push(args); } }, ['bifrost:packet:', 'bifrost:graph:'])).toBe(true);
		expect(calls[0]).toEqual(['CLIENT', 'TRACKING', 'ON', 'BCAST', 'PREFIX', 'bifrost:packet:', 'PREFIX', 'bifrost:graph:']);
	});
});
