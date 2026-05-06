import {
    pgTable,
    uuid,
    text,
    integer,
    jsonb,
    timestamp,
    index
} from 'drizzle-orm/pg-core';

export const directoryClusterCheckpoints = pgTable('directory_cluster_checkpoints', {
    id: uuid('id').primaryKey().defaultRandom(),
    stableKey: text('stable_key').notNull().unique(),
    directoryPath: text('directory_path').notNull(),
    checkpointHash: text('checkpoint_hash').notNull(),
    fileCount: integer('file_count').notNull().default(0),
    routeCount: integer('route_count').notNull().default(0),
    testCount: integer('test_count').notNull().default(0),
    clusterLabel: text('cluster_label'),
    tags: text('tags').array().notNull().default([]),
    audit: jsonb('audit').notNull().default({}),
    metadata: jsonb('metadata').notNull().default({}),
    indexedAt: timestamp('indexed_at', { withTimezone: true }).defaultNow()
}, (table) => ({
    pathIdx: index('dir_cluster_path_idx').on(table.directoryPath)
}));
