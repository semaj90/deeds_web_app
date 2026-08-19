import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
	PageRankCrossExecutorParityReceiptV2Schema,
	buildPageRankCrossExecutorParityReceiptV2,
	computePageRankParityParameterHash,
} from './pagerank-cross-executor-parity.js';
import {
	PageRankFabricExecutionReceiptV1Schema,
	assertPageRankFabricExecutionMatches,
} from './pagerank-fabric-execution-receipt.js';
import type { PageRankParityScoreSetV2 } from './pagerank-parity-score-file.js';
import {
	PageRankExecutionPlanV1Schema,
	assertPageRankPlanProjection,
} from './pagerank-execution-contract.js';
import { GraphProjectionSnapshotV1Schema } from './graph-projection-snapshot-v1.js';

function proofHash(input: {
	parameterHash: string;
	projectionSnapshotHash: string;
	referenceExecutionReceiptId: string;
	challengerExecutionReceiptId: string;
	referenceWorkerRawOutputHash: string;
	challengerWorkerRawOutputHash: string;
	parityReceipt: z.infer<typeof PageRankCrossExecutorParityReceiptV2Schema>;
}): string {
	return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

export const PageRankCrossExecutorProofV1Schema = z
	.object({
		schema: z.literal('atlas.pagerank-cross-executor-proof.v1'),
		algorithm: z.literal('pagerank'),
		algorithmRevision: z.string().min(1),
		parameterHash: z.string().min(1),
		projectionSnapshotHash: z.string().min(1),
		referenceExecutionReceiptId: z.string().min(1),
		challengerExecutionReceiptId: z.string().min(1),
		referenceWorkerRawOutputHash: z.string().regex(/^[a-f0-9]{64}$/),
		challengerWorkerRawOutputHash: z.string().regex(/^[a-f0-9]{64}$/),
		referenceExecutionReceipt: PageRankFabricExecutionReceiptV1Schema,
		challengerExecutionReceipt: PageRankFabricExecutionReceiptV1Schema,
		parityReceipt: PageRankCrossExecutorParityReceiptV2Schema,
		proofHash: z.string().regex(/^[a-f0-9]{64}$/),
		producerRevision: z.string().min(1),
		generatedAt: z.string().datetime(),
	})
	.strict()
	.superRefine((proof, ctx) => {
		if (proof.referenceExecutionReceipt.receipt_id !== proof.referenceExecutionReceiptId) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['referenceExecutionReceiptId'], message: 'reference receipt id mismatch' });
		}
		if (proof.challengerExecutionReceipt.receipt_id !== proof.challengerExecutionReceiptId) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['challengerExecutionReceiptId'], message: 'challenger receipt id mismatch' });
		}
		if (proof.referenceExecutionReceipt.data.rawOutputHash !== proof.referenceWorkerRawOutputHash) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['referenceWorkerRawOutputHash'], message: 'reference worker raw-output hash mismatch' });
		}
		if (proof.challengerExecutionReceipt.data.rawOutputHash !== proof.challengerWorkerRawOutputHash) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['challengerWorkerRawOutputHash'], message: 'challenger worker raw-output hash mismatch' });
		}
		if (proof.parityReceipt.parameterHash !== proof.parameterHash) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['parameterHash'], message: 'parity receipt parameter hash mismatch' });
		}
		if (proof.parityReceipt.projectionSnapshotHash !== proof.projectionSnapshotHash) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['projectionSnapshotHash'], message: 'parity receipt snapshot hash mismatch' });
		}
		const expected = proofHash({
			parameterHash: proof.parameterHash,
			projectionSnapshotHash: proof.projectionSnapshotHash,
			referenceExecutionReceiptId: proof.referenceExecutionReceiptId,
			challengerExecutionReceiptId: proof.challengerExecutionReceiptId,
			referenceWorkerRawOutputHash: proof.referenceWorkerRawOutputHash,
			challengerWorkerRawOutputHash: proof.challengerWorkerRawOutputHash,
			parityReceipt: proof.parityReceipt,
		});
		if (proof.proofHash !== expected) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['proofHash'], message: `proofHash mismatch: expected ${expected}` });
		}
	});
export type PageRankCrossExecutorProofV1 = z.infer<typeof PageRankCrossExecutorProofV1Schema>;

export function buildPageRankCrossExecutorProofV1(input: {
	plan: unknown;
	snapshot: unknown;
	referenceExecutionReceipt: unknown;
	challengerExecutionReceipt: unknown;
	referenceScoreSet: PageRankParityScoreSetV2;
	challengerScoreSet: PageRankParityScoreSetV2;
	topK?: number;
	producerRevision: string;
	generatedAt?: string;
}): PageRankCrossExecutorProofV1 {
	const plan = PageRankExecutionPlanV1Schema.parse(input.plan);
	const snapshot = GraphProjectionSnapshotV1Schema.parse(input.snapshot);
	assertPageRankPlanProjection(plan, snapshot.projection);
	const referenceExecutionReceipt = assertPageRankFabricExecutionMatches({
		receipt: input.referenceExecutionReceipt,
		plan,
		snapshot,
		expectedExecutorId: 'NEO4J_GDS',
	});
	const challengerExecutionReceipt = assertPageRankFabricExecutionMatches({
		receipt: input.challengerExecutionReceipt,
		plan,
		snapshot,
		expectedExecutorId: 'CUGRAPH',
	});
	if (input.referenceScoreSet.rowCount !== snapshot.projection.nodeCount) throw new Error('reference parity score file does not cover every snapshot node');
	if (input.challengerScoreSet.rowCount !== snapshot.projection.nodeCount) throw new Error('challenger parity score file does not cover every snapshot node');
	if (input.referenceScoreSet.rawOutputHash !== referenceExecutionReceipt.data.rawOutputHash) throw new Error('reference score artifact hash does not match execution receipt');
	if (input.challengerScoreSet.rawOutputHash !== challengerExecutionReceipt.data.rawOutputHash) throw new Error('challenger score artifact hash does not match execution receipt');

	const parityReceipt = buildPageRankCrossExecutorParityReceiptV2({
		plan,
		snapshot,
		referenceExecutorId: 'NEO4J_GDS',
		challengerExecutorId: 'CUGRAPH',
		referenceScores: input.referenceScoreSet.scores,
		challengerScores: input.challengerScoreSet.scores,
		topK: input.topK,
		producerRevision: input.producerRevision,
		generatedAt: input.generatedAt,
	});
	const parameterHash = computePageRankParityParameterHash(plan.parameters);
	const payload = {
		parameterHash,
		projectionSnapshotHash: snapshot.contentHash,
		referenceExecutionReceiptId: referenceExecutionReceipt.receipt_id,
		challengerExecutionReceiptId: challengerExecutionReceipt.receipt_id,
		referenceWorkerRawOutputHash: input.referenceScoreSet.rawOutputHash,
		challengerWorkerRawOutputHash: input.challengerScoreSet.rawOutputHash,
		parityReceipt,
	};
	return PageRankCrossExecutorProofV1Schema.parse({
		schema: 'atlas.pagerank-cross-executor-proof.v1',
		algorithm: 'pagerank',
		algorithmRevision: plan.algorithmRevision,
		...payload,
		referenceExecutionReceipt,
		challengerExecutionReceipt,
		proofHash: proofHash(payload),
		producerRevision: input.producerRevision,
		generatedAt: input.generatedAt ?? new Date().toISOString(),
	});
}

export function assertPageRankCrossExecutorProofMatches(input: {
	proof: unknown;
	plan: unknown;
	snapshot: unknown;
}): PageRankCrossExecutorProofV1 {
	const proof = PageRankCrossExecutorProofV1Schema.parse(input.proof);
	const plan = PageRankExecutionPlanV1Schema.parse(input.plan);
	const snapshot = GraphProjectionSnapshotV1Schema.parse(input.snapshot);
	assertPageRankPlanProjection(plan, snapshot.projection);
	if (proof.algorithmRevision !== plan.algorithmRevision) throw new Error('PageRank proof algorithmRevision mismatch');
	if (proof.parameterHash !== computePageRankParityParameterHash(plan.parameters)) throw new Error('PageRank proof parameterHash mismatch');
	if (proof.projectionSnapshotHash !== snapshot.contentHash) throw new Error('PageRank proof projectionSnapshotHash mismatch');
	assertPageRankFabricExecutionMatches({ receipt: proof.referenceExecutionReceipt, plan, snapshot, expectedExecutorId: 'NEO4J_GDS' });
	assertPageRankFabricExecutionMatches({ receipt: proof.challengerExecutionReceipt, plan, snapshot, expectedExecutorId: 'CUGRAPH' });
	return proof;
}
