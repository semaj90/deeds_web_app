import { z } from 'zod';
import {
	PageRankExecutionPlanV1Schema,
	assertPageRankPlanProjection,
} from './pagerank-execution-contract.js';
import { computePageRankParityParameterHash } from './pagerank-cross-executor-parity.js';
import { GraphProjectionSnapshotV1Schema } from './graph-projection-snapshot-v1.js';

const PageRankFabricModeSchema = z.enum(['graph_pagerank_neo4j_gds', 'graph_pagerank_cugraph']);

export const PageRankParityFabricRequestV1Schema = z
	.object({
		schema: z.literal('atlas.pagerank-parity-fabric-request.v1'),
		mode: PageRankFabricModeSchema,
		executorId: z.enum(['NEO4J_GDS', 'CUGRAPH']),
		runId: z.string().min(1),
		algorithmRevision: z.string().min(1),
		parameterHash: z.string().min(1),
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
	.strict()
	.superRefine((request, ctx) => {
		if (request.mode === 'graph_pagerank_neo4j_gds' && request.executorId !== 'NEO4J_GDS') {
			ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['executorId'], message: 'Neo4j GDS mode requires NEO4J_GDS' });
		}
		if (request.mode === 'graph_pagerank_cugraph' && request.executorId !== 'CUGRAPH') {
			ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['executorId'], message: 'cuGraph mode requires CUGRAPH' });
		}
	});
export type PageRankParityFabricRequestV1 = z.infer<typeof PageRankParityFabricRequestV1Schema>;

/** Compatibility alias for existing callers that only need the challenger. */
export const PageRankGpuFabricRequestV1Schema = PageRankParityFabricRequestV1Schema.refine(
	(request) => request.mode === 'graph_pagerank_cugraph' && request.executorId === 'CUGRAPH',
	{ message: 'GPU request must target graph_pagerank_cugraph/CUGRAPH' },
);
export type PageRankGpuFabricRequestV1 = PageRankParityFabricRequestV1;

function compileBase(input: { plan: unknown; snapshot: unknown }) {
	const plan = PageRankExecutionPlanV1Schema.parse(input.plan);
	const snapshot = GraphProjectionSnapshotV1Schema.parse(input.snapshot);
	assertPageRankPlanProjection(plan, snapshot.projection);
	if (plan.algorithm !== 'pagerank' || plan.parameters.personalization.mode !== 'GLOBAL') {
		throw new Error('cross-executor parity fabric currently supports global PageRank only; PPR seed identity is a separate proof');
	}
	return {
		plan,
		snapshot,
		common: {
			runId: plan.runId,
			algorithmRevision: plan.algorithmRevision,
			parameterHash: computePageRankParityParameterHash(plan.parameters),
			graphRevision: snapshot.projection.graphRevision,
			projectionRevision: snapshot.projection.projectionRevision,
			projectionHash: snapshot.projection.projectionHash,
			projectionName: snapshot.projection.projectionName,
			projectionSnapshotHash: snapshot.contentHash,
			nodesParquet: snapshot.artifactPaths.nodesParquet,
			edgesParquet: snapshot.artifactPaths.edgesParquet,
			relationshipTypes: [...plan.parameters.relationshipTypes].sort(),
			weighted: plan.parameters.weighted,
			dampingFactor: plan.parameters.dampingFactor,
			maxIterations: plan.parameters.maxIterations,
			tolerance: plan.parameters.tolerance,
			producerRevision: plan.producerRevision,
		},
	};
}

/**
 * Compile a matched reference/challenger pair. Both worker calls come from
 * one plan and one frozen snapshot; their only intended difference is backend.
 */
export function compilePageRankParityFabricRequests(input: {
	plan: unknown;
	snapshot: unknown;
}): { reference: PageRankParityFabricRequestV1; challenger: PageRankParityFabricRequestV1 } {
	const { common } = compileBase(input);
	return {
		reference: PageRankParityFabricRequestV1Schema.parse({
			schema: 'atlas.pagerank-parity-fabric-request.v1',
			mode: 'graph_pagerank_neo4j_gds',
			executorId: 'NEO4J_GDS',
			...common,
		}),
		challenger: PageRankParityFabricRequestV1Schema.parse({
			schema: 'atlas.pagerank-parity-fabric-request.v1',
			mode: 'graph_pagerank_cugraph',
			executorId: 'CUGRAPH',
			...common,
		}),
	};
}

export function compilePageRankGpuFabricRequest(input: {
	plan: unknown;
	snapshot: unknown;
}): PageRankGpuFabricRequestV1 {
	const plan = PageRankExecutionPlanV1Schema.parse(input.plan);
	if (plan.executor.executorId !== 'CUGRAPH' || plan.executor.role !== 'GPU_CHALLENGER') {
		throw new Error('GPU fabric PageRank request requires CUGRAPH/GPU_CHALLENGER');
	}
	return compilePageRankParityFabricRequests(input).challenger;
}

export function pageRankParityFabricRequestToArgs(requestInput: unknown): string[] {
	const request = PageRankParityFabricRequestV1Schema.parse(requestInput);
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

export function pageRankGpuFabricRequestToArgs(requestInput: unknown): string[] {
	const request = PageRankGpuFabricRequestV1Schema.parse(requestInput);
	return pageRankParityFabricRequestToArgs(request);
}
