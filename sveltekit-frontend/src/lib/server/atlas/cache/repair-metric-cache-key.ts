import { createHash } from 'node:crypto';

export interface RepairMetricCacheKeyV1Input {
	evalExampleRevision: string;
	programRevision: string;
	modelRevision: string;
	receiptHash: string;
}

export function buildRepairMetricCacheKeyV1(input: RepairMetricCacheKeyV1Input): string {
	if (!input.evalExampleRevision?.trim()) throw new Error('evalExampleRevision must be non-empty');
	if (!input.programRevision?.trim()) throw new Error('programRevision must be non-empty');
	if (!input.modelRevision?.trim()) throw new Error('modelRevision must be non-empty');
	if (!input.receiptHash?.trim()) throw new Error('receiptHash must be non-empty');

	const canonical = JSON.stringify({
		evalExampleRevision: input.evalExampleRevision.trim(),
		modelRevision: input.modelRevision.trim(),
		programRevision: input.programRevision.trim(),
		receiptHash: input.receiptHash.trim(),
	});
	const digest = createHash('sha256').update(canonical).digest('hex');
	return `atlas:repair-metric:v1:${digest}`;
}

export interface CachedRepairMetricResultV1 {
	cacheKey: string;
	score: number;
	feedback: string;
	evalExampleRevision: string;
	programRevision: string;
	modelRevision: string;
	receiptHash: string;
}

export function canReuseRepairMetricResultV1(
	input: RepairMetricCacheKeyV1Input,
	cached: CachedRepairMetricResultV1 | null | undefined,
): boolean {
	return Boolean(
		cached &&
		Number.isFinite(cached.score) &&
		cached.cacheKey === buildRepairMetricCacheKeyV1(input) &&
		cached.evalExampleRevision === input.evalExampleRevision.trim() &&
		cached.programRevision === input.programRevision.trim() &&
		cached.modelRevision === input.modelRevision.trim() &&
		cached.receiptHash === input.receiptHash.trim(),
	);
}
