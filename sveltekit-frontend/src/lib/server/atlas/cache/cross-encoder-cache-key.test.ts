import { describe, expect, it } from 'vitest';
import {
	buildCrossEncoderCacheKeyV1,
	calibrateCrossEncoderScoreV1,
	canReuseCrossEncoderScoreV1,
} from './cross-encoder-cache-key.js';

const input = {
	queryContentHash: 'sha256:q1',
	candidateContentHash: 'sha256:c1',
	modelRevision: 'mxbai-rerank-base-v2@local-1',
	tokenizerRevision: 'mxbai-tokenizer@local-1',
	maxLength: 512,
	inferenceRevision: 'cross-encoder-logit-v1',
};

describe('cross-encoder-cache-key', () => {
	it('is deterministic and excludes unrelated graph/PageRank state', () => {
		const key = buildCrossEncoderCacheKeyV1(input);
		expect(buildCrossEncoderCacheKeyV1({ ...input })).toBe(key);
		expect(buildCrossEncoderCacheKeyV1({ ...input, modelRevision: 'model:2' })).not.toBe(key);
		expect(buildCrossEncoderCacheKeyV1({ ...input, candidateContentHash: 'sha256:c2' })).not.toBe(key);
		expect(buildCrossEncoderCacheKeyV1({ ...input, inferenceRevision: 'inference:2' })).not.toBe(key);
	});

	it('reuses only exact proven raw-score receipts', () => {
		const cacheKey = buildCrossEncoderCacheKeyV1(input);
		const receipt = {
			schema: 'atlas.cross-encoder-score-receipt.v1' as const,
			cacheKey,
			rawScore: 7.2,
			modelRevision: input.modelRevision,
			tokenizerRevision: input.tokenizerRevision,
			inferenceRevision: input.inferenceRevision,
			candidateContentHash: input.candidateContentHash,
			queryContentHash: input.queryContentHash,
			latencyMs: 4.5,
			status: 'proven' as const,
		};
		expect(canReuseCrossEncoderScoreV1(input, receipt)).toBe(true);
		expect(canReuseCrossEncoderScoreV1(input, { ...receipt, status: 'failed' })).toBe(false);
	});

	it('recalibrates cached raw scores without changing the inference key', () => {
		const key = buildCrossEncoderCacheKeyV1(input);
		const probability = calibrateCrossEncoderScoreV1(2, {
			schema: 'atlas.cross-encoder-calibration.v1',
			calibrationRevision: 'calibration:platt:1',
			method: 'platt',
			parameters: { a: 0.5, b: -0.25 },
		});
		expect(probability).toBeGreaterThan(0);
		expect(probability).toBeLessThan(1);
		expect(buildCrossEncoderCacheKeyV1(input)).toBe(key);
	});
});
