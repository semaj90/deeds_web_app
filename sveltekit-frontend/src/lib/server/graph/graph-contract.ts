import { z } from 'zod';

export const GRAPH_CONTRACT_VERSION = 'atlas.contextual-graph.v1' as const;
export const PAGERANK_CONTRACT_VERSION = 'atlas.pagerank-authority.v1' as const;

export const GraphNodeTypeSchema = z.enum([
	'repository',
	'package',
	'directory',
	'file',
	'symbol',
	'chunk',
	'packet',
	'document',
	'concept',
	'relation_event'
]);

export const GraphEdgeTypeSchema = z.enum([
	'CONTAINS',
	'IMPORTS',
	'CALLS',
	'REFERENCES',
	'DEPENDS_ON',
	'IMPLEMENTS',
	'USES_CONCEPT',
	'DERIVED_FROM',
	'SUMMARIZES',
	'SEMANTIC_SIMILAR',
	'PARTICIPATES_IN'
]);

export const GraphSnapshotSchema = z
	.object({
		contractVersion: z.literal(GRAPH_CONTRACT_VERSION),
		snapshotId: z.string().uuid(),
		status: z.enum(['building', 'validating', 'passed', 'failed', 'promoted', 'retired']),
		nodeCount: z.number().int().nonnegative(),
		edgeCount: z.number().int().nonnegative(),
		sourceManifest: z.record(z.string(), z.unknown()),
		algorithmConfig: z.record(z.string(), z.unknown()),
		contentHash: z.string().min(1),
		createdAt: z.string().datetime()
	})
	.strict();

export const GraphNodeSchema = z
	.object({
		snapshotId: z.string().uuid(),
		nodeKey: z.string().min(1),
		nodeType: GraphNodeTypeSchema,
		packetKey: z.string().min(1).nullable(),
		treeNodeId: z.string().min(1).nullable(),
		sourceRef: z.string().min(1).nullable(),
		contentHash: z.string().min(1),
		properties: z.record(z.string(), z.unknown()).default({})
	})
	.strict()
	.superRefine((node, ctx) => {
		if (!node.packetKey && !node.treeNodeId && !node.sourceRef) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'A graph node requires packetKey, treeNodeId, or sourceRef for canonical resolution.'
			});
		}
	});

export const GraphEdgeSchema = z
	.object({
		snapshotId: z.string().uuid(),
		edgeKey: z.string().min(1),
		sourceNodeKey: z.string().min(1),
		targetNodeKey: z.string().min(1),
		edgeType: GraphEdgeTypeSchema,
		weight: z.number().finite().nonnegative(),
		confidence: z.number().finite().min(0).max(1),
		provenance: z.string().min(1),
		extractorVersion: z.string().min(1),
		properties: z.record(z.string(), z.unknown()).default({})
	})
	.strict()
	.superRefine((edge, ctx) => {
		if (edge.sourceNodeKey === edge.targetNodeKey && edge.edgeType === 'CONTAINS') {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'CONTAINS cannot have the same source and target node.'
			});
		}
	});

export const PageRankRunSchema = z
	.object({
		contractVersion: z.literal(PAGERANK_CONTRACT_VERSION),
		runId: z.string().uuid(),
		graphSnapshotId: z.string().uuid(),
		engine: z.enum(['networkx', 'neo4j-gds']),
		algorithm: z.literal('pagerank'),
		dampingFactor: z.number().finite().min(0).lt(1),
		maxIterations: z.number().int().positive(),
		tolerance: z.number().finite().positive(),
		relationshipWeightProperty: z.string().min(1),
		normalizationAppliedBy: z.literal('atlas-postprocess'),
		didConverge: z.boolean(),
		ranIterations: z.number().int().positive(),
		nodeCount: z.number().int().positive(),
		resultHash: z.string().min(1)
	})
	.strict();

export const PageRankScoreSchema = z
	.object({
		runId: z.string().uuid(),
		nodeKey: z.string().min(1),
		pagerankRaw: z.number().finite().nonnegative(),
		pagerankL1: z.number().finite().min(0).max(1),
		authorityPercentile: z.number().finite().min(0).max(1),
		authorityBand: z.enum(['very-low', 'low', 'medium', 'high', 'very-high'])
	})
	.strict();

export const TraversalRequestSchema = z
	.object({
		queryId: z.string().uuid(),
		snapshotId: z.string().uuid(),
		seedNodeKeys: z.array(z.string().min(1)).min(1).max(20),
		allowedEdgeTypes: z.array(GraphEdgeTypeSchema).min(1).max(8),
		maxHops: z.number().int().min(1).max(3).default(2),
		maxFanout: z.number().int().min(1).max(50).default(20),
		maxResults: z.number().int().min(1).max(100).default(100),
		minimumConfidence: z.number().finite().min(0).max(1).default(0.65)
	})
	.strict();

export const TraversalResultSchema = z
	.object({
		nodeKey: z.string().min(1),
		packetKey: z.string().min(1),
		path: z.array(z.string().min(1)).min(1).max(4),
		hopCount: z.number().int().min(0).max(3),
		pathScore: z.number().finite().nonnegative(),
		provenance: z.array(z.string().min(1)).min(1)
	})
	.strict();

export const ExternalSearchEvidenceSchema = z
	.object({
		evidenceType: z.literal('external_web'),
		trusted: z.literal(false),
		url: z.string().url(),
		title: z.string().min(1),
		snippet: z.string(),
		engine: z.string().min(1),
		retrievedAt: z.string().datetime(),
		queryHash: z.string().min(1)
	})
	.strict();

export const AceGraphEvidenceSchema = z
	.object({
		packetKey: z.string().min(1),
		sourceRef: z.string().min(1),
		snapshotId: z.string().uuid(),
		pagerankRunId: z.string().uuid().nullable(),
		laneIds: z.array(z.string().min(1)).min(1),
		citations: z.array(z.object({ startLine: z.number().int().positive(), endLine: z.number().int().positive() })).default([]),
		externalEvidence: z.array(ExternalSearchEvidenceSchema).default([])
	})
	.strict();

export type GraphSnapshot = z.infer<typeof GraphSnapshotSchema>;
export type GraphNode = z.infer<typeof GraphNodeSchema>;
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;
export type PageRankRun = z.infer<typeof PageRankRunSchema>;
export type PageRankScore = z.infer<typeof PageRankScoreSchema>;
export type TraversalRequest = z.infer<typeof TraversalRequestSchema>;

export function normalizePageRankL1(
	rows: ReadonlyArray<{ nodeKey: string; pagerankRaw: number }>
): Array<z.infer<typeof PageRankScoreSchema>> {
	if (rows.length === 0) throw new Error('Cannot normalize an empty PageRank result.');

	const rawRows = rows.map((row) => ({ ...row, pagerankRaw: Number(row.pagerankRaw) }));
	if (rawRows.some((row) => !Number.isFinite(row.pagerankRaw) || row.pagerankRaw < 0)) {
		throw new Error('PageRank scores must be finite and non-negative.');
	}

	const total = rawRows.reduce((sum, row) => sum + row.pagerankRaw, 0);
	if (total <= 0) throw new Error('PageRank L1 normalization requires a positive score sum.');

	const ordered = [...rawRows].sort(
		(a, b) => a.pagerankRaw - b.pagerankRaw || a.nodeKey.localeCompare(b.nodeKey)
	);
	const denominator = Math.max(ordered.length - 1, 1);
	const percentileByNodeKey = new Map<string, number>();

	for (let start = 0; start < ordered.length; ) {
		let end = start + 1;
		while (end < ordered.length && ordered[end].pagerankRaw === ordered[start].pagerankRaw) end += 1;
		const percentile = ((start + end - 1) / 2) / denominator;
		for (let index = start; index < end; index += 1) {
			percentileByNodeKey.set(ordered[index].nodeKey, percentile);
		}
		start = end;
	}

	return rawRows.map((row) => {
		const authorityPercentile = percentileByNodeKey.get(row.nodeKey) ?? 0;
		return {
			runId: '00000000-0000-0000-0000-000000000000',
			nodeKey: row.nodeKey,
			pagerankRaw: row.pagerankRaw,
			pagerankL1: row.pagerankRaw / total,
			authorityPercentile,
			authorityBand:
				authorityPercentile >= 0.99 ? 'very-high' :
				authorityPercentile >= 0.90 ? 'high' :
				authorityPercentile >= 0.50 ? 'medium' :
				authorityPercentile >= 0.10 ? 'low' : 'very-low'
		};
	});
}
