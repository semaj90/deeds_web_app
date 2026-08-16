import { describe, expect, it } from 'vitest';
import { buildCrossEncoderCacheKeyV1, canReuseCrossEncoderScoreV1 } from './cross-encoder-cache-key.js';

const input = {
	queryHash: 'sha256:q1',
	candidateContentHash: 'sha256:c1',
	modelRevision: 'mxbai-rerank-base-v2@local-1',
	tokenizerRevision: 'mxbai-tokenizer@local-1',
	maxLength: 512,
	scoringRevision: 'cross-encoder-logit-v1',
};

describe('cross-encoder-cache-key', () => {
	it('is deterministic and content/revision addressed', () => {
		const key = buildCrossEncoderCacheKeyV1(input);
		expect(buildCrossEncoderCacheKeyV1({ ...input })).toBe(key);
		expect(buildCrossEncoderCacheKeyV1({ ...input, modelRevision: 'model:2' })).not.toBe(key);
		expect(buildCrossEncoderCacheKeyV1({ ...input, candidateContentHash: 'sha256:c2' })).not.toBe(key);
	});

	it('reuses only exact proven receipts', () => {
		const cacheKey = buildCrossEncoderCacheKeyV1(input);
		expect(canReuseCrossEncoderScoreV1(input, {
			cacheKey,
			score: 0.91,
			modelRevision: input.modelRevision,
			candidateContentHash: input.candidateContentHash,
			queryHash: input.queryHash,
			status: 'proven',
		})).toBe(true);
		expect(canReuseCrossEncoderScoreV1(input, {
			cacheKey,
			score: 0.91,
			modelRevision: input.modelRevision,
			candidateContentHash: input.candidateContentHash,
			queryHash: input.queryHash,
			status: 'failed',
		})).toBe(false);
	});
});
