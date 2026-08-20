import { createHash } from 'node:crypto';

export interface CrossEncoderCacheKeyV1Input {
	queryHash: string;
	candidateContentHash: string;
	modelRevision: string;
	tokenizerRevision: string;
	maxLength: number;
	scoringRevision: string;
}

export function buildCrossEncoderCacheKeyV1(input: CrossEncoderCacheKeyV1Input): string {
	if (!Number.isInteger(input.maxLength) || input.maxLength <= 0) throw new Error('maxLength must be a positive integer');
	const canonical = JSON.stringify({
		candidateContentHash: input.candidateContentHash,
		maxLength: input.maxLength,
		modelRevision: input.modelRevision,
		queryHash: input.queryHash,
		scoringRevision: input.scoringRevision,
		tokenizerRevision: input.tokenizerRevision,
	});
	const digest = createHash('sha256').update(canonical).digest('hex');
	return `atlas:cross-encoder:v1:${digest}`;
}

export interface CrossEncoderScoreReceiptV1 {
	cacheKey: string;
	score: number;
	modelRevision: string;
	candidateContentHash: string;
	queryHash: string;
	status: 'proven' | 'failed';
}

export function canReuseCrossEncoderScoreV1(
	input: CrossEncoderCacheKeyV1Input,
	receipt: CrossEncoderScoreReceiptV1 | null | undefined,
): boolean {
	return Boolean(
		receipt
		&& receipt.status === 'proven'
		&& Number.isFinite(receipt.score)
		&& receipt.cacheKey === buildCrossEncoderCacheKeyV1(input)
		&& receipt.modelRevision === input.modelRevision
		&& receipt.candidateContentHash === input.candidateContentHash
		&& receipt.queryHash === input.queryHash,
	);
}
