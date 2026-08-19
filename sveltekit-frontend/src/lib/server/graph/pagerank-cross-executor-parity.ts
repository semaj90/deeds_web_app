import { z } from 'zod';
import { GraphProjectionSnapshotV1Schema } from './graph-projection-snapshot-v1.js';
import { PageRankExecutorIdSchema } from './pagerank-execution-contract.js';

export const PageRankCrossExecutorParityStatusSchema = z.enum(['PASS', 'FAIL']);

export const PageRankCrossExecutorParityReceiptV2Schema = z
	.object({
		schema: z.literal('atlas.pagerank-cross-executor-parity.v2'),
		algorithm: z.literal('pagerank'),
		referenceExecutorId: PageRankExecutorIdSchema,
		challengerExecutorId: PageRankExecutorIdSchema,
		graphRevision: z.string().min(1),
		projectionRevision: z.string().min(1),
		projectionHash: z.string().min(1),
		projectionName: z.string().min(1),
		projectionSnapshotHash: z.string().min(1),
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

export function buildPageRankCrossExecutorParityReceiptV2(input: {
	snapshot: unknown;
	referenceExecutorId: 'NEO4J_GDS';
	challengerExecutorId: 'CUGRAPH';
	referenceRawOutputHash: string;
	challengerRawOutputHash: string;
	topK: number;
	topKOverlap: number;
	spearmanCorrelation: number;
	maxL1Delta: number;
	meanAbsolutePercentileDelta: number;
	producerRevision: string;
	generatedAt?: string;
	thresholds?: typeof DEFAULT_PAGERANK_CANONICAL_PARITY_THRESHOLDS_V2;
}): PageRankCrossExecutorParityReceiptV2 {
	const snapshot = GraphProjectionSnapshotV1Schema.parse(input.snapshot);
	const thresholds = input.thresholds ?? DEFAULT_PAGERANK_CANONICAL_PARITY_THRESHOLDS_V2;
	const status =
		input.topKOverlap >= thresholds.minTopKOverlap &&
		input.spearmanCorrelation >= thresholds.minSpearmanCorrelation &&
		input.maxL1Delta <= thresholds.maxL1Delta &&
		input.meanAbsolutePercentileDelta <= thresholds.maxMeanAbsolutePercentileDelta
			? 'PASS'
			: 'FAIL';
	return PageRankCrossExecutorParityReceiptV2Schema.parse({
		schema: 'atlas.pagerank-cross-executor-parity.v2',
		algorithm: 'pagerank',
		referenceExecutorId: input.referenceExecutorId,
		challengerExecutorId: input.challengerExecutorId,
		graphRevision: snapshot.projection.graphRevision,
		projectionRevision: snapshot.projection.projectionRevision,
		projectionHash: snapshot.projection.projectionHash,
		projectionName: snapshot.projection.projectionName,
		projectionSnapshotHash: snapshot.contentHash,
		nodeCount: snapshot.projection.nodeCount,
		referenceRawOutputHash: input.referenceRawOutputHash,
		challengerRawOutputHash: input.challengerRawOutputHash,
		topK: input.topK,
		topKOverlap: input.topKOverlap,
		spearmanCorrelation: input.spearmanCorrelation,
		maxL1Delta: input.maxL1Delta,
		meanAbsolutePercentileDelta: input.meanAbsolutePercentileDelta,
		thresholds,
		status,
		producerRevision: input.producerRevision,
		generatedAt: input.generatedAt ?? new Date().toISOString(),
	});
}

export function assertPageRankParityReceiptMatchesSnapshot(input: {
	receipt: unknown;
	snapshot: unknown;
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
	return receipt;
}
