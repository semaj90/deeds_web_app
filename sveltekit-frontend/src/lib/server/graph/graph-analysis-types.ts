/**
 * Graph Analysis Run/Promotion Contract — GA0 (Patch A: contracts only, no behavior change).
 *
 * The lineage backbone every graph algorithm's results reference, so PageRank,
 * CheiRank, Louvain, Leiden, k-core, and betweenness don't each invent their
 * own persistence semantics.
 *
 *   canonical source graph -> GraphAnalysisRun -> algorithm-specific results
 *     -> evaluation -> promotion -> FeatureRow
 *
 * Analysis results are not retrieval features merely because they exist —
 * GraphAnalysisRun proves a run happened; promotion into FeatureRowV1 proves
 * the result is useful for retrieval. Keep those two proofs separate.
 *
 * Relationship to existing PageRank-specific contracts (audited, not
 * duplicated — see openspec/changes/parent-atlas-graph-analysis-contract):
 *   - graph-contract.ts's GraphSnapshotSchema/PageRankRunSchema and
 *     pagerank-authority-contract.ts's PageRankAuthorityRecordSchema are the
 *     mature, PageRank-specific version of this pattern. This file
 *     generalizes it across algorithms; migrating PageRank onto
 *     GraphAnalysisRun is a later patch (Patch C), not done here.
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

/**
 * One row per algorithm execution. Individual metric/community results
 * reference `runId` — never write algorithm-specific columns onto
 * atlas_packets.
 */
export const GraphAnalysisRunSchema = AnalysisRunEnvelopeSchema.extend({
	algorithm: GraphAlgorithmSchema,
	graphRevision: z.string().min(1),
	projectionRevision: z.string().min(1),
	projectionName: z.string().min(1),
	nodeCount: z.number().int().nonnegative(),
	relationshipCount: z.number().int().nonnegative(),
})
	.strict();
export type GraphAnalysisRun = z.infer<typeof GraphAnalysisRunSchema>;

/**
 * graph_node_metrics row shape. Bounded to offline graph-analysis results
 * whose dimensionality varies by algorithm (pagerank, cheirank, kcore,
 * betweenness as rows). This is NOT a general EAV table for every Parent
 * Atlas feature — FeatureRowV1 below stays typed and small.
 */
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

/**
 * graph_community_assignments row shape — a single algorithm's assignment of
 * one packet to one community. Not the taxonomy itself (see
 * CommunityTaxonomyRecord below) — an assignment is merely an algorithm
 * output, e.g. `leiden_community_id: 46271` on its own is not a taxonomy.
 */
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

/**
 * graph_communities row shape — the taxonomy record. One row per discovered
 * community, carrying representative members and quality metadata, distinct
 * from the per-packet assignments above.
 */
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

/**
 * community-taxonomy-policy.ts's evaluation output (GA3/GA4). Compares
 * Louvain vs. Leiden on the same frozen projection. Never decides promotion
 * by itself — that requires a separate, explicit promotion step (GA9).
 */
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

/**
 * Baseline retrieval feature row (GA9 — promoted only). Deliberately small.
 * Candidate additions (cheirank, kcore, betweenness, communityAffinity, ppr,
 * bfsHops, weightedPathCost) stay out until an ablation (GA8) proves value —
 * adding them speculatively makes attribution impossible.
 */
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
