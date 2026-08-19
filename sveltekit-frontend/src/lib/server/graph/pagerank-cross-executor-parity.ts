import { createHash } from 'node:crypto';
import { z } from 'zod';
import { GraphProjectionSnapshotV1Schema } from './graph-projection-snapshot-v1.js';
import {
	PageRankExecutionPlanV1Schema,
	PageRankExecutorIdSchema,
	PageRankParametersSchema,
	assertPageRankPlanProjection,
} from './pagerank-execution-contract.js';

export const PageRankCrossExecutorParityStatusSchema = z.enum(['PASS', 'FAIL']);

/**
 * Executor-parity coordinate only. `parityNodeKey` is the frozen snapshot's
 * deterministic `graph_node_key`; it is NOT canonical packet/symbol identity.
 */
export const PageRankParityScoreV2Schema = z
	.object({
		parityNodeKey: z.string().min(1),
		score: z.number().finite().nonnegative(),
	})
	.strict();
export type PageRankParityScoreV2 = z.infer<typeof PageRankParityScoreV2Schema>;

export const PageRankCrossExecutorParityReceiptV2Schema = z
	.object({
		schema: z.literal('atlas.pagerank-cross-executor-parity.v2'),
		algorithm: z.literal('pagerank'),
		algorithmRevision: z.string().min(1),
		parameterHash: z.string().min(1),
		parameters: PageRankParametersSchema,
		referenceExecutorId: PageRankExecutorIdSchema,
		challengerExecutorId: PageRankExecutorIdSchema,
		graphRevision: z.string().min(1),
		projectionRevision: z.string().min(1),
		projectionHash: z.string().min(1),
		projectionName: z.string().min(1),
		projectionSnapshotHash: z.string().min(1),
		parityCoordinate: z.literal('graph_node_key'),
		nodeCount: z.number().int().positive(),
		referenceRawOutputHash: z.string().min(1),
		challengerRawOutputHash: z.string().min(1),
		topK: z.number().int().positive(),
		topKOverlap: z.number().min(0).max(1),
		spearmanCorrelation: z.number().min(-1).max(1),
		maxL1Delta: z.number().nonnegative(),
		meanAbsolutePercentileDelta: z.number().nonnegative(),
		thresholds: z
			.object({
				minTopKOverlap: z.number().min(0).max(1),
				minSpearmanCorrelation: z.number().min(-1).max(1),
				maxL1Delta: z.number().nonnegative(),
				maxMeanAbsolutePercentileDelta: z.number().nonnegative(),
			})
			.strict(),
		status: PageRankCrossExecutorParityStatusSchema,
		producerRevision: z.string().min(1),
		generatedAt: z.string().datetime(),
	})
	.strict()
	.superRefine((receipt, ctx) => {
		if (receipt.referenceExecutorId === receipt.challengerExecutorId) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['challengerExecutorId'],
				message: 'cross-executor parity requires two distinct executors',
			});
		}
		if (receipt.parameters.personalization.mode !== 'GLOBAL') {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['parameters', 'personalization'],
				message: 'canonical cuGraph qualification parity currently covers global PageRank only',
			});
		}
		const expectedHash = computePageRankParityParameterHash(receipt.parameters);
		if (receipt.parameterHash !== expectedHash) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['parameterHash'],
				message: `parameterHash mismatch: expected ${expectedHash}`,
			});
		}
		const expectedStatus =
			receipt.topKOverlap >= receipt.thresholds.minTopKOverlap &&
			receipt.spearmanCorrelation >= receipt.thresholds.minSpearmanCorrelation &&
			receipt.maxL1Delta <= receipt.thresholds.maxL1Delta &&
			receipt.meanAbsolutePercentileDelta <= receipt.thresholds.maxMeanAbsolutePercentileDelta
				? 'PASS'
				: 'FAIL';
		if (receipt.status !== expectedStatus) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['status'],
				message: `status must be derived from parity metrics; expected ${expectedStatus}`,
			});
		}
	});
export type PageRankCrossExecutorParityReceiptV2 = z.infer<typeof PageRankCrossExecutorParityReceiptV2Schema>;

export const DEFAULT_PAGERANK_CANONICAL_PARITY_THRESHOLDS_V2 = Object.freeze({
	minTopKOverlap: 0.98,
	minSpearmanCorrelation: 0.999,
	maxL1Delta: 1e-8,
	maxMeanAbsolutePercentileDelta: 1e-4,
});

export interface PageRankParityThresholdsV2 {
	minTopKOverlap: number;
	minSpearmanCorrelation: number;
	maxL1Delta: number;
	maxMeanAbsolutePercentileDelta: number;
}

export function computePageRankParityParameterHash(parametersInput: unknown): string {
	const parameters = PageRankParametersSchema.parse(parametersInput);
	const canonical = {
		dampingFactor: parameters.dampingFactor,
		maxIterations: parameters.maxIterations,
		tolerance: parameters.tolerance,
		relationshipTypes: [...parameters.relationshipTypes].sort(),
		weighted: parameters.weighted,
		relationshipWeightProperty: parameters.relationshipWeightProperty,
		personalization: parameters.personalization,
	};
	return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function parityScores(input: readonly unknown[]): PageRankParityScoreV2[] {
	const rows = input.map((row) => PageRankParityScoreV2Schema.parse(row));
	const ids = new Set<string>();
	for (const row of rows) {
		if (ids.has(row.parityNodeKey)) throw new Error(`duplicate PageRank parityNodeKey '${row.parityNodeKey}'`);
		ids.add(row.parityNodeKey);
	}
	return [...rows].sort((a, b) => a.parityNodeKey.localeCompare(b.parityNodeKey));
}

function hashScores(rows: readonly PageRankParityScoreV2[]): string {
	return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

function l1ById(rows: readonly PageRankParityScoreV2[]): Map<string, number> {
	const total = rows.reduce((sum, row) => sum + row.score, 0);
	if (!(total > 0)) throw new Error('PageRank parity requires a positive score sum');
	return new Map(rows.map((row) => [row.parityNodeKey, row.score / total]));
}

function rankById(rows: readonly PageRankParityScoreV2[]): Map<string, number> {
	const ordered = [...rows].sort((a, b) => a.score - b.score || a.parityNodeKey.localeCompare(b.parityNodeKey));
	const ranks = new Map<string, number>();
	for (let start = 0; start < ordered.length; ) {
		let end = start + 1;
		while (end < ordered.length && ordered[end].score === ordered[start].score) end += 1;
		const averageRank = (start + end - 1) / 2 + 1;
		for (let index = start; index < end; index += 1) ranks.set(ordered[index].parityNodeKey, averageRank);
		start = end;
	}
	return ranks;
}

function percentileById(rows: readonly PageRankParityScoreV2[]): Map<string, number> {
	const ordered = [...rows].sort((a, b) => a.score - b.score || a.parityNodeKey.localeCompare(b.parityNodeKey));
	const denominator = Math.max(ordered.length - 1, 1);
	const percentiles = new Map<string, number>();
	for (let start = 0; start < ordered.length; ) {
		let end = start + 1;
		while (end < ordered.length && ordered[end].score === ordered[start].score) end += 1;
		const percentile = ((start + end - 1) / 2) / denominator;
		for (let index = start; index < end; index += 1) percentiles.set(ordered[index].parityNodeKey, percentile);
		start = end;
	}
	return percentiles;
}

function spearman(reference: readonly PageRankParityScoreV2[], challenger: readonly PageRankParityScoreV2[]): number {
	const referenceRanks = rankById(reference);
	const challengerRanks = rankById(challenger);
	const ids = reference.map((row) => row.parityNodeKey);
	const xs = ids.map((id) => referenceRanks.get(id) as number);
	const ys = ids.map((id) => challengerRanks.get(id) as number);
	const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
	const mx = mean(xs);
	const my = mean(ys);
	let covariance = 0;
	let xSquares = 0;
	let ySquares = 0;
	for (let index = 0; index < ids.length; index += 1) {
		const dx = xs[index] - mx;
		const dy = ys[index] - my;
		covariance += dx * dy;
		xSquares += dx * dx;
		ySquares += dy * dy;
	}
	const denominator = Math.sqrt(xSquares * ySquares);
	if (denominator === 0) return xs.every((value, index) => value === ys[index]) ? 1 : 0;
	return covariance / denominator;
}

function topKOverlap(reference: readonly PageRankParityScoreV2[], challenger: readonly PageRankParityScoreV2[], topK: number): number {
	const top = (rows: readonly PageRankParityScoreV2[]) =>
		[...rows]
			.sort((a, b) => b.score - a.score || a.parityNodeKey.localeCompare(b.parityNodeKey))
			.slice(0, topK)
			.map((row) => row.parityNodeKey);
	const referenceTop = new Set(top(reference));
	const challengerTop = top(challenger);
	return challengerTop.filter((id) => referenceTop.has(id)).length / challengerTop.length;
}

export function buildPageRankCrossExecutorParityReceiptV2(input: {
	plan: unknown;
	snapshot: unknown;
	referenceExecutorId: 'NEO4J_GDS';
	challengerExecutorId: 'CUGRAPH';
	referenceScores: readonly unknown[];
	challengerScores: readonly unknown[];
	topK?: number;
	producerRevision: string;
	generatedAt?: string;
	thresholds?: PageRankParityThresholdsV2;
}): PageRankCrossExecutorParityReceiptV2 {
	const plan = PageRankExecutionPlanV1Schema.parse(input.plan);
	const snapshot = GraphProjectionSnapshotV1Schema.parse(input.snapshot);
	assertPageRankPlanProjection(plan, snapshot.projection);
	if (plan.algorithm !== 'pagerank' || plan.parameters.personalization.mode !== 'GLOBAL') {
		throw new Error('cross-executor canonical qualification currently requires global pagerank');
	}
	const reference = parityScores(input.referenceScores);
	const challenger = parityScores(input.challengerScores);
	if (reference.length !== snapshot.projection.nodeCount || challenger.length !== snapshot.projection.nodeCount) {
		throw new Error(
			`PageRank parity requires full snapshot coverage: expected ${snapshot.projection.nodeCount}, got reference=${reference.length}, challenger=${challenger.length}`,
		);
	}
	for (let index = 0; index < reference.length; index += 1) {
		if (reference[index].parityNodeKey !== challenger[index].parityNodeKey) {
			throw new Error(`PageRank parity coordinate mismatch at sorted index ${index}`);
		}
	}

	const topK = Math.min(input.topK ?? 50, reference.length);
	const referenceL1 = l1ById(reference);
	const challengerL1 = l1ById(challenger);
	const referencePercentile = percentileById(reference);
	const challengerPercentile = percentileById(challenger);
	let maxL1Delta = 0;
	let percentileDeltaSum = 0;
	for (const row of reference) {
		const id = row.parityNodeKey;
		maxL1Delta = Math.max(maxL1Delta, Math.abs((referenceL1.get(id) as number) - (challengerL1.get(id) as number)));
		percentileDeltaSum += Math.abs((referencePercentile.get(id) as number) - (challengerPercentile.get(id) as number));
	}
	const metrics = {
		topKOverlap: topKOverlap(reference, challenger, topK),
		spearmanCorrelation: spearman(reference, challenger),
		maxL1Delta,
		meanAbsolutePercentileDelta: percentileDeltaSum / reference.length,
	};
	const thresholds = input.thresholds ?? DEFAULT_PAGERANK_CANONICAL_PARITY_THRESHOLDS_V2;
	const status =
		metrics.topKOverlap >= thresholds.minTopKOverlap &&
		metrics.spearmanCorrelation >= thresholds.minSpearmanCorrelation &&
		metrics.maxL1Delta <= thresholds.maxL1Delta &&
		metrics.meanAbsolutePercentileDelta <= thresholds.maxMeanAbsolutePercentileDelta
			? 'PASS'
			: 'FAIL';
	const parameters = PageRankParametersSchema.parse({
		...plan.parameters,
		relationshipTypes: [...plan.parameters.relationshipTypes].sort(),
	});

	return PageRankCrossExecutorParityReceiptV2Schema.parse({
		schema: 'atlas.pagerank-cross-executor-parity.v2',
		algorithm: 'pagerank',
		algorithmRevision: plan.algorithmRevision,
		parameterHash: computePageRankParityParameterHash(parameters),
		parameters,
		referenceExecutorId: input.referenceExecutorId,
		challengerExecutorId: input.challengerExecutorId,
		graphRevision: snapshot.projection.graphRevision,
		projectionRevision: snapshot.projection.projectionRevision,
		projectionHash: snapshot.projection.projectionHash,
		projectionName: snapshot.projection.projectionName,
		projectionSnapshotHash: snapshot.contentHash,
		parityCoordinate: 'graph_node_key',
		nodeCount: snapshot.projection.nodeCount,
		referenceRawOutputHash: hashScores(reference),
		challengerRawOutputHash: hashScores(challenger),
		topK,
		...metrics,
		thresholds,
		status,
		producerRevision: input.producerRevision,
		generatedAt: input.generatedAt ?? new Date().toISOString(),
	});
}

export function assertPageRankParityReceiptMatchesSnapshot(input: {
	receipt: unknown;
	snapshot: unknown;
	plan?: unknown;
}): PageRankCrossExecutorParityReceiptV2 {
	const receipt = PageRankCrossExecutorParityReceiptV2Schema.parse(input.receipt);
	const snapshot = GraphProjectionSnapshotV1Schema.parse(input.snapshot);
	const checks = [
		['graphRevision', receipt.graphRevision, snapshot.projection.graphRevision],
		['projectionRevision', receipt.projectionRevision, snapshot.projection.projectionRevision],
		['projectionHash', receipt.projectionHash, snapshot.projection.projectionHash],
		['projectionName', receipt.projectionName, snapshot.projection.projectionName],
		['projectionSnapshotHash', receipt.projectionSnapshotHash, snapshot.contentHash],
	] as const;
	for (const [field, actual, expected] of checks) {
		if (actual !== expected) throw new Error(`PageRank parity ${field} mismatch: expected '${expected}', got '${actual}'`);
	}
	if (receipt.nodeCount !== snapshot.projection.nodeCount) throw new Error('PageRank parity nodeCount mismatch');
	if (input.plan != null) {
		const plan = PageRankExecutionPlanV1Schema.parse(input.plan);
		assertPageRankPlanProjection(plan, snapshot.projection);
		if (receipt.algorithmRevision !== plan.algorithmRevision) throw new Error('PageRank parity algorithmRevision mismatch');
		if (receipt.parameterHash !== computePageRankParityParameterHash(plan.parameters)) {
			throw new Error('PageRank parity parameterHash mismatch');
		}
	}
	return receipt;
}
