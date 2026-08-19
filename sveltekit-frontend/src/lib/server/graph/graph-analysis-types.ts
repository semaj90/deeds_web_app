/**
 * Graph Analysis Run/Promotion Contract — GA0.
 *
 * GraphAnalysisRunSchema remains the persisted V1-compatible shape.
 * GraphAnalysisRunV2Schema adds projectionHash so every promoted graph-analysis
 * lineage can prove the exact projection semantics it consumed.
 */

import { z } from 'zod';
import {
	AnalysisRunEnvelopeSchema,
	type AnalysisRunEnvelope,
} from '$lib/server/analysis/analysis-run-envelope.js';

export const GraphAlgorithmSchema = z.enum([
	'pagerank',
	'cheirank',
	'personalized_pagerank',
	'louvain',
	'leiden',
	'kcore',
	'betweenness',
]);
export type GraphAlgorithm = z.infer<typeof GraphAlgorithmSchema>;

export const GraphAnalysisRunStatusSchema = AnalysisRunEnvelopeSchema.shape.status;
export type GraphAnalysisRunStatus = AnalysisRunEnvelope['status'];

export const GraphAnalysisRunSchema = AnalysisRunEnvelopeSchema.extend({
	algorithm: GraphAlgorithmSchema,
	graphRevision: z.string().min(1),
	projectionRevision: z.string().min(1),
	projectionName: z.string().min(1),
	nodeCount: z.number().int().nonnegative(),
	relationshipCount: z.number().int().nonnegative(),
}).strict();
export type GraphAnalysisRun = z.infer<typeof GraphAnalysisRunSchema>;

/**
 * Versioned lineage-hardening shape. V1 remains readable; all new PageRank,
 * PPR, community, and centrality promotion paths should require V2.
 */
export const GraphAnalysisRunV2Schema = GraphAnalysisRunSchema.extend({
	projectionHash: z.string().min(1),
}).strict();
export type GraphAnalysisRunV2 = z.infer<typeof GraphAnalysisRunV2Schema>;

export const GraphMetricResultSchema = z
	.object({
		runId: z.string().min(1),
		packetKey: z.string().min(1),
		symbolVersionId: z.string().min(1).nullable(),
		metricName: z.string().min(1),
		metricValue: z.number().finite(),
		graphRevision: z.string().min(1),
		algorithmRevision: z.string().min(1),
		createdAt: z.string().datetime(),
	})
	.strict();
export type GraphMetricResult = z.infer<typeof GraphMetricResultSchema>;

export const CommunityAssignmentSchema = z
	.object({
		runId: z.string().min(1),
		packetKey: z.string().min(1),
		algorithm: z.enum(['louvain', 'leiden']),
		communityId: z.string().min(1),
		level: z.number().int().nonnegative().nullable(),
		graphRevision: z.string().min(1),
		createdAt: z.string().datetime(),
	})
	.strict();
export type CommunityAssignment = z.infer<typeof CommunityAssignmentSchema>;

export const CommunityTaxonomyRecordSchema = z
	.object({
		runId: z.string().min(1),
		algorithm: z.enum(['louvain', 'leiden']),
		communityId: z.string().min(1),
		parentCommunityId: z.string().min(1).nullable(),
		memberCount: z.number().int().nonnegative(),
		representativePacketKeys: z.array(z.string().min(1)).default([]),
		representativeSymbols: z.array(z.string().min(1)).default([]),
		label: z.string().min(1).nullable(),
		purity: z.number().finite().min(0).max(1).nullable(),
		modularityContribution: z.number().finite().nullable(),
		metadata: z.record(z.string(), z.unknown()).default({}),
	})
	.strict();
export type CommunityTaxonomyRecord = z.infer<typeof CommunityTaxonomyRecordSchema>;

export const CommunityEvaluationSchema = z
	.object({
		graphRevision: z.string().min(1),
		algorithm: z.enum(['louvain', 'leiden']),
		coverage: z.number().finite().min(0).max(1),
		modularity: z.number().finite(),
		communityCount: z.number().int().nonnegative(),
		singletonRatio: z.number().finite().min(0).max(1),
		p50CommunitySize: z.number().finite().nonnegative(),
		p95CommunitySize: z.number().finite().nonnegative(),
		maxCommunitySize: z.number().finite().nonnegative(),
		subsystemPurity: z.number().finite().min(0).max(1).nullable(),
		stability: z.number().finite().min(0).max(1).nullable(),
	})
	.strict();
export type CommunityEvaluation = z.infer<typeof CommunityEvaluationSchema>;

export const FeatureRowV1Schema = z
	.object({
		packetKey: z.string().min(1),
		dense: z.number().finite(),
		sparse: z.number().finite(),
		rrf: z.number().finite(),
		ast: z.number().finite(),
		pagerankAuthority: z.number().finite(),
		freshness: z.number().finite(),
		crossEncoder: z.number().finite(),
		featureRevision: z.string().min(1),
		graphRevision: z.string().min(1),
	})
	.strict();
export type FeatureRowV1 = z.infer<typeof FeatureRowV1Schema>;
