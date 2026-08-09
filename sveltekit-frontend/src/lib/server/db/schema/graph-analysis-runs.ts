/**
 * Graph Analysis Run/Promotion Contract — Patch B (persistence).
 *
 * See openspec/changes/parent-atlas-graph-analysis-contract for the full
 * architecture. These four tables are the ANALYSIS layer — offline graph
 * algorithm results. They never gain a foreign key into atlas_packets'
 * identity columns beyond packet_key (loose reference, not enforced FK,
 * matching this repo's "never join on feature_id alone, always packet_key"
 * identity discipline) and they never grow new algorithm-specific columns on
 * atlas_packets itself — that's the whole point of this layer split.
 *
 * Distinct from the existing PageRank-specific atlas_graph_authority_runs_v2 /
 * atlas_graph_authority_scores_v2 (schema/graph-authority-v2.ts) — those stay
 * as-is. Migrating PageRank onto this generalized contract is Patch C, not
 * done here. Both can coexist during the transition.
 */

import { sql } from 'drizzle-orm';
import { bigint, doublePrecision, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createAnalysisRunBaseColumns } from './analysis-runs-v2.js';

export const graphAlgorithmValues = [
  'pagerank',
  'cheirank',
  'personalized_pagerank',
  'louvain',
  'leiden',
  'kcore',
  'betweenness',
] as const;
export type GraphAlgorithmValue = (typeof graphAlgorithmValues)[number];

export const graphAnalysisRunStatusValues = ['running', 'succeeded', 'failed'] as const;
export type GraphAnalysisRunStatusValue = (typeof graphAnalysisRunStatusValues)[number];

/**
 * The lineage backbone. One row per algorithm execution — PageRank, CheiRank,
 * Louvain, Leiden, k-core, betweenness all write here, never inventing their
 * own run-tracking table.
 */
export const graphAnalysisRuns = pgTable('graph_analysis_runs', {
  ...createAnalysisRunBaseColumns(),
  graphRevision: text('graph_revision').notNull(),
  projectionRevision: text('projection_revision').notNull(),
  projectionName: text('projection_name').notNull(),
  nodeCount: bigint('node_count', { mode: 'number' }).notNull(),
  relationshipCount: bigint('relationship_count', { mode: 'number' }).notNull(),
}, (table) => ({
  algorithmIdx: index('graph_analysis_runs_algorithm_idx').on(table.algorithm, table.startedAt),
  graphRevisionIdx: index('graph_analysis_runs_graph_revision_idx').on(table.graphRevision),
  statusIdx: index('graph_analysis_runs_status_idx').on(table.status),
}));

/**
 * Versioned metric results — bounded to offline graph-analysis results whose
 * dimensionality varies by algorithm (pagerank, cheirank, kcore, betweenness
 * as rows via metric_name, not one column per algorithm). NOT a general EAV
 * table for every Parent Atlas feature; FeatureRowV1 (promoted, retrieval-
 * facing) stays typed and small elsewhere.
 */
export const graphNodeMetrics = pgTable('graph_node_metrics', {
  runId: uuid('run_id').notNull(),
  packetKey: text('packet_key').notNull(),
  symbolVersionId: text('symbol_version_id'),
  metricName: text('metric_name').notNull(),
  metricValue: doublePrecision('metric_value').notNull(),
  graphRevision: text('graph_revision').notNull(),
  algorithmRevision: text('algorithm_revision').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => ({
  primaryKey: primaryKey({ columns: [table.runId, table.packetKey, table.metricName] }),
  packetIdx: index('graph_node_metrics_packet_idx').on(table.packetKey, table.metricName),
  runIdx: index('graph_node_metrics_run_idx').on(table.runId),
  graphRevisionIdx: index('graph_node_metrics_graph_revision_idx').on(table.graphRevision, table.metricName),
}));

/**
 * Per-packet community assignment for a single algorithm run. An assignment
 * alone (e.g. leiden_community_id: 46271) is NOT a taxonomy — see
 * graphCommunities below for the taxonomy record.
 */
export const graphCommunityAssignments = pgTable('graph_community_assignments', {
  runId: uuid('run_id').notNull(),
  packetKey: text('packet_key').notNull(),
  algorithm: text('algorithm').notNull(),
  communityId: text('community_id').notNull(),
  level: integer('level'),
  graphRevision: text('graph_revision').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => ({
  primaryKey: primaryKey({ columns: [table.runId, table.packetKey] }),
  communityIdx: index('graph_community_assignments_community_idx').on(table.algorithm, table.communityId),
  packetIdx: index('graph_community_assignments_packet_idx').on(table.packetKey),
  runIdx: index('graph_community_assignments_run_idx').on(table.runId),
}));

/**
 * The taxonomy record — one row per discovered community, with
 * representative members and quality metadata. This is where Parent Atlas's
 * taxonomy actually begins; per-packet assignments above are inputs to it,
 * not the taxonomy itself.
 */
export const graphCommunities = pgTable('graph_communities', {
  runId: uuid('run_id').notNull(),
  algorithm: text('algorithm').notNull(),
  communityId: text('community_id').notNull(),
  parentCommunityId: text('parent_community_id'),
  memberCount: integer('member_count').notNull(),
  representativePacketKeys: jsonb('representative_packet_keys').default(sql`'[]'::jsonb`).notNull(),
  representativeSymbols: jsonb('representative_symbols').default(sql`'[]'::jsonb`).notNull(),
  label: text('label'),
  purity: doublePrecision('purity'),
  modularityContribution: doublePrecision('modularity_contribution'),
  metadata: jsonb('metadata').default(sql`'{}'::jsonb`).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => ({
  primaryKey: primaryKey({ columns: [table.runId, table.algorithm, table.communityId] }),
  uniqueRunCommunityIdx: uniqueIndex('graph_communities_unique_idx').on(table.runId, table.algorithm, table.communityId),
  algorithmIdx: index('graph_communities_algorithm_idx').on(table.algorithm),
}));

export type GraphAnalysisRunRow = typeof graphAnalysisRuns.$inferSelect;
export type NewGraphAnalysisRunRow = typeof graphAnalysisRuns.$inferInsert;
export type GraphNodeMetricRow = typeof graphNodeMetrics.$inferSelect;
export type NewGraphNodeMetricRow = typeof graphNodeMetrics.$inferInsert;
export type GraphCommunityAssignmentRow = typeof graphCommunityAssignments.$inferSelect;
export type NewGraphCommunityAssignmentRow = typeof graphCommunityAssignments.$inferInsert;
export type GraphCommunityRow = typeof graphCommunities.$inferSelect;
export type NewGraphCommunityRow = typeof graphCommunities.$inferInsert;
