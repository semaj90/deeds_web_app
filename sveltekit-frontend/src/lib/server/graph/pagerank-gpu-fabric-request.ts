import { z } from 'zod';
import {
	PageRankExecutionPlanV1Schema,
	assertPageRankPlanProjection,
} from './pagerank-execution-contract.js';
import { GraphProjectionSnapshotV1Schema } from './graph-projection-snapshot-v1.js';

export const PageRankGpuFabricRequestV1Schema = z
	.object({
		schema: z.literal('atlas.pagerank-gpu-fabric-request.v1'),
		mode: z.literal('graph_pagerank_cugraph'),
		runId: z.string().min(1),
		graphRevision: z.string().min(1),
		projectionRevision: z.string().min(1),
		projectionHash: z.string().min(1),
		projectionName: z.string().min(1),
		projectionSnapshotHash: z.string().min(1),
		nodesParquet: z.string().min(1),
		edgesParquet: z.string().min(1),
		relationshipTypes: z.array(z.string().min(1)).min(1),
		weighted: z.boolean(),
		dampingFactor: z.number().finite().gt(0).lt(1),
		maxIterations: z.number().int().positive(),
		tolerance: z.number().finite().positive(),
		producerRevision: z.string().min(1),
	})
	.strict();
export type PageRankGpuFabricRequestV1 = z.infer<typeof PageRankGpuFabricRequestV1Schema>;

/**
 * Pure compiler into the single GPU execution owner. It intentionally does
 * not spawn Python: orchestration/VRAM scheduling decides when the worker is
 * allowed to run. PPR is rejected because the legacy parquet snapshot does
 * not yet expose a proven V3 canonicalId column for seed resolution.
 */
export function compilePageRankGpuFabricRequest(input: {
	plan: unknown;
	snapshot: unknown;
}): PageRankGpuFabricRequestV1 {
	const plan = PageRankExecutionPlanV1Schema.parse(input.plan);
	const snapshot = GraphProjectionSnapshotV1Schema.parse(input.snapshot);
	assertPageRankPlanProjection(plan, snapshot.projection);
	if (plan.executor.executorId !== 'CUGRAPH' || plan.executor.role !== 'GPU_CHALLENGER') {
		throw new Error('GPU fabric PageRank request requires CUGRAPH/GPU_CHALLENGER');
	}
	if (plan.algorithm !== 'pagerank' || plan.parameters.personalization.mode !== 'GLOBAL') {
		throw new Error('GPU fabric supports global PageRank only until snapshot canonical seed identity is proven');
	}
	return PageRankGpuFabricRequestV1Schema.parse({
		schema: 'atlas.pagerank-gpu-fabric-request.v1',
		mode: 'graph_pagerank_cugraph',
		runId: plan.runId,
		graphRevision: snapshot.projection.graphRevision,
		projectionRevision: snapshot.projection.projectionRevision,
		projectionHash: snapshot.projection.projectionHash,
		projectionName: snapshot.projection.projectionName,
		projectionSnapshotHash: snapshot.contentHash,
		nodesParquet: snapshot.artifactPaths.nodesParquet,
		edgesParquet: snapshot.artifactPaths.edgesParquet,
		relationshipTypes: [...plan.parameters.relationshipTypes],
		weighted: plan.parameters.weighted,
		dampingFactor: plan.parameters.dampingFactor,
		maxIterations: plan.parameters.maxIterations,
		tolerance: plan.parameters.tolerance,
		producerRevision: plan.producerRevision,
	});
}

export function pageRankGpuFabricRequestToArgs(requestInput: unknown): string[] {
	const request = PageRankGpuFabricRequestV1Schema.parse(requestInput);
	return [
		'--mode', request.mode,
		'--nodes', request.nodesParquet,
		'--edges', request.edgesParquet,
		'--graph-revision', request.graphRevision,
		'--projection-revision', request.projectionRevision,
		'--projection-hash', request.projectionHash,
		'--projection-name', request.projectionName,
		'--projection-snapshot-hash', request.projectionSnapshotHash,
		...request.relationshipTypes.flatMap((relationshipType) => ['--relationship-type', relationshipType]),
		...(request.weighted ? ['--weighted'] : []),
		'--damping', String(request.dampingFactor),
		'--max-iterations', String(request.maxIterations),
		'--tolerance', String(request.tolerance),
	];
}
