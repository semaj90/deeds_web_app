import { describe, expect, it } from 'vitest';
import {
	buildCrossEncoderCacheKeyV1,
	type CrossEncoderCacheKeyV1Input,
	type CrossEncoderScoreReceiptV1,
} from './cross-encoder-cache-key.js';
import {
	buildCrossEncoderCacheEntryV1,
	buildDailyTelemetryReceiptV1,
	createCacheTelemetryCounterV1,
	parseCrossEncoderCacheEntryV1,
	resolveCrossEncoderCacheScoreV1,
	serializeCrossEncoderCacheEntryV1,
} from './cross-encoder-cache-adapter-v1.js';

describe('cross-encoder-cache-adapter-v1', () => {
	const keyInput: CrossEncoderCacheKeyV1Input = {
		queryHash: 'sha256:query_test_hash',
		candidateContentHash: 'sha256:candidate_test_hash',
		modelRevision: 'bge-reranker-v2',
		tokenizerRevision: 'bge-tok-v2',
		maxLength: 512,
		scoringRevision: 'calib-v1',
	};

	const cacheKey = buildCrossEncoderCacheKeyV1(keyInput);

	const sampleReceipt: CrossEncoderScoreReceiptV1 = {
		cacheKey,
		score: 0.892,
		modelRevision: 'bge-reranker-v2',
		candidateContentHash: 'sha256:candidate_test_hash',
		queryHash: 'sha256:query_test_hash',
		status: 'proven',
	};

	const baseNow = new Date('2026-10-24T00:00:00.000Z');

	it('builds a valid cache entry with bounded TTL and residency metadata', () => {
		const entry = buildCrossEncoderCacheEntryV1({
			receipt: sampleReceipt,
			ttlSeconds: 3600,
			residency: 'HOT_VALKEY',
			now: baseNow,
		});

		expect(entry.schema).toBe('atlas.cross-encoder-cache-entry.v1');
		expect(entry.residency).toBe('HOT_VALKEY');
		expect(entry.ttlSeconds).toBe(3600);
		expect(entry.createdAt).toBe('2026-10-24T00:00:00.000Z');
		expect(entry.expiresAt).toBe('2026-10-24T01:00:00.000Z');
		expect(entry.receipt.score).toBe(0.892);
	});

	it('serializes and round-trips through JSON cleanly', () => {
		const entry = buildCrossEncoderCacheEntryV1({
			receipt: sampleReceipt,
			ttlSeconds: 7200,
			now: baseNow,
		});

		const raw = serializeCrossEncoderCacheEntryV1(entry);
		const roundtrip = parseCrossEncoderCacheEntryV1(raw);
		expect(roundtrip).toEqual(entry);
	});

	it('resolves cache hits and increments hit telemetry', () => {
		const entry = buildCrossEncoderCacheEntryV1({
			receipt: sampleReceipt,
			ttlSeconds: 3600,
			now: baseNow,
		});

		const telemetry = createCacheTelemetryCounterV1();
		const result = resolveCrossEncoderCacheScoreV1(keyInput, entry, telemetry, baseNow);

		expect(result.hit).toBe(true);
		if (result.hit) {
			expect(result.score).toBe(0.892);
		}
		expect(telemetry.hits).toBe(1);
		expect(telemetry.misses).toBe(0);
		expect(telemetry.invalidated).toBe(0);
	});

	it('records misses when entry is absent', () => {
		const telemetry = createCacheTelemetryCounterV1();
		const result = resolveCrossEncoderCacheScoreV1(keyInput, null, telemetry, baseNow);

		expect(result.hit).toBe(false);
		if (!result.hit) {
			expect(result.reason).toBe('MISS');
		}
		expect(telemetry.hits).toBe(0);
		expect(telemetry.misses).toBe(1);
		expect(telemetry.invalidated).toBe(0);
	});

	it('records invalidation when entry is expired', () => {
		const entry = buildCrossEncoderCacheEntryV1({
			receipt: sampleReceipt,
			ttlSeconds: 60,
			now: baseNow,
		});

		const later = new Date(baseNow.getTime() + 120 * 1000); // 2 minutes later
		const telemetry = createCacheTelemetryCounterV1();
		const result = resolveCrossEncoderCacheScoreV1(keyInput, entry, telemetry, later);

		expect(result.hit).toBe(false);
		if (!result.hit) {
			expect(result.reason).toBe('EXPIRED');
		}
		expect(telemetry.hits).toBe(0);
		expect(telemetry.misses).toBe(0);
		expect(telemetry.invalidated).toBe(1);
	});

	it('records invalidation on key or receipt provenance mismatch', () => {
		const driftedReceipt: CrossEncoderScoreReceiptV1 = {
			...sampleReceipt,
			modelRevision: 'other-model-v3', // mismatch
		};

		const entry = buildCrossEncoderCacheEntryV1({
			receipt: driftedReceipt,
			ttlSeconds: 3600,
			now: baseNow,
		});

		const telemetry = createCacheTelemetryCounterV1();
		const result = resolveCrossEncoderCacheScoreV1(keyInput, entry, telemetry, baseNow);

		expect(result.hit).toBe(false);
		if (!result.hit) {
			expect(result.reason).toBe('INVALIDATED');
		}
		expect(telemetry.invalidated).toBe(1);
	});

	it('summarizes daily cache telemetry with accurate hit rate', () => {
		const telemetry = createCacheTelemetryCounterV1();
		telemetry.hits = 80;
		telemetry.misses = 15;
		telemetry.invalidated = 5;

		const receipt = buildDailyTelemetryReceiptV1(telemetry, '2026-10-24');
		expect(receipt.schema).toBe('atlas.daily-cache-telemetry.v1');
		expect(receipt.date).toBe('2026-10-24');
		expect(receipt.hitRate).toBe(0.8);
		expect(receipt.counter.hits).toBe(80);
	});
});
