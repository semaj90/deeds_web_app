import { z } from 'zod';
import {
	PageRankExecutionPlanV1Schema,
	assertPageRankPlanProjection,
} from './pagerank-execution-contract.js';
import { GraphProjectionSnapshotV1Schema } from './graph-projection-snapshot-v1.js';

const CommonDataSchema = z.object({
	algorithm: z.literal('pagerank'),
	parityCoordinate: z.literal('graph_node_key'),
	graphRevision: z.string().min(1),
	projectionRevision: z.string().min(1),
	projectionHash: z.string().min(1),
	projectionName: z.string().min(1),
	projectionSnapshotHash: z.string().min(1),
	nodeCount: z.number().int().positive(),
	relationshipCount: z.number().int().positive(),
	relationshipTypes: z.array(z.string().min(1)).min(1),
	weighted: z.boolean(),
	dampingFactor: z.number().finite().gt(0).lt(1),
	maxIterations: z.number().int().positive(),
	tolerance: z.number().finite().positive(),
	convergenceStatus: z.string().min(1),
	ranIterations: z.number().int().positive().nullable(),
	rawOutputHash: z.string().regex(/^[a-f0-9]{64}$/),
	readMillis: z.number().finite().nonnegative(),
	computeMillis: z.number().finite().nonnegative(),
	scoresOut: z.string().nullable(),
});

export const PageRankFabricExecutionDataV1Schema = z.discriminatedUnion('executorId', [
	CommonDataSchema.extend({
		executorId: z.literal('CUGRAPH'),
		role: z.literal('GPU_CHALLENGER'),
		executionMode: z.literal('CUGRAPH_HIGH_LEVEL_PAGERANK'),
		runtime: z.object({
			cugraphVersion: z.string().min(1),
			cudfVersion: z.string().min(1),
		}).strict(),
		failOnNonconvergence: z.boolean(),
		graphBuildMillis: z.number().finite().nonnegative(),
	}).strict(),
	CommonDataSchema.extend({
		executorId: z.literal('NEO4J_GDS'),
		role: z.literal('REFERENCE_EXECUTOR'),
		executionMode: z.literal('MUTATE_ON_CONSTRUCTED_DATAFRAME_GRAPH'),
		runtime: z.object({
			graphdatascienceClientVersion: z.string().min(1),
			gdsServerVersion: z.string().min(1),
			neo4jDatabase: z.string().min(1),
		}).strict(),
		graphConstructMillis: z.number().finite().nonnegative(),
		preProcessingMillis: z.number().finite().nonnegative(),
		postProcessingMillis: z.number().finite().nonnegative(),
		mutateMillis: z.number().finite().nonnegative(),
	}).strict(),
]);

export const PageRankFabricExecutionReceiptV1Schema = z
	.object({
		receipt_id: z.string().min(1),
		receipt_kind: z.enum(['GRAPH_PAGERANK_CUGRAPH_EXECUTED', 'GRAPH_PAGERANK_NEO4J_GDS_EXECUTED']),
		producer_id: z.literal('run_fabric_benchmark.py'),
		producer_revision: z.string().min(1),
		started_at: z.string().min(1),
		completed_at: z.string().min(1),
		input_hash: z.string().regex(/^[a-f0-9]{64}$/),
		output_hash: z.string().regex(/^[a-f0-9]{64}$/),
		workspace_revision: z.null(),
		source_revision: z.null(),
		graph_revision: z.string().min(1),
		representation_revision: z.literal('graph-pagerank-raw-v2'),
		status: z.literal('EXECUTED'),
		data: PageRankFabricExecutionDataV1Schema,
	})
	.strict()
	.superRefine((receipt, ctx) => {
		if (receipt.graph_revision !== receipt.data.graphRevision) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['graph_revision'], message: 'envelope/data graph revision mismatch' });
		}
		const expectedKind = receipt.data.executorId === 'CUGRAPH'
			? 'GRAPH_PAGERANK_CUGRAPH_EXECUTED'
			: 'GRAPH_PAGERANK_NEO4J_GDS_EXECUTED';
		if (receipt.receipt_kind !== expectedKind) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['receipt_kind'], message: `receipt kind must be ${expectedKind}` });
		}
	});
export type PageRankFabricExecutionReceiptV1 = z.infer<typeof PageRankFabricExecutionReceiptV1Schema>;

export function assertPageRankFabricExecutionMatches(input: {
	receipt: unknown;
	plan: unknown;
	snapshot: unknown;
	expectedExecutorId: 'NEO4J_GDS' | 'CUGRAPH';
}): PageRankFabricExecutionReceiptV1 {
	const receipt = PageRankFabricExecutionReceiptV1Schema.parse(input.receipt);
	const plan = PageRankExecutionPlanV1Schema.parse(input.plan);
	const snapshot = GraphProjectionSnapshotV1Schema.parse(input.snapshot);
	assertPageRankPlanProjection(plan, snapshot.projection);
	if (receipt.data.executorId !== input.expectedExecutorId) {
		throw new Error(`PageRank fabric executor mismatch: expected ${input.expectedExecutorId}, got ${receipt.data.executorId}`);
	}
	const exactChecks = [
		['graphRevision', receipt.data.graphRevision, snapshot.projection.graphRevision],
		['projectionRevision', receipt.data.projectionRevision, snapshot.projection.projectionRevision],
		['projectionHash', receipt.data.projectionHash, snapshot.projection.projectionHash],
		['projectionName', receipt.data.projectionName, snapshot.projection.projectionName],
		['projectionSnapshotHash', receipt.data.projectionSnapshotHash, snapshot.contentHash],
	] as const;
	for (const [field, actual, expected] of exactChecks) {
		if (actual !== expected) throw new Error(`PageRank fabric ${field} mismatch: expected '${expected}', got '${actual}'`);
	}
	if (receipt.data.nodeCount !== snapshot.projection.nodeCount) throw new Error('PageRank fabric nodeCount mismatch');
	const actualTypes = [...receipt.data.relationshipTypes].sort();
	const plannedTypes = [...plan.parameters.relationshipTypes].sort();
	if (JSON.stringify(actualTypes) !== JSON.stringify(plannedTypes)) throw new Error('PageRank fabric relationshipTypes mismatch');
	if (receipt.data.weighted !== plan.parameters.weighted) throw new Error('PageRank fabric weighted mode mismatch');
	if (receipt.data.dampingFactor !== plan.parameters.dampingFactor) throw new Error('PageRank fabric dampingFactor mismatch');
	if (receipt.data.maxIterations !== plan.parameters.maxIterations) throw new Error('PageRank fabric maxIterations mismatch');
	if (receipt.data.tolerance !== plan.parameters.tolerance) throw new Error('PageRank fabric tolerance mismatch');
	if (receipt.data.executorId === 'NEO4J_GDS' && receipt.data.convergenceStatus !== 'CONVERGED') {
		throw new Error(`Neo4j GDS PageRank reference did not converge: ${receipt.data.convergenceStatus}`);
	}
	if (receipt.data.executorId === 'CUGRAPH' && receipt.data.convergenceStatus === 'NON_CONVERGED') {
		throw new Error('cuGraph PageRank challenger did not converge');
	}
	return receipt;
}
