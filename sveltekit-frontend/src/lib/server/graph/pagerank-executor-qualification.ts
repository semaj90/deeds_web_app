import { z } from 'zod';
import { GraphSnapshotParityReceiptSchema } from '../atlas/graph/graph-snapshot-parity-contract.js';
import { GraphProjectionSnapshotV1Schema } from './graph-projection-snapshot-v1.js';
import {
	PageRankCrossExecutorParityReceiptV2Schema,
	assertPageRankParityReceiptMatchesSnapshot,
	computePageRankParityParameterHash,
} from './pagerank-cross-executor-parity.js';
import {
	PageRankExecutionPlanV1Schema,
	PageRankExecutorIdSchema,
	assertPageRankPlanProjection,
} from './pagerank-execution-contract.js';

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
		algorithmRevision: z.string().min(1),
		parameterHash: z.string().min(1),
		graphRevision: z.string().min(1),
		projectionRevision: z.string().min(1),
		projectionHash: z.string().min(1),
		projectionSnapshotHash: z.string().min(1),
		legacyMathParity: z.object({
			topKOverlap: z.number().min(0).max(1),
			spearmanCorrelation: z.number().min(-1).max(1),
			maxL1Delta: z.number().nonnegative(),
		}).strict(),
		legacyThresholds: z.object({
			minTopKOverlap: z.number().min(0).max(1),
			minSpearmanCorrelation: z.number().min(-1).max(1),
			maxL1Delta: z.number().nonnegative(),
		}).strict(),
		legacyParityReceiptGeneratedAt: z.string().datetime(),
		legacyParityReceiptGraphRevision: z.string().min(1),
		projectionLineageMatched: z.boolean(),
		canonicalReferenceParityReceipt: PageRankCrossExecutorParityReceiptV2Schema.nullable(),
		canonicalReferenceParityProven: z.boolean(),
		status: PageRankExecutorQualificationStatusSchema,
		reasons: z.array(z.string().min(1)),
		producerRevision: z.string().min(1),
		createdAt: z.string().datetime(),
	})
	.strict();
export type PageRankExecutorQualificationV1 = z.infer<typeof PageRankExecutorQualificationV1Schema>;

/**
 * Legacy NetworkX↔cuGraph evidence remains useful backend/math evidence, but
 * canonical eligibility is parameter-specific. A typed NEO4J_GDS↔CUGRAPH
 * receipt must match the exact V3 snapshot AND exact PageRank plan.
 */
export function qualifyCugraphFromFrozenParity(input: {
	plan: unknown;
	snapshot: unknown;
	legacyParityReceipt: unknown;
	canonicalReferenceParityReceipt?: unknown;
	producerRevision: string;
	createdAt?: string;
}): PageRankExecutorQualificationV1 {
	const plan = PageRankExecutionPlanV1Schema.parse(input.plan);
	const snapshot = GraphProjectionSnapshotV1Schema.parse(input.snapshot);
	assertPageRankPlanProjection(plan, snapshot.projection);
	if (plan.algorithm !== 'pagerank' || plan.parameters.personalization.mode !== 'GLOBAL') {
		throw new Error('cuGraph canonical qualification currently requires global pagerank');
	}
	const parameterHash = computePageRankParityParameterHash(plan.parameters);
	const legacy = GraphSnapshotParityReceiptSchema.parse(input.legacyParityReceipt);
	const legacyThresholds = {
		minTopKOverlap: 1,
		minSpearmanCorrelation: 0.99,
		maxL1Delta: 1e-8,
	};
	const reasons: string[] = [];

	const legacyMathParity = {
		topKOverlap: legacy.pagerankTopKOverlap,
		spearmanCorrelation: legacy.pagerankCorrelation,
		maxL1Delta: legacy.pagerankMaxDelta,
	};
	const mathPass =
		legacy.status === 'PASS' &&
		legacyMathParity.topKOverlap >= legacyThresholds.minTopKOverlap &&
		legacyMathParity.spearmanCorrelation >= legacyThresholds.minSpearmanCorrelation &&
		legacyMathParity.maxL1Delta <= legacyThresholds.maxL1Delta;
	if (!mathPass) reasons.push('legacy frozen-snapshot PageRank parity thresholds are not satisfied');

	const projectionLineageMatched =
		legacy.graphRevision === snapshot.projection.graphRevision &&
		legacy.manifest.graphRevision === snapshot.parityManifest.graphRevision &&
		legacy.manifest.nodeTableHash === snapshot.parityManifest.nodeTableHash &&
		legacy.manifest.edgeTableHash === snapshot.parityManifest.edgeTableHash &&
		legacy.manifest.nodeCount === snapshot.parityManifest.nodeCount &&
		legacy.manifest.edgeCount === snapshot.parityManifest.edgeCount;
	if (!projectionLineageMatched) reasons.push('legacy parity artifact does not match the V3-qualified projection snapshot');

	let canonicalReferenceParityReceipt: z.infer<typeof PageRankCrossExecutorParityReceiptV2Schema> | null = null;
	let canonicalReferenceParityProven = false;
	if (input.canonicalReferenceParityReceipt != null) {
		try {
			canonicalReferenceParityReceipt = assertPageRankParityReceiptMatchesSnapshot({
				receipt: input.canonicalReferenceParityReceipt,
				snapshot,
				plan,
			});
			canonicalReferenceParityProven =
				canonicalReferenceParityReceipt.status === 'PASS' &&
				canonicalReferenceParityReceipt.referenceExecutorId === 'NEO4J_GDS' &&
				canonicalReferenceParityReceipt.challengerExecutorId === 'CUGRAPH' &&
				canonicalReferenceParityReceipt.algorithmRevision === plan.algorithmRevision &&
				canonicalReferenceParityReceipt.parameterHash === parameterHash;
			if (!canonicalReferenceParityProven) {
				reasons.push('canonical parity receipt is not a parameter-qualified PASS for NEO4J_GDS↔CUGRAPH');
			}
		} catch (error) {
			reasons.push(error instanceof Error ? error.message : 'canonical parity receipt failed plan/snapshot lineage validation');
		}
	}
	if (!canonicalReferenceParityProven) {
		reasons.push('NEO4J_GDS↔CUGRAPH parity on the same V3 snapshot and PageRank parameter set is not yet proven');
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
		algorithmRevision: plan.algorithmRevision,
		parameterHash,
		graphRevision: snapshot.projection.graphRevision,
		projectionRevision: snapshot.projection.projectionRevision,
		projectionHash: snapshot.projection.projectionHash,
		projectionSnapshotHash: snapshot.contentHash,
		legacyMathParity,
		legacyThresholds,
		legacyParityReceiptGeneratedAt: legacy.generatedAt,
		legacyParityReceiptGraphRevision: legacy.graphRevision,
		projectionLineageMatched,
		canonicalReferenceParityReceipt,
		canonicalReferenceParityProven,
		status,
		reasons: [...new Set(reasons)],
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
