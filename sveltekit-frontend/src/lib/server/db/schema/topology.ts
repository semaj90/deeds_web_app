import { pgTable, text, timestamp, jsonb, doublePrecision, real, smallint, uuid, primaryKey, index } from 'drizzle-orm/pg-core';

export const topologySnapshots = pgTable('topology_snapshots', {
	id: uuid('id').primaryKey().defaultRandom(),
	runId: text('run_id').notNull(),
	gitCommit: text('git_commit'),
	repoRoot: text('repo_root').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	metadata: jsonb('metadata').default({}).notNull(),
});

export const topologyPositions = pgTable('topology_positions', {
	snapshotId: uuid('snapshot_id').references(() => topologySnapshots.id, { onDelete: 'cascade' }).notNull(),
	stableKey: text('stable_key').notNull(),
	x: doublePrecision('x'),
	y: doublePrecision('y'),
	z: doublePrecision('z'),
	t: doublePrecision('t'),
	clusterKey: text('cluster_key'),
	// topology classification byte (bits 0-3 = class, 4-5 = risk, 6-7 = trust)
	topoByte: smallint('topo_byte'),
	sourceKind: text('source_kind'),
	sourceHash: text('source_hash'),
	metadata: jsonb('metadata').default({}).notNull(),
}, (t) => [
	primaryKey({ columns: [t.snapshotId, t.stableKey] }),
	index('topology_positions_topo_byte_idx').on(t.topoByte),
]);

/**
 * Tensor analysis cache — one row per stable_key.
 * Stores GPU projection results, topo byte, manifold4 coordinates,
 * and Qdrant/ACE payload hints derived from RTX CUDA analysis.
 *
 * content_hash: sha256 of the file's current content.
 *   Unchanged hash → skip GPU recompute, serve from cache.
 *   Changed hash   → GPU reanalysis required.
 */
export const tensorAnalysisCache = pgTable('tensor_analysis_cache', {
	stableKey:            text('stable_key').primaryKey(),
	contentHash:          text('content_hash').notNull(),

	topoByte:             smallint('topo_byte').notNull().default(0),
	topoHex:              text('topo_hex').notNull().default('0x00'),
	topoClass:            text('topo_class').notNull().default('unclassified'),

	// manifold4 as individual columns for SQL range queries
	manifold4X:           real('manifold4_x').notNull().default(0),
	manifold4Y:           real('manifold4_y').notNull().default(0),
	manifold4Z:           real('manifold4_z').notNull().default(0),
	manifold4W:           real('manifold4_w').notNull().default(0),

	centroidKey:          text('centroid_key'),
	somCluster:           smallint('som_cluster'),

	graphAuthorityScore:  real('graph_authority_score').notNull().default(0),
	tensorAffinityScore:  real('tensor_affinity_score').notNull().default(0),

	// JSONB columns for rich payload / audit trail
	tensorJson:           jsonb('tensor_json').notNull().default({}),
	qdrantPayload:        jsonb('qdrant_payload').notNull().default({}),
	outputMeta:           jsonb('output_meta').notNull().default({}),

	createdAt:            timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	updatedAt:            timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
	index('tensor_analysis_cache_topo_byte_idx').on(t.topoByte),
	index('tensor_analysis_cache_centroid_idx').on(t.centroidKey),
]);

export type TensorAnalysisCache = typeof tensorAnalysisCache.$inferSelect;
export type NewTensorAnalysisCache = typeof tensorAnalysisCache.$inferInsert;