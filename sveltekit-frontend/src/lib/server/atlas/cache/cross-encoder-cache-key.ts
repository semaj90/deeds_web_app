import { createHash } from 'node:crypto';

/**
 * Expensive pairwise inference identity. Graph/PageRank/community revisions are
 * intentionally absent: the raw neural score depends only on the text pair and
 * model/tokenizer/inference contract.
 */
export interface CrossEncoderCacheKeyV1Input {
	queryContentHash: string;
	candidateContentHash: string;
	modelRevision: string;
	tokenizerRevision: string;
	maxLength: number;
	inferenceRevision: string;
}

export function buildCrossEncoderCacheKeyV1(input: CrossEncoderCacheKeyV1Input): string {
	if (!Number.isInteger(input.maxLength) || input.maxLength <= 0) throw new Error('maxLength must be a positive integer');
	for (const [name, value] of [
		['queryContentHash', input.queryContentHash],
		['candidateContentHash', input.candidateContentHash],
		['modelRevision', input.modelRevision],
		['tokenizerRevision', input.tokenizerRevision],
		['inferenceRevision', input.inferenceRevision],
	] as const) {
		if (!value.trim()) throw new Error(`${name} is required`);
	}

	const canonical = JSON.stringify({
		candidateContentHash: input.candidateContentHash,
		inferenceRevision: input.inferenceRevision,
		maxLength: input.maxLength,
		modelRevision: input.modelRevision,
		queryContentHash: input.queryContentHash,
		tokenizerRevision: input.tokenizerRevision,
	});
	const digest = createHash('sha256').update(canonical).digest('hex');
	return `atlas:cross-encoder:v1:${digest}`;
}

/** Raw score is cached. Calibration is a cheap independently revisioned step. */
export interface CrossEncoderScoreReceiptV1 {
	schema: 'atlas.cross-encoder-score-receipt.v1';
	cacheKey: string;
	rawScore: number;
	modelRevision: string;
	tokenizerRevision: string;
	inferenceRevision: string;
	candidateContentHash: string;
	queryContentHash: string;
	latencyMs: number;
	status: 'proven' | 'failed';
}

export interface CrossEncoderCalibrationV1 {
	schema: 'atlas.cross-encoder-calibration.v1';
	calibrationRevision: string;
	method: 'sigmoid' | 'platt' | 'isotonic' | 'identity';
	parameters: Readonly<Record<string, number>>;
}

function sigmoid(value: number): number {
	return 1 / (1 + Math.exp(-value));
}

export function calibrateCrossEncoderScoreV1(
	rawScore: number,
	calibration: CrossEncoderCalibrationV1,
): number {
	if (!Number.isFinite(rawScore)) throw new Error('rawScore must be finite');
	if (!calibration.calibrationRevision.trim()) throw new Error('calibrationRevision is required');

	if (calibration.method === 'identity') return Math.max(0, Math.min(1, rawScore));
	if (calibration.method === 'sigmoid') return sigmoid(rawScore);
	if (calibration.method === 'platt') {
		const a = Number(calibration.parameters.a ?? 1);
		const b = Number(calibration.parameters.b ?? 0);
		if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error('Platt parameters must be finite');
		return sigmoid(a * rawScore + b);
	}
	throw new Error('isotonic calibration requires a persisted lookup model; apply it in the calibration executor');
}

export function canReuseCrossEncoderScoreV1(
	input: CrossEncoderCacheKeyV1Input,
	receipt: CrossEncoderScoreReceiptV1 | null | undefined,
): boolean {
	return Boolean(
		receipt
		&& receipt.schema === 'atlas.cross-encoder-score-receipt.v1'
		&& receipt.status === 'proven'
		&& Number.isFinite(receipt.rawScore)
		&& Number.isFinite(receipt.latencyMs)
		&& receipt.latencyMs >= 0
		&& receipt.cacheKey === buildCrossEncoderCacheKeyV1(input)
		&& receipt.modelRevision === input.modelRevision
		&& receipt.tokenizerRevision === input.tokenizerRevision
		&& receipt.inferenceRevision === input.inferenceRevision
		&& receipt.candidateContentHash === input.candidateContentHash
		&& receipt.queryContentHash === input.queryContentHash,
	);
}
