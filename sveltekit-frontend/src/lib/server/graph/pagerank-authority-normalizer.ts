import {
	PageRankAuthorityBatchV2Schema,
	type PageRankAuthorityBatchV2,
} from './pagerank-authority-v2.js';
import type { PageRankExecutionPlanV1, PageRankExecutionReceiptV1 } from './pagerank-execution-contract.js';
import type { RawPageRankScoreV1 } from './pagerank-plan-executor.js';

export function buildPageRankAuthorityBatchV2(input: {
	plan: PageRankExecutionPlanV1;
	receipt: PageRankExecutionReceiptV1;
	scores: readonly RawPageRankScoreV1[];
	producerRevision: string;
}): PageRankAuthorityBatchV2 {
	const { plan, receipt, scores, producerRevision } = input;
	if (receipt.runId !== plan.runId) throw new Error('receipt runId does not match plan');
	if (receipt.projectionHash !== plan.projection.projectionHash) throw new Error('receipt projectionHash does not match plan');
	if (receipt.telemetry.executorId !== plan.executor.executorId) throw new Error('receipt executor does not match plan');
	if (scores.length === 0) throw new Error('cannot normalize an empty PageRank score set');

	const rawSum = scores.reduce((sum, row) => sum + row.score, 0);
	if (!Number.isFinite(rawSum) || rawSum <= 0) throw new Error(`invalid PageRank raw sum '${rawSum}'`);

	const sortedByScore = [...scores].sort((a, b) => a.score - b.score || a.canonicalId.localeCompare(b.canonicalId));
	const percentileById = new Map<string, number>();
	let index = 0;
	while (index < sortedByScore.length) {
		let end = index + 1;
		while (end < sortedByScore.length && sortedByScore[end].score === sortedByScore[index].score) end += 1;
		const averageRank = (index + (end - 1)) / 2;
		const percentile = sortedByScore.length === 1 ? 1 : averageRank / (sortedByScore.length - 1);
		for (let i = index; i < end; i += 1) percentileById.set(sortedByScore[i].canonicalId, percentile);
		index = end;
	}

	const createdAt = receipt.completedAt;
	const records = [...scores]
		.sort((a, b) => a.canonicalId.localeCompare(b.canonicalId))
		.map((row) => {
			const authorityPercentile = percentileById.get(row.canonicalId);
			if (authorityPercentile == null) throw new Error(`missing percentile for '${row.canonicalId}'`);
			return {
				schema: 'atlas.pagerank-authority.v2' as const,
				runId: plan.runId,
				algorithmFamily: plan.algorithmFamily,
				algorithm: plan.algorithm,
				executorId: plan.executor.executorId,
				canonicalId: row.canonicalId,
				packetKey: null,
				sourceRef: null,
				graphRevision: plan.projection.graphRevision,
				projectionRevision: plan.projection.projectionRevision,
				projectionHash: plan.projection.projectionHash,
				projectionName: plan.projection.projectionName,
				pagerankRaw: row.score,
				pagerankL1: row.score / rawSum,
				authorityPercentile,
				authorityNorm: authorityPercentile,
				normalization: 'ATLAS_L1_POSTPROCESS_V1' as const,
				producerRevision,
				createdAt,
			};
		});

	return PageRankAuthorityBatchV2Schema.parse({
		schema: 'atlas.pagerank-authority-batch.v2',
		runId: plan.runId,
		graphRevision: plan.projection.graphRevision,
		projectionRevision: plan.projection.projectionRevision,
		projectionHash: plan.projection.projectionHash,
		projectionName: plan.projection.projectionName,
		normalization: 'ATLAS_L1_POSTPROCESS_V1',
		records,
	});
}
