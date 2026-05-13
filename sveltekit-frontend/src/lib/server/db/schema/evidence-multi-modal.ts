import { pgTable, uuid, text, numeric, jsonb, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { cases } from './legal-cases.js';

/**
 * evidence_items — the durable ledger of all evidence assets.
 * Qdrant and Neo4j pull from here to maintain consistency.
 */
export const evidenceItems = pgTable('evidence_items', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	caseId: uuid('case_id').notNull().references(() => cases.id, { onDelete: 'cascade' }),
	modality: text('modality').notNull(), // video | audio | image | document
	sourceUrl: text('source_url'),
	storageUri: text('storage_uri').notNull(), // SeaweedFS path
	status: text('status').notNull().default('queued'), // queued | processing | completed | failed
	sha256: text('sha256'),
	metadataJson: jsonb('metadata_json').default({}),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
	caseIdx: index('evidence_items_case_idx').on(table.caseId),
	statusIdx: index('evidence_items_status_idx').on(table.status),
}));

/**
 * evidence_media_assets — derived assets (extracted audio, keyframes, etc.)
 */
export const evidenceMediaAssets = pgTable('evidence_media_assets', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	evidenceId: uuid('evidence_id').notNull().references(() => evidenceItems.id, { onDelete: 'cascade' }),
	assetType: text('asset_type').notNull(), // original | audio_mono | frame
	storageUri: text('storage_uri').notNull(),
	mimeType: text('mime_type'),
	metadataJson: jsonb('metadata_json').default({}),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
	evidenceIdx: index('evidence_media_assets_evidence_idx').on(table.evidenceId),
}));

/**
 * evidence_transcript_segments — Whisper-style candidate segments.
 * Legal note: candidates only, grounded in source media.
 */
export const evidenceTranscriptSegments = pgTable('evidence_transcript_segments', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	evidenceId: uuid('evidence_id').notNull().references(() => evidenceItems.id, { onDelete: 'cascade' }),
	startMs: integer('start_ms').notNull(),
	endMs: integer('end_ms').notNull(),
	text: text('text').notNull(),
	language: text('language'),
	translatedText: text('translated_text'),
	confidence: numeric('confidence', { precision: 4, scale: 3 }),
	model: text('model'),
	metadataJson: jsonb('metadata_json').default({}),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
	evidenceIdx: index('evidence_transcript_segments_evidence_idx').on(table.evidenceId),
	timeIdx: index('evidence_transcript_segments_time_idx').on(table.startMs, table.endMs),
}));

/**
 * evidence_processing_jobs — status and progress of ingestion tasks.
 */
export const evidenceProcessingJobs = pgTable('evidence_processing_jobs', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	evidenceId: uuid('evidence_id').notNull().references(() => evidenceItems.id, { onDelete: 'cascade' }),
	status: text('status').notNull().default('running'),
	progress: numeric('progress', { precision: 5, scale: 2 }).default('0'),
	errorText: text('error_text'),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
	evidenceIdx: index('evidence_processing_jobs_evidence_idx').on(table.evidenceId),
}));

/**
 * evidence_frames — visual analysis segments (V2).
 */
export const evidenceFrames = pgTable('evidence_frames', {
	id: uuid('id').default(sql`gen_random_uuid()`).primaryKey().notNull(),
	evidenceId: uuid('evidence_id').notNull().references(() => evidenceItems.id, { onDelete: 'cascade' }),
	timestampMs: integer('timestamp_ms').notNull(),
	storageUri: text('storage_uri').notNull(),
	caption: text('caption'),
	objectsJson: jsonb('objects_json').default([]),
	ocrText: text('ocr_text'),
	tagsJson: jsonb('tags_json').default([]),
	vlmModel: text('vlm_model'),
	confidence: numeric('confidence', { precision: 4, scale: 3 }),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
	evidenceIdx: index('evidence_frames_evidence_idx').on(table.evidenceId),
}));
