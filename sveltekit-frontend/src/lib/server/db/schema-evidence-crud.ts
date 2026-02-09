/**
 * Evidence CRUD + RAG Integration Schema
 *
 * This schema defines tables for:
 * - citation_tags: User-defined labels for evidence
 * - evidence_tags: M2M relationship between evidence and tags
 * - rag_index_metadata: RAG index metadata with tag weights
 * - audit_log: Immutable audit trail for compliance
 *
 * Requirements: 1, 2, 3: 3.1-3.5: 6.1-6.5: 7.1-7.5
 */

import { sql } from 'drizzle-orm';
import {
    index,
    jsonb,
    pgEnum,
    pgTable,
    primaryKey,
    real,
    text,
    timestamp,
    unique,
    uuid,
    varchar,
} from 'drizzle-orm/pg-core';
import { evidence } from './schema-postgres';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

// === ENUMS ===

export const jurisdictionEnum = pgEnum('jurisdiction', ['CA', 'NY', 'TX', 'Fed-US', 'Other']);

export const auditOperationEnum = pgEnum('audit_operation', ['CREATE', 'UPDATE', 'DELETE']);
export const auditTableEnum = pgEnum('audit_table', [
 'Evidence',
 'Tag',
 'EvidenceTag',
 'RAGIndex'
]);

// === CITATION TAGS TABLE ===
// Task 2: User-defined labels for evidence files
// Requirements: 1, 2.3
export const citationTags = pgTable('citation_tags', {
 			id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
			name: varchar('name', { length: 255 }).notNull(),
			jurisdiction: jurisdictionEnum('jurisdiction').notNull(),
			description: text('description'),
			createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
			updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
 },
	(table) => ({
 // Unique constraint on (name, jurisdiction)
 uniqueNameJurisdiction: unique('citation_tags_name_jurisdiction_unique').on(
 table.name, table.jurisdiction
 ),
 // Index for jurisdiction filtering
 jurisdictionIdx: index('citation_tags_jurisdiction_idx').on(table.jurisdiction),
 // Index for name search
 nameIdx: index('citation_tags_name_idx').on(table.name),
 })
);

// === EVIDENCE TAGS M2M TABLE ===
// Task 3: Many-to-many relationship between evidence and tags
// Requirements: 1, 2.3
export const evidenceTags = pgTable('evidence_tags', {
 		evidenceId: uuid('evidence_id').notNull().references(() => evidence.id, { onDelete: 'cascade' }),
		tagId: uuid('tag_id').notNull().references(() => citationTags.id, { onDelete: 'cascade' }),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
 .defaultNow()
 .notNull(),
 },
	(table) => ({
 // Composite primary key
 pk: primaryKey({
	columns: [table.evidenceId, table.tagId]  }),
 // Index for evidence lookup
 evidenceIdx: index('evidence_tags_evidence_id_idx').on(table.evidenceId),
 // Index for tag lookup
 tagIdx: index('evidence_tags_tag_id_idx').on(table.tagId),
 })
);

// === RAG INDEX METADATA TABLE ===
// Task 4: RAG index metadata with tag weights
// Requirements: 3.1-3.5: 7.1-7.5
export const ragIndexMetadata = pgTable('rag_index_metadata', {
 		id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
		chunkId: uuid('chunk_id').notNull(),
		evidenceId: uuid('evidence_id')
 .notNull()
 .references(() => evidence.id, { onDelete: 'cascade' }),
 // Array of tag names for weighting
 tags: text('tags')
 .array()
 .default(sql`'{}'::text[]`)
 .notNull(),
 // Weight multiplier (default 1.0: 1.5 if tags match)
 		tagWeight: real('tag_weight').default(1.0).notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
 .defaultNow()
 .notNull(),
 },
	(table) => ({
 // Index for chunk lookup
 chunkIdx: index('rag_index_metadata_chunk_id_idx').on(table.chunkId),
 // Index for evidence lookup
 evidenceIdx: index('rag_index_metadata_evidence_id_idx').on(table.evidenceId),
 // GIN index for tags array search
 tagsIdx: index('rag_index_metadata_tags_idx').using('gin', table.tags),
 })
);

// === AUDIT LOG TABLE ===
// Task 5: Immutable audit trail for compliance
// Requirements: 6.1-6.5
export const auditLog = pgTable('audit_log',
 {
 			id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
			userId: uuid('user_id'),
			resourceType: auditTableEnum('resource_type').notNull(),
			resourceId: uuid('resource_id').notNull(),
			operation: auditOperationEnum('operation').notNull(),
			oldValues: jsonb('old_values'),
			newValues: jsonb('new_values'),
 // Timestamp is immutable - no updates allowed
 timestamp: timestamp('timestamp', { withTimezone: true, mode: 'string' })
 .defaultNow()
 .notNull(),
 },
	(table) => ({
 // Index for resource queries
 resourceIdx: index('audit_log_resource_idx').on(table.resourceType, table.resourceId),
 // Index for user queries
 userIdx: index('audit_log_user_id_idx').on(table.userId),
 // Index for timestamp queries
 timestampIdx: index('audit_log_timestamp_idx').on(table.timestamp),
 })
);

// === TYPE EXPORTS ===

export type CitationTag = typeof citationTags.$inferSelect;
export type NewCitationTag = typeof citationTags.$inferInsert;

export type EvidenceTag = typeof evidenceTags.$inferSelect;
export type NewEvidenceTag = typeof evidenceTags.$inferInsert;

export type RAGIndexMetadata = typeof ragIndexMetadata.$inferSelect;
export type NewRAGIndexMetadata = typeof ragIndexMetadata.$inferInsert;

export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;

// === JURISDICTION TYPE ===
export type Jurisdiction = 'CA' | 'NY' | 'TX' | 'Fed-US' | 'Other';
export const JURISDICTIONS: Jurisdiction[] = ['CA', 'NY', 'TX', 'Fed-US', 'Other'];




