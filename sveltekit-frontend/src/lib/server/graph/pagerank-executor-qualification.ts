import { z } from 'zod';
import { GraphSnapshotParityReceiptSchema } from '../atlas/graph/graph-snapshot-parity-contract.js';
import { GraphProjectionSnapshotV1Schema } from './graph-projection-snapshot-v1.js';
import { PageRankExecutorIdSchema } from './pagerank-execution-contract.js';

export const PageRankExecutorQualificationStatusSchema = z.enum([
	'BLOCKED',
	'MATH_PARITY_PROVEN',
	'PROJECTION_LINEAGE_PROVEN',
	'CANONICAL_ELIGIBLE',
]);

export const PageRankExecutorQualificationV1Schema = z
	.object({
		schema: z.literal('atlas.pagerank-executor-qualification.v1'),
		executorId: PageRankExecutorIdSchema,
		referenceExecutorId: PageRankExecutorIdSchema,
		graphRevision: z.string().min(1),
		projectionRevision: z.string().min(1),
		projectionHash: z.string().min(1),
		projectionSnapshotHash: z.string().min(1),
		mathParity: z.object({
			topKOverlap: z.number().min(0).max(1),
			spearmanCorrelation: z.number().min(-1).max(1),
			maxL1Delta: z.number().nonnegative(),
		}).strict(),
		thresholds: z.object({
			minTopKOverlap: z.number().min(0).max(1),
			minSpearmanCorrelation: z.number().min(-1).max(1),
			maxL1Delta: z.number().nonnegative(),
		}).strict(),
		legacyParityReceiptGeneratedAt: z.string().datetime(),
		legacyParityReceiptGraphRevision: z.string().min(1),
		projectionLineageMatched: z.boolean(),
		canonicalReferenceParityProven: z.boolean(),
		status: PageRankExecutorQualificationStatusSchema,
		reasons: z.array(z.string().min(1)),
		producerRevision: z.string().min(1),
		createdAt: z.string().datetime(),
	})
	.strict();
export type PageRankExecutorQualificationV1 = z.infer<typeof PageRankExecutorQualificationV1Schema>;

/**
 * Reconcile the existing NetworkX↔cuGraph frozen-snapshot parity proof with
 * the new V3 projection lineage. This deliberately does NOT make cuGraph
 * canonical from the legacy PASS alone: canonical promotion additionally
 * requires parity against the canonical reference executor (currently
 * NEO4J_GDS) on the same V3-qualified snapshot.
 */
export function qualifyCugraphFromFrozenParity(input: {
	snapshot: unknown;
	legacyParityReceipt: unknown;
	canonicalReferenceParityProven?: boolean;
	producerRevision: string;
	createdAt?: string;
}): PageRankExecutorQualificationV1 {
	const snapshot = GraphProjectionSnapshotV1Schema.parse(input.snapshot);
	const receipt = GraphSnapshotParityReceiptSchema.parse(input.legacyParityReceipt);
	const thresholds = {
		minTopKOverlap: 1,
		minSpearmanCorrelation: 0.99,
		maxL1Delta: 1e-8,
	};
	const reasons: string[] = [];

	const mathParity = {
		topKOverlap: receipt.pagerankTopKOverlap,
		spearmanCorrelation: receipt.pagerankCorrelation,
		maxL1Delta: receipt.pagerankMaxDelta,
	};
	const mathPass =
		receipt.status === 'PASS' &&
		mathParity.topKOverlap >= thresholds.minTopKOverlap &&
		mathParity.spearmanCorrelation >= thresholds.minSpearmanCorrelation &&
		mathParity.maxL1Delta <= thresholds.maxL1Delta;
	if (!mathPass) reasons.push('legacy frozen-snapshot PageRank parity thresholds are not satisfied');

	const projectionLineageMatched =
		receipt.graphRevision === snapshot.projection.graphRevision &&
		receipt.manifest.graphRevision === snapshot.parityManifest.graphRevision &&
		receipt.manifest.nodeTableHash === snapshot.parityManifest.nodeTableHash &&
		receipt.manifest.edgeTableHash === snapshot.parityManifest.edgeTableHash &&
		receipt.manifest.nodeCount === snapshot.parityManifest.nodeCount &&
		receipt.manifest.edgeCount === snapshot.parityManifest.edgeCount;
	if (!projectionLineageMatched) reasons.push('legacy parity artifact does not match the V3-qualified projection snapshot');

	const canonicalReferenceParityProven = input.canonicalReferenceParityProven ?? false;
	if (!canonicalReferenceParityProven) {
		reasons.push('NEO4J_GDS↔CUGRAPH parity on the same V3-qualified snapshot is not yet proven');
	}

	const status = !mathPass
		? 'BLOCKED'
		: !projectionLineageMatched
			? 'MATH_PARITY_PROVEN'
			: !canonicalReferenceParityProven
				? 'PROJECTION_LINEAGE_PROVEN'
				: 'CANONICAL_ELIGIBLE';

	return PageRankExecutorQualificationV1Schema.parse({
		schema: 'atlas.pagerank-executor-qualification.v1',
		executorId: 'CUGRAPH',
		referenceExecutorId: 'NEO4J_GDS',
		graphRevision: snapshot.projection.graphRevision,
		projectionRevision: snapshot.projection.projectionRevision,
		projectionHash: snapshot.projection.projectionHash,
		projectionSnapshotHash: snapshot.contentHash,
		mathParity,
		thresholds,
		legacyParityReceiptGeneratedAt: receipt.generatedAt,
		legacyParityReceiptGraphRevision: receipt.graphRevision,
		projectionLineageMatched,
		canonicalReferenceParityProven,
		status,
		reasons,
		producerRevision: input.producerRevision,
		createdAt: input.createdAt ?? new Date().toISOString(),
	});
}

export function assertCanonicalPageRankExecutorQualified(input: unknown): PageRankExecutorQualificationV1 {
	const qualification = PageRankExecutorQualificationV1Schema.parse(input);
	if (qualification.status !== 'CANONICAL_ELIGIBLE') {
		throw new Error(
			`${qualification.executorId} is not canonical-eligible: ${qualification.status}; ${qualification.reasons.join('; ')}`,
		);
	}
	return qualification;
}
