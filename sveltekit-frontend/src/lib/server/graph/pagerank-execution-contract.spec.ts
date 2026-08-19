import { describe, expect, it } from 'vitest';
import {
	GraphProjectionManifestV3Schema,
	computeRelationshipProjectionHashV3,
} from './graph-projection-manifest.js';
import {
	PageRankExecutionPlanV1Schema,
	PageRankExecutionReceiptV1Schema,
} from './pagerank-execution-contract.js';
import { PageRankAuthorityV2Schema } from './pagerank-authority-v2.js';
import { GraphFanoutPlanV1Schema } from './graph-fanout-contract.js';
import { assertPageRankAnalysisLineage } from './graph-analysis-lineage-validator.js';
import { assertPageRankDispatchable } from './pagerank-dispatch-policy.js';

function projection() {
	const relationships = {
		IMPORTS: {
			sourceType: 'IMPORTS',
			projectedType: 'IMPORTS',
			orientation: 'NATURAL' as const,
			aggregation: 'NONE' as const,
			properties: {
				cost: {
					projectedProperty: 'cost',
					sourceProperty: 'cost',
					defaultValue: 0.15,
					aggregation: 'NONE' as const,
				},
			},
		},
	};
	return GraphProjectionManifestV3Schema.parse({
		schema: 'atlas.graph-projection-manifest.v3',
		projectionRevision: 'projection-r1',
		graphRevision: 'graph-r1',
		projectionName: 'atlas_dependency_v1',
		nodeLabels: ['CodebaseFile'],
		relationships,
		projectionHash: computeRelationshipProjectionHashV3(relationships),
		nodeCount: 3,
		relationshipCount: 2,
		createdAt: '2026-08-19T20:00:00.000Z',
	});
}

function plan(overrides: Record<string, unknown> = {}) {
	return {
		schema: 'atlas.pagerank-execution-plan.v1',
		runId: 'run-1',
		canonicalRunOwner: 'PARENT_ATLAS_GRAPH_ANALYSIS',
		algorithmFamily: 'PAGERANK',
		algorithm: 'pagerank',
		algorithmRevision: 'pagerank-v1',
		executor: { executorId: 'NEO4J_GDS', role: 'CANONICAL_EXECUTOR' },
		projection: projection(),
		parameters: {
			dampingFactor: 0.85,
			maxIterations: 100,
			tolerance: 0.0001,
			relationshipTypes: ['IMPORTS'],
			weighted: true,
			relationshipWeightProperty: 'cost',
			personalization: { mode: 'GLOBAL' },
		},
		producerRevision: 'producer-r1',
		createdAt: '2026-08-19T20:00:00.000Z',
		...overrides,
	};
}

describe('PageRank execution contracts', () => {
	it('accepts Neo4j and validates projected weight properties', () => {
		expect(PageRankExecutionPlanV1Schema.parse(plan()).executor.executorId).toBe('NEO4J_GDS');
	});

	it('accepts cuGraph as GPU challenger', () => {
		const value = plan({ executor: { executorId: 'CUGRAPH', role: 'GPU_CHALLENGER' } });
		expect(PageRankExecutionPlanV1Schema.parse(value).executor.executorId).toBe('CUGRAPH');
	});

	it('rejects relationship absent from projection', () => {
		const value = plan();
		(value.parameters as any).relationshipTypes = ['CALLS'];
		expect(() => PageRankExecutionPlanV1Schema.parse(value)).toThrow(/absent from projection/);
	});

	it('rejects duplicate relationship types', () => {
		const value = plan();
		(value.parameters as any).relationshipTypes = ['IMPORTS', 'IMPORTS'];
		expect(() => PageRankExecutionPlanV1Schema.parse(value)).toThrow(/must be unique/);
	});

	it('rejects weighted PageRank without a projected weight property', () => {
		const value = plan();
		(value.parameters as any).relationshipWeightProperty = 'missing';
		expect(() => PageRankExecutionPlanV1Schema.parse(value)).toThrow(/not projected/);
	});

	it('rejects cuGraph damping factor zero', () => {
		const value = plan({ executor: { executorId: 'CUGRAPH', role: 'GPU_CHALLENGER' } });
		(value.parameters as any).dampingFactor = 0;
		expect(() => PageRankExecutionPlanV1Schema.parse(value)).toThrow(/outside executor range/);
	});

	it('rejects PPR when personalization mode is global', () => {
		const value = plan({ algorithm: 'personalized_pagerank' });
		expect(() => PageRankExecutionPlanV1Schema.parse(value)).toThrow(/PERSONALIZED/);
	});

	it('keeps personalized PageRank fail-closed until dispatcher is wired', () => {
		const value = plan({ algorithm: 'personalized_pagerank' });
		(value.parameters as any).personalization = {
			mode: 'PERSONALIZED',
			seeds: [{ canonicalId: 'packet:a', weight: 1 }],
		};
		const parsed = PageRankExecutionPlanV1Schema.parse(value);
		expect(() => assertPageRankDispatchable(parsed)).toThrow(/not dispatchable/);
	});

	it('rejects simulation as computation', () => {
		const value = plan({ executor: { executorId: 'NON_AUTHORITATIVE_SIMULATION', role: 'NON_AUTHORITATIVE' } });
		expect(() => PageRankExecutionPlanV1Schema.parse(value)).toThrow(/does not support global/);
	});

	it('projection hash changes when default edge weight changes', () => {
		const first = projection();
		const relations = structuredClone(first.relationships);
		relations.IMPORTS.properties.cost.defaultValue = 0.25;
		expect(computeRelationshipProjectionHashV3(relations)).not.toBe(first.projectionHash);
	});

	it('fanout rejects a relationship outside the qualified projection', () => {
		expect(() => GraphFanoutPlanV1Schema.parse({
			schema: 'atlas.graph-fanout-plan.v1',
			requestId: 'request-1',
			seedCanonicalIds: ['packet:a'],
			projection: projection(),
			relationships: [{ relationshipType: 'CALLS', direction: 'OUT', maxNeighbors: 10 }],
			budget: { maxHops: 2, maxNodes: 100, maxEdges: 200, maxNeighborsPerNode: 20, candidateBudget: 50, timeBudgetMs: 1000 },
			producerRevision: 'producer-r1',
			createdAt: '2026-08-19T20:00:00.000Z',
		})).toThrow(/absent from projection/);
	});

	it('accepts a truthful execution receipt and authority record', () => {
		const p = PageRankExecutionPlanV1Schema.parse(plan());
		const receipt = PageRankExecutionReceiptV1Schema.parse({
			schema: 'atlas.pagerank-execution-receipt.v1',
			runId: 'run-1',
			algorithmFamily: 'PAGERANK',
			algorithm: 'pagerank',
			algorithmRevision: 'pagerank-v1',
			graphRevision: 'graph-r1',
			projectionRevision: 'projection-r1',
			projectionHash: p.projection.projectionHash,
			projectionName: 'atlas_dependency_v1',
			nodeCount: 3,
			relationshipCount: 2,
			telemetry: { executorId: 'NEO4J_GDS', convergenceStatus: 'CONVERGED', ranIterations: 12, preProcessingMillis: 1, computeMillis: 2, postProcessingMillis: 1 },
			rawOutputHash: 'raw-hash',
			producerRevision: 'producer-r1',
			completedAt: '2026-08-19T20:01:00.000Z',
		});
		const authority = PageRankAuthorityV2Schema.parse({
			schema: 'atlas.pagerank-authority.v2',
			runId: 'run-1',
			algorithmFamily: 'PAGERANK',
			algorithm: 'pagerank',
			executorId: 'NEO4J_GDS',
			canonicalId: 'packet:a',
			packetKey: 'packet:a',
			sourceRef: 'src/a.ts',
			graphRevision: 'graph-r1',
			projectionRevision: 'projection-r1',
			projectionHash: p.projection.projectionHash,
			projectionName: 'atlas_dependency_v1',
			pagerankRaw: 0.5,
			pagerankL1: 0.5,
			authorityPercentile: 0.9,
			authorityNorm: 0.9,
			normalization: 'ATLAS_L1_POSTPROCESS_V1',
			producerRevision: 'producer-r1',
			createdAt: '2026-08-19T20:01:00.000Z',
		});
		const run = {
			runId: 'run-1', algorithm: 'pagerank', algorithmRevision: 'pagerank-v1', parameterRevision: 'params-r1', workspaceRevision: 'workspace-r1', sourceRevision: 'source-r1',
			startedAt: '2026-08-19T20:00:00.000Z', completedAt: '2026-08-19T20:01:00.000Z', status: 'succeeded', parameters: {}, metrics: {}, backendPreference: 'native-ts', backendActual: 'offline', gpuAccelerated: false, sidecarUrl: null, inputHash: null, outputHash: null,
			graphRevision: 'graph-r1', projectionRevision: 'projection-r1', projectionName: 'atlas_dependency_v1', projectionHash: p.projection.projectionHash, nodeCount: 3, relationshipCount: 2,
		};
		expect(() => assertPageRankAnalysisLineage({ projection: p.projection, plan: p, run, receipt, authorityRecords: [authority] })).not.toThrow();
	});
});
