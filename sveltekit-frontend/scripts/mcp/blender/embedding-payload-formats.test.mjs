import test from 'node:test';
import assert from 'node:assert/strict';
import { embeddingPayloadBytes } from './embedding-payload-formats.mjs';

test('computes exact payload-only byte counts for the 768d representation examples', () => {
	assert.equal(embeddingPayloadBytes('FP32', 768), 3072);
	assert.equal(embeddingPayloadBytes('FP16', 768), 1536);
	assert.equal(embeddingPayloadBytes('BF16', 768), 1536);
	assert.equal(embeddingPayloadBytes('INT8', 768), 768);
	assert.equal(embeddingPayloadBytes('PACKED_INT4', 768), 384);
	assert.equal(embeddingPayloadBytes('PACKED_2BIT', 768), 192);
	assert.equal(embeddingPayloadBytes('FP8_STORAGE_ONLY', 768), 768);
});

test('rounds packed representations up for non-byte-aligned dimensions', () => {
	assert.equal(embeddingPayloadBytes('PACKED_INT4', 3), 2);
	assert.equal(embeddingPayloadBytes('PACKED_2BIT', 3), 1);
});

test('rejects unsupported formats and out-of-range dimensions', () => {
	assert.throws(() => embeddingPayloadBytes('FP8', 768), /unsupported/);
	assert.throws(() => embeddingPayloadBytes('FP16', 0), /dimensions/);
	assert.throws(() => embeddingPayloadBytes('FP16', 65_537), /dimensions/);
});
