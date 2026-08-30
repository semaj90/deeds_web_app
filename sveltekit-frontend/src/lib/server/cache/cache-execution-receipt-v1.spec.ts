import { describe, expect, it } from 'vitest';

import {
	isCacheExecutionReceiptProvenV1,
	validateCacheExecutionReceiptV1,
	type CacheExecutionReceiptV1
} from './cache-execution-receipt-v1.js';

const checksum = 'a'.repeat(64);
const keyDigest = 'b'.repeat(64);

function fixture(): CacheExecutionReceiptV1 {
	return {
		schema: 'atlas.cache-execution-receipt.v1',
		runId: 'cache-proof-1',
		tier: 'valkey',
		identityChecksum: checksum,
		namespace: 'atlas-lru:v2:e7',
		cacheKeyDigest: keyDigest,
		canonicalAuthority: false,
		events: [
			{ sequence: 1, kind: 'MISS', observedAt: '2026-08-30T00:00:00.000Z', pttlMs: -2 },
			{ sequence: 2, kind: 'COMPUTE', observedAt: '2026-08-30T00:00:00.010Z', payloadChecksum: checksum, latencyMs: 10 },
			{ sequence: 3, kind: 'WRITE', observedAt: '2026-08-30T00:00:00.012Z', payloadChecksum: checksum, latencyMs: 2 },
			{ sequence: 4, kind: 'READBACK_HIT', observedAt: '2026-08-30T00:00:00.013Z', payloadChecksum: checksum, pttlMs: 29_999, latencyMs: 1 },
			{ sequence: 5, kind: 'INVALIDATE', observedAt: '2026-08-30T00:00:00.014Z', latencyMs: 1 },
			{ sequence: 6, kind: 'POST_INVALIDATION_MISS', observedAt: '2026-08-30T00:00:00.015Z', pttlMs: -2, latencyMs: 1 }
		],
		revisions: { workspaceRevision: 'ws-7' },
		telemetry: {
			valkeyHitsObserved: 1,
			valkeyMissesObserved: 2,
			computeMs: 10,
			hitReadMs: 1
		},
		status: 'PROVEN',
		diagnostics: []
	};
}

describe('CacheExecutionReceiptV1', () => {
	it('accepts the exact six-state replay', () => {
		const receipt = fixture();
		expect(validateCacheExecutionReceiptV1(receipt)).toEqual([]);
		expect(isCacheExecutionReceiptProvenV1(receipt)).toBe(true);
	});

	it('fails proof when readback payload differs', () => {
		const receipt = fixture();
		receipt.events[3].payloadChecksum = 'c'.repeat(64);
		expect(validateCacheExecutionReceiptV1(receipt)).toContain('READBACK_CHECKSUM_MISMATCH');
		expect(isCacheExecutionReceiptProvenV1(receipt)).toBe(false);
	});

	it('fails proof when the post-invalidation key still exists', () => {
		const receipt = fixture();
		receipt.events[5].pttlMs = 5000;
		expect(validateCacheExecutionReceiptV1(receipt)).toContain('POST_INVALIDATION_MISS_PTTL_MUST_BE_MINUS_2');
	});
});
