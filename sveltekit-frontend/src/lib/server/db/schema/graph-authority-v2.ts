import { sql } from 'drizzle-orm';
import { bigint, boolean, doublePrecision, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const graphSnapshotV2StatusValues = ['BUILDING', 'VALIDATED', 'SUPERSEDED', 'FAILED'] as const;
export type GraphSnapshotV2Status = (typeof graphSnapshotV2StatusValues)[number];

export const graphResolutionIssueStatusValues = ['OPEN', 'RETRYABLE', 'QUARANTINED', 'IGNORED_BY_POLICY', 'RESOLVED', 'SUPERSEDED'] as const;
export type GraphResolutionIssueV2Status = (typeof graphResolutionIssueStatusValues)[number];

export const graphAuthorityEngineValues = ['networkx', 'neo4j_gds'] as const;
export type GraphAuthorityEngine = (typeof graphAuthorityEngineValues)[number];

export const graphAuthorityStatusValues = ['BUILDING', 'VALIDATING', 'PASSED', 'FAILED', 'SUPERSEDED'] as const;
export type GraphAuthorityRunStatus = (typeof graphAuthorityStatusValues)[number];

export const graphAuthorityBandValues = ['very-low', 'low', 'medium', 'high', 'very-high'] as const;
export type GraphAuthorityBand = (typeof graphAuthorityBandValues)[number];

export const graphSnapshotExclusionsV2 = pgTable('atlas_graph_snapshot_exclusions_v2', {
  exclusionId: uuid('exclusion_id').defaultRandom().primaryKey().notNull(),
  snapshotId: uuid('snapshot_id').notNull(),
  candidateKey: text('candidate_key'),
  packetKey: text('packet_key'),
  sourceRef: text('source_ref'),
  exclusionStage: text('exclusion_stage').notNull(),
  exclusionReason: text('exclusion_reason').notNull(),
  evidence: jsonb('evidence').default(sql`'{}'::jsonb`).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => ({
  snapshotIdx: index('atlas_graph_snapshot_exclusions_v2_snapshot_idx').on(table.snapshotId),
  uniqueExclusionIdx: uniqueIndex('atlas_graph_snapshot_exclusions_v2_unique_idx').on(table.snapshotId, table.exclusionStage, table.exclusionReason, table.candidateKey),
}));

export const graphSnapshotsV2 = pgTable('atlas_graph_snapshots_v2', {
  snapshotId: uuid('snapshot_id').primaryKey().notNull(),
  schemaVersion: text('schema_version').notNull(),
  status: text('status').notNull(),
  sourceManifest: jsonb('source_manifest').default(sql`'{}'::jsonb`).notNull(),
  projectionPolicy: jsonb('projection_policy').default(sql`'{}'::jsonb`).notNull(),
  nodeCount: bigint('node_count', { mode: 'number' }).default(0).notNull(),
  edgeCount: bigint('edge_count', { mode: 'number' }).default(0).notNull(),
  relationEventCount: bigint('relation_event_count', { mode: 'number' }).default(0).notNull(),
  excludedCount: bigint('excluded_count', { mode: 'number' }).default(0).notNull(),
  unresolvedCount: bigint('unresolved_count', { mode: 'number' }).default(0).notNull(),
  sourceHash: text('source_hash').notNull(),
  topologyHash: text('topology_hash').notNull(),
  policyHash: text('policy_hash').notNull(),
  eligibilityPredicate: text('eligibility_predicate').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  finalizedAt: timestamp('finalized_at', { withTimezone: true, mode: 'string' }),
});

export const graphNodesV2 = pgTable('atlas_graph_nodes_v2', {
  snapshotId: uuid('snapshot_id').notNull(),
  nodeKey: text('node_key').notNull(),
  nodeType: text('node_type').notNull(),
  packetKey: text('packet_key'),
  treeNodeId: uuid('tree_node_id'),
  sourceRef: text('source_ref'),
  contentHash: text('content_hash'),
  properties: jsonb('properties').default(sql`'{}'::jsonb`).notNull(),
}, (table) => ({
  primaryKey: primaryKey({ columns: [table.snapshotId, table.nodeKey] }),
  snapshotIdx: index('atlas_graph_nodes_v2_snapshot_idx').on(table.snapshotId),
  nodeTypeIdx: index('atlas_graph_nodes_v2_node_type_idx').on(table.nodeType),
  treeNodeIdx: index('atlas_graph_nodes_v2_tree_node_idx').on(table.snapshotId, table.treeNodeId),
  packetIdx: index('atlas_graph_nodes_v2_packet_idx').on(table.snapshotId, table.packetKey),
  snapshotFk: foreignKey({
    columns: [table.snapshotId],
    foreignColumns: [graphSnapshotsV2.snapshotId],
    name: 'atlas_graph_nodes_v2_snapshot_id_fkey',
  }).onDelete('restrict'),
}));

export const graphEdgesV2 = pgTable('atlas_graph_edges_v2', {
  snapshotId: uuid('snapshot_id').notNull(),
  edgeKey: text('edge_key').notNull(),
  sourceNodeKey: text('source_node_key').notNull(),
  targetNodeKey: text('target_node_key').notNull(),
  edgeType: text('edge_type').notNull(),
  weight: doublePrecision('weight').notNull(),
  confidence: doublePrecision('confidence').notNull(),
  provenance: text('provenance').notNull(),
  properties: jsonb('properties').default(sql`'{}'::jsonb`).notNull(),
}, (table) => ({
  primaryKey: primaryKey({ columns: [table.snapshotId, table.edgeKey] }),
  sourceIdx: index('atlas_graph_edges_v2_source_idx').on(table.snapshotId, table.sourceNodeKey),
  targetIdx: index('atlas_graph_edges_v2_target_idx').on(table.snapshotId, table.targetNodeKey),
  snapshotFk: foreignKey({
    columns: [table.snapshotId],
    foreignColumns: [graphSnapshotsV2.snapshotId],
    name: 'atlas_graph_edges_v2_snapshot_id_fkey',
  }).onDelete('restrict'),
  sourceNodeFk: foreignKey({
    columns: [table.snapshotId, table.sourceNodeKey],
    foreignColumns: [graphNodesV2.snapshotId, graphNodesV2.nodeKey],
    name: 'atlas_graph_edges_v2_source_node_fk',
  }).onDelete('restrict'),
  targetNodeFk: foreignKey({
    columns: [table.snapshotId, table.targetNodeKey],
    foreignColumns: [graphNodesV2.snapshotId, graphNodesV2.nodeKey],
    name: 'atlas_graph_edges_v2_target_node_fk',
  }).onDelete('restrict'),
}));

export const graphRelationEventsV2 = pgTable('atlas_graph_relation_events_v2', {
  snapshotId: uuid('snapshot_id').notNull(),
  relationId: text('relation_id').notNull(),
  relationType: text('relation_type').notNull(),
  sourceRef: text('source_ref').notNull(),
  evidenceSpan: text('evidence_span').notNull(),
  confidence: doublePrecision('confidence').notNull(),
  topologyHash: text('topology_hash').notNull(),
}, (table) => ({
  primaryKey: primaryKey({ columns: [table.snapshotId, table.relationId] }),
  snapshotIdx: index('atlas_graph_relation_events_v2_snapshot_idx').on(table.snapshotId),
  relationTypeIdx: index('atlas_graph_relation_events_v2_type_idx').on(table.relationType),
  snapshotFk: foreignKey({
    columns: [table.snapshotId],
    foreignColumns: [graphSnapshotsV2.snapshotId],
    name: 'atlas_graph_relation_events_v2_snapshot_id_fkey',
  }).onDelete('restrict'),
}));

export const graphRelationParticipantsV2 = pgTable('atlas_graph_relation_participants_v2', {
  snapshotId: uuid('snapshot_id').notNull(),
  relationId: text('relation_id').notNull(),
  nodeKey: text('node_key').notNull(),
  role: text('role').notNull(),
  ordinal: integer('ordinal').notNull(),
}, (table) => ({
  primaryKey: primaryKey({ columns: [table.snapshotId, table.relationId, table.nodeKey, table.role] }),
  relationIdx: index('atlas_graph_relation_participants_v2_relation_idx').on(table.snapshotId, table.relationId),
  nodeIdx: index('atlas_graph_relation_participants_v2_node_idx').on(table.snapshotId, table.nodeKey),
  relationFk: foreignKey({
    columns: [table.snapshotId, table.relationId],
    foreignColumns: [graphRelationEventsV2.snapshotId, graphRelationEventsV2.relationId],
    name: 'atlas_graph_relation_participants_v2_relation_fk',
  }).onDelete('restrict'),
  nodeFk: foreignKey({
    columns: [table.snapshotId, table.nodeKey],
    foreignColumns: [graphNodesV2.snapshotId, graphNodesV2.nodeKey],
    name: 'atlas_graph_relation_participants_v2_node_fk',
  }).onDelete('restrict'),
}));

export const graphResolutionIssuesV2 = pgTable('atlas_graph_resolution_issues_v2', {
  issueId: uuid('issue_id').defaultRandom().primaryKey().notNull(),
  snapshotId: uuid('snapshot_id').notNull(),
  issueFingerprint: text('issue_fingerprint').notNull(),
  packetKey: text('packet_key'),
  nodeKey: text('node_key'),
  treeNodeId: uuid('tree_node_id'),
  sourceRef: text('source_ref'),
  issueType: text('issue_type').notNull(),
  issueStatus: text('issue_status').notNull(),
  exclusionStage: text('exclusion_stage').notNull(),
  candidateMatches: jsonb('candidate_matches').default(sql`'[]'::jsonb`).notNull(),
  evidence: jsonb('evidence').default(sql`'{}'::jsonb`).notNull(),
  occurrenceCount: integer('occurrence_count').default(1).notNull(),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true, mode: 'string' }),
  topologyHash: text('topology_hash').notNull(),
}, (table) => ({
  snapshotIdx: index('atlas_graph_resolution_issues_v2_snapshot_idx').on(table.snapshotId),
  statusIdx: index('atlas_graph_resolution_issues_v2_status_idx').on(table.issueStatus, table.lastSeenAt),
  uniqueIssueIdx: uniqueIndex('atlas_graph_resolution_issues_v2_unique_idx').on(table.snapshotId, table.issueFingerprint),
  snapshotFk: foreignKey({
    columns: [table.snapshotId],
    foreignColumns: [graphSnapshotsV2.snapshotId],
    name: 'atlas_graph_resolution_issues_v2_snapshot_id_fkey',
  }).onDelete('restrict'),
  nodeFk: foreignKey({
    columns: [table.snapshotId, table.nodeKey],
    foreignColumns: [graphNodesV2.snapshotId, graphNodesV2.nodeKey],
    name: 'atlas_graph_resolution_issues_v2_node_fk',
  }).onDelete('restrict'),
}));

export const graphAuthorityRunsV2 = pgTable('atlas_graph_authority_runs_v2', {
  runId: uuid('run_id').primaryKey().notNull(),
  snapshotId: uuid('snapshot_id').notNull(),
  engine: text('engine').notNull(),
  algorithm: text('algorithm').notNull(),
  algorithmVersion: text('algorithm_version').notNull(),
  configuration: jsonb('configuration').default(sql`'{}'::jsonb`).notNull(),
  topologyHash: text('topology_hash').notNull(),
  nodeCount: bigint('node_count', { mode: 'number' }).notNull(),
  edgeCount: bigint('edge_count', { mode: 'number' }).notNull(),
  resultHash: text('result_hash').notNull(),
  status: text('status').notNull(),
  didConverge: boolean('did_converge').notNull(),
  ranIterations: integer('ran_iterations').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true, mode: 'string' }).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true, mode: 'string' }),
}, (table) => ({
  snapshotIdx: index('atlas_graph_authority_runs_v2_snapshot_idx').on(table.snapshotId),
  statusIdx: index('atlas_graph_authority_runs_v2_status_idx').on(table.status, table.startedAt),
  snapshotFk: foreignKey({
    columns: [table.snapshotId],
    foreignColumns: [graphSnapshotsV2.snapshotId],
    name: 'atlas_graph_authority_runs_v2_snapshot_id_fkey',
  }).onDelete('restrict'),
}));

export const graphAuthorityScoresV2 = pgTable('atlas_graph_authority_scores_v2', {
  runId: uuid('run_id').notNull(),
  snapshotId: uuid('snapshot_id').notNull(),
  nodeKey: text('node_key').notNull(),
  packetKey: text('packet_key'),
  pagerankRaw: doublePrecision('pagerank_raw').notNull(),
  pagerankL1: doublePrecision('pagerank_l1').notNull(),
  authorityPercentile: doublePrecision('authority_percentile').notNull(),
  authorityBand: text('authority_band').notNull(),
  normalizationAppliedBy: text('normalization_applied_by').notNull(),
  topologyHash: text('topology_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => ({
  primaryKey: primaryKey({ columns: [table.runId, table.nodeKey] }),
  packetIdx: index('atlas_graph_authority_scores_v2_packet_idx').on(table.snapshotId, table.packetKey),
  runSnapshotFk: foreignKey({
    columns: [table.runId, table.snapshotId],
    foreignColumns: [graphAuthorityRunsV2.runId, graphAuthorityRunsV2.snapshotId],
    name: 'atlas_graph_authority_scores_v2_run_fk',
  }).onDelete('restrict'),
  nodeFk: foreignKey({
    columns: [table.snapshotId, table.nodeKey],
    foreignColumns: [graphNodesV2.snapshotId, graphNodesV2.nodeKey],
    name: 'atlas_graph_authority_scores_v2_node_fk',
  }).onDelete('restrict'),
  runIdx: index('atlas_graph_authority_scores_v2_run_idx').on(table.runId),
}));

export type GraphSnapshotV2Row = typeof graphSnapshotsV2.$inferSelect;
export type NewGraphSnapshotV2Row = typeof graphSnapshotsV2.$inferInsert;
export type GraphNodeV2Row = typeof graphNodesV2.$inferSelect;
export type NewGraphNodeV2Row = typeof graphNodesV2.$inferInsert;
export type GraphEdgeV2Row = typeof graphEdgesV2.$inferSelect;
export type NewGraphEdgeV2Row = typeof graphEdgesV2.$inferInsert;
export type GraphRelationEventV2Row = typeof graphRelationEventsV2.$inferSelect;
export type NewGraphRelationEventV2Row = typeof graphRelationEventsV2.$inferInsert;
export type GraphRelationParticipantV2Row = typeof graphRelationParticipantsV2.$inferSelect;
export type NewGraphRelationParticipantV2Row = typeof graphRelationParticipantsV2.$inferInsert;
export type GraphResolutionIssueV2Row = typeof graphResolutionIssuesV2.$inferSelect;
export type NewGraphResolutionIssueV2Row = typeof graphResolutionIssuesV2.$inferInsert;
export type GraphAuthorityRunV2Row = typeof graphAuthorityRunsV2.$inferSelect;
export type NewGraphAuthorityRunV2Row = typeof graphAuthorityRunsV2.$inferInsert;
export type GraphAuthorityScoreV2Row = typeof graphAuthorityScoresV2.$inferSelect;
export type NewGraphAuthorityScoreV2Row = typeof graphAuthorityScoresV2.$inferInsert;
