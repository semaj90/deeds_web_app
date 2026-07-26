// ----------------------------------------------------------------------
// 1. SCHEMA DEFINITION (drizzle/schema/lineage.ts)
// ----------------------------------------------------------------------
import { pgTable, uuid, text, timestamp, integer } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const atlasLineageLedger = pgTable('atlas_lineage_ledger', {
    ledger_id: uuid('ledger_id').default(sql`gen_random_uuid()`).primaryKey(),
    source_ref: text('source_ref').notNull(),
    qdrant_point_id: text('qdrant_point_id').default(null),
    qdrant_collection: text('qdrant_collection').default(null),
    qdrant_vector_dim: integer('qdrant_vector_dim').default(null),
    identity_lane: text('identity_lane').notNull(),
    proposed_action: text('proposed_action').notNull(),
    identity_match_cardinality: integer('identity_match_cardinality').default(1),
    proposed_qdrant_id: text('proposed_qdrant_id'),
    proposed_qdrant_collection: text('proposed_qdrant_collection'),
    proposed_qdrant_dim: integer('proposed_qdrant_dim'),
    audit_run_id: text('audit_run_id').notNull(),
    created_at: timestamp('created_at').defaultNow().notNull(),
    -- Indexing based on the primary keys/sources for faster lookups
    // CREATE UNIQUE INDEX idx_source_ref_unique ON lineage.atlas_lineage_ledger (source_ref, audit_run_id)
    // CREATE INDEX idx_source_ref ON lineage.atlas_lineage_ledger (source_ref);
});
