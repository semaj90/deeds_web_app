import { pgTable, text, timestamp, jsonb, doublePrecision, uuid, primaryKey } from 'drizzle-orm/pg-core';

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
	metadata: jsonb('metadata').default({}).notNull(),
}, (t) => [
	primaryKey({ columns: [t.snapshotId, t.stableKey] })
]);
