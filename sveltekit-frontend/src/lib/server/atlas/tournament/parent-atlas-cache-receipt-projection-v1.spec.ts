import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { applyParentAtlasCacheReceiptProjectionV1 } from './parent-atlas-cache-receipt-projection-v1.js';
import { aggregateParentAtlasTournamentReceiptsV1 } from './parent-atlas-tournament-receipt-aggregator-v1.js';

const checksum = 'a'.repeat(64);

function receipt() {
	return {
		schema: 'atlas.cache-execution-receipt.v1',
		runId: 'cache-run-1',
		tier: 'valkey',
		identityChecksum: checksum,
		namespace: 'atlas-lru:v2:e9',
		cacheKeyDigest: 'b'.repeat(64),
		canonicalAuthority: false,
		events: [
			{ sequence: 1, kind: 'MISS', observedAt: '2026-08-30T00:00:00.000Z', pttlMs: -2 },
			{ sequence: 2, kind: 'COMPUTE', observedAt: '2026-08-30T00:00:00.010Z', payloadChecksum: checksum, latencyMs: 10 },
			{ sequence: 3, kind: 'WRITE', observedAt: '2026-08-30T00:00:00.012Z', payloadChecksum: checksum, latencyMs: 2 },
			{ sequence: 4, kind: 'READBACK_HIT', observedAt: '2026-08-30T00:00:00.013Z', payloadChecksum: checksum, pttlMs: 29_999, latencyMs: 1 },
			{ sequence: 5, kind: 'INVALIDATE', observedAt: '2026-08-30T00:00:00.014Z', latencyMs: 1 },
			{ sequence: 6, kind: 'POST_INVALIDATION_MISS', observedAt: '2026-08-30T00:00:00.015Z', pttlMs: -2, latencyMs: 1 }
		],
		revisions: {},
		telemetry: { valkeyHitsObserved: 1, valkeyMissesObserved: 2 },
		status: 'PROVEN',
		diagnostics: []
	};
}

describe('Parent Atlas cache receipt projection', () => {
	it('advances only the matching memory gate from a proven receipt', async () => {
		const root = await mkdtemp(join(tmpdir(), 'atlas-cache-projection-'));
		const reports = join(root, 'docs', 'reports');
		await mkdir(reports, { recursive: true });
		await writeFile(join(reports, 'valkey-cache-execution-receipt-v1.json'), JSON.stringify(receipt()));
		const base = aggregateParentAtlasTournamentReceiptsV1([]);
		const projected = await applyParentAtlasCacheReceiptProjectionV1(root, base);
		expect(projected.gates.find((gate) => gate.id === 'valkey_cache')?.state).toBe('PROVEN');
		expect(projected.gates.find((gate) => gate.id === 'bitfrost_cache')?.state).toBe('UNPROVEN');
		expect(projected.gates.find((gate) => gate.id === 'kv_cache_identity')?.state).toBe('UNPROVEN');
		expect(projected.cacheTelemetry.cacheHitPct).toBeCloseTo(33.33, 2);
	});

	it('does not advance a gate from a failed receipt', async () => {
		const root = await mkdtemp(join(tmpdir(), 'atlas-cache-projection-'));
		const reports = join(root, 'docs', 'reports');
		await mkdir(reports, { recursive: true });
		const failed = receipt();
		failed.status = 'FAILED';
		await writeFile(join(reports, 'valkey-cache-execution-receipt-v1.json'), JSON.stringify(failed));
		const projected = await applyParentAtlasCacheReceiptProjectionV1(root, aggregateParentAtlasTournamentReceiptsV1([]));
		expect(projected.gates.find((gate) => gate.id === 'valkey_cache')?.state).toBe('UNPROVEN');
	});
});
