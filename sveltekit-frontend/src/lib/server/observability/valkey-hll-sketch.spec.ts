// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
	estimateSnapshotSymbolCoverage,
	formatHllKey,
	type HllClient,
	recordSnapshotSymbolsHLL,
} from './valkey-hll-sketch.js';

class MockHllClient implements HllClient {
	private sets: Map<string, Set<string>> = new Map();
	public expirations: Map<string, number> = new Map();

	async pfadd(key: string, ...elements: string[]): Promise<number> {
		let current = this.sets.get(key);
		if (!current) {
			current = new Set();
			this.sets.set(key, current);
		}
		let altered = 0;
		for (const el of elements) {
			if (!current.has(el)) {
				current.add(el);
				altered = 1;
			}
		}
		return altered;
	}

	async pfcount(...keys: string[]): Promise<number> {
		const union = new Set<string>();
		for (const k of keys) {
			const s = this.sets.get(k);
			if (s) {
				for (const item of s) union.add(item);
			}
		}
		return union.size;
	}

	async expire(key: string, seconds: number): Promise<number> {
		this.expirations.set(key, seconds);
		return 1;
	}
}

describe('Valkey HLL Symbol Breadth Sketch', () => {
	it('formats and sanitizes HLL keys properly', () => {
		expect(formatHllKey('sha256:abc123def456')).toBe('hll:snapshot:sha256:abc123def456:symbols');
		expect(formatHllKey('snap/version@1.0')).toBe('hll:snapshot:snap_version_1_0:symbols');
	});

	it('rejects missing snapshot revisions', async () => {
		const client = new MockHllClient();
		await expect(
			recordSnapshotSymbolsHLL({ client, snapshotRevision: '', symbols: ['sym1'] })
		).rejects.toThrow('SNAPSHOT_REVISION_REQUIRED');

		await expect(
			estimateSnapshotSymbolCoverage({ client, snapshotRevision: '', exactEligibleCount: 10 })
		).rejects.toThrow('SNAPSHOT_REVISION_REQUIRED');
	});

	it('handles empty symbols gracefully without mutating client state', async () => {
		const client = new MockHllClient();
		const res = await recordSnapshotSymbolsHLL({
			client,
			snapshotRevision: 'sha256:1111',
			symbols: [],
		});
		expect(res.altered).toBe(0);
		expect(await client.pfcount(res.key)).toBe(0);
	});

	it('records symbols, sets TTL, and estimates coverage accurately', async () => {
		const client = new MockHllClient();
		const snapRev = 'sha256:6288726b73626ae58905b5ebdea42e709cb1af67b3e16186bcd8b2b88a89d98b';
		const symbols = [
			'stable-symbol:bb2d1972083b2a4b5ea4afba62b3ed6eddf986e5d8bb8ccadfa255ffd336e731',
			'stable-symbol:0fb1521dc5eb2d8084ed56dce5aaa91093a8ed2466bb1c2203171548c9b7ff37',
			'stable-symbol:3333333333333333333333333333333333333333333333333333333333333333',
			'stable-symbol:4444444444444444444444444444444444444444444444444444444444444444',
		];

		const recordRes = await recordSnapshotSymbolsHLL({
			client,
			snapshotRevision: snapRev,
			symbols,
			ttlSeconds: 3600,
		});

		expect(recordRes.altered).toBeGreaterThan(0);
		expect(client.expirations.get(recordRes.key)).toBe(3600);

		const estimate = await estimateSnapshotSymbolCoverage({
			client,
			snapshotRevision: snapRev,
			exactEligibleCount: 10,
		});

		expect(estimate.schema).toBe('atlas.valkey-hll-coverage-estimate.v1');
		expect(estimate.snapshotRevision).toBe(snapRev);
		expect(estimate.hllEstimatedCount).toBe(4);
		expect(estimate.exactEligibleCount).toBe(10);
		expect(estimate.estimatedCoverage).toBe(0.4);
	});

	it('is idempotent on duplicate symbols replay', async () => {
		const client = new MockHllClient();
		const snapRev = 'sha256:idem-test';
		const symbols = ['symA', 'symB', 'symC'];

		await recordSnapshotSymbolsHLL({ client, snapshotRevision: snapRev, symbols });
		const firstCount = (await estimateSnapshotSymbolCoverage({ client, snapshotRevision: snapRev, exactEligibleCount: 6 })).hllEstimatedCount;

		// Replay exact same symbols
		await recordSnapshotSymbolsHLL({ client, snapshotRevision: snapRev, symbols });
		const secondCount = (await estimateSnapshotSymbolCoverage({ client, snapshotRevision: snapRev, exactEligibleCount: 6 })).hllEstimatedCount;

		expect(firstCount).toBe(3);
		expect(secondCount).toBe(3);
	});

	it('maintains strict snapshot isolation across different revisions', async () => {
		const client = new MockHllClient();
		const snap1 = 'sha256:rev-1111';
		const snap2 = 'sha256:rev-2222';

		await recordSnapshotSymbolsHLL({ client, snapshotRevision: snap1, symbols: ['sym1', 'sym2'] });
		await recordSnapshotSymbolsHLL({ client, snapshotRevision: snap2, symbols: ['symA', 'symB', 'symC'] });

		const est1 = await estimateSnapshotSymbolCoverage({ client, snapshotRevision: snap1, exactEligibleCount: 5 });
		const est2 = await estimateSnapshotSymbolCoverage({ client, snapshotRevision: snap2, exactEligibleCount: 5 });

		expect(est1.hllEstimatedCount).toBe(2);
		expect(est2.hllEstimatedCount).toBe(3);
	});

	it('guards against zero exactEligibleCount without NaN or division by zero', async () => {
		const client = new MockHllClient();
		const snap = 'sha256:zero-check';
		await recordSnapshotSymbolsHLL({ client, snapshotRevision: snap, symbols: ['sym1'] });

		const est = await estimateSnapshotSymbolCoverage({ client, snapshotRevision: snap, exactEligibleCount: 0 });
		expect(est.estimatedCoverage).toBe(0);
	});
});
