import { pgTable, uuid, text, numeric, jsonb, timestamp, index, integer, bigint } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { libraryDocuments, processingStatusEnum } from './library-documents';

/**
 * Ingestion jobs — stage-tracked pipeline progress.
 * One job per document ingestion run. Tracks stage, progress %, metrics, errors.
 */
export const ingestionJobs = pgTable('ingestion_jobs', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	documentId: uuid('document_id').notNull().references(() => libraryDocuments.id, { onDelete: 'cascade' }),
	stage: processingStatusEnum('stage').notNull().default('queued'),
	status: text('status').notNull().default('queued'), // queued | running | failed | complete
	progress: numeric('progress', { precision: 5, scale: 2 }).default('0'),
	errorText: text('error_text'),
	metricsJson: jsonb('metrics_json').default({}),
	sourceHash: text('source_hash'), // enqueue-time SHA-256; worker must match the document snapshot
	attemptCount: integer('attempt_count').notNull().default(0),
	maxAttempts: integer('max_attempts').notNull().default(3),
	availableAt: timestamp('available_at', { withTimezone: true }).defaultNow().notNull(),
	leaseToken: uuid('lease_token'),
	fencingToken: bigint('fencing_token', { mode: 'number' }).notNull().default(0),
	leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
	docIdx: index('ingestion_jobs_doc_idx').on(table.documentId),
	statusIdx: index('ingestion_jobs_status_idx').on(table.status),
}));

// Type inference
export type IngestionJob = typeof ingestionJobs.$inferSelect;
export type NewIngestionJob = typeof ingestionJobs.$inferInsert;
