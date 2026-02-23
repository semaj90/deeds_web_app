import { pgTable, uuid, text, timestamp, jsonb, integer, vector, index, varchar, boolean } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const cases = pgTable('cases', {
  id: uuid('id').defaultRandom().primaryKey(),
  caseNumber: varchar('case_number', { length: 255 }).notNull().unique(),
  title: text('title').notNull(),
  description: text('description'),
  status: varchar('status', { length: 50 }).notNull().default('open'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  caseNumberIdx: index('case_number_idx').on(table.caseNumber),
  statusIdx: index('status_idx').on(table.status),
}));

export const evidences = pgTable('evidences', {
  id: uuid('id').defaultRandom().primaryKey(),
  caseId: uuid('case_id').references(() => cases.id, { onDelete: 'cascade' }),
  fileName: varchar('file_name', { length: 512 }).notNull(),
  fileSize: integer('file_size'),
  mimeType: varchar('mime_type', { length: 255 }),
  storagePath: text('storage_path').notNull(),
  ocrText: text('ocr_text'),
  summary: text('summary'),
  entities: jsonb('entities').default([]),
  forensicFlags: jsonb('forensic_flags').default([]),
  status: varchar('status', { length: 50 }).notNull().default('pending'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  caseIdIdx: index('evidence_case_id_idx').on(table.caseId),
  statusIdx: index('evidence_status_idx').on(table.status),
  fileNameIdx: index('file_name_idx').on(table.fileName),
}));

export const embeddings = pgTable('embeddings', {
  id: uuid('id').defaultRandom().primaryKey(),
  evidenceId: uuid('evidence_id').references(() => evidences.id, { onDelete: 'cascade' }).notNull(),
  vector: vector('vector', { dimensions: 768 }).notNull(),
  model: varchar('model', { length: 255 }).notNull(),
  chunkIndex: integer('chunk_index').default(0),
  textSnippet: text('text_snippet'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  evidenceIdIdx: index('embedding_evidence_id_idx').on(table.evidenceId),
  vectorIdx: index('embedding_vector_idx').using('hnsw', table.vector.op('vector_cosine_ops')),
}));

export const analysisJobs = pgTable('analysis_jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  evidenceId: uuid('evidence_id').references(() => evidences.id, { onDelete: 'cascade' }),
  jobType: varchar('job_type', { length: 100 }).notNull(),
  status: varchar('status', { length: 50 }).notNull().default('pending'),
  result: jsonb('result'),
  error: text('error'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  evidenceIdIdx: index('job_evidence_id_idx').on(table.evidenceId),
  statusIdx: index('job_status_idx').on(table.status),
  jobTypeIdx: index('job_type_idx').on(table.jobType),
}));

export const caseTimeline = pgTable('case_timeline', {
  id: uuid('id').defaultRandom().primaryKey(),
  caseId: uuid('case_id').references(() => cases.id, { onDelete: 'cascade' }).notNull(),
  evidenceId: uuid('evidence_id').references(() => evidences.id, { onDelete: 'cascade' }),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  eventDate: timestamp('event_date').notNull(),
  description: text('description'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  caseIdIdx: index('timeline_case_id_idx').on(table.caseId),
  eventDateIdx: index('timeline_event_date_idx').on(table.eventDate),
}));

export type Case = typeof cases.$inferSelect;
export type NewCase = typeof cases.$inferInsert;
export type Evidence = typeof evidences.$inferSelect;
export type NewEvidence = typeof evidences.$inferInsert;
export type Embedding = typeof embeddings.$inferSelect;
export type NewEmbedding = typeof embeddings.$inferInsert;
export type AnalysisJob = typeof analysisJobs.$inferSelect;
export type NewAnalysisJob = typeof analysisJobs.$inferInsert;
export type TimelineEvent = typeof caseTimeline.$inferSelect;
export type NewTimelineEvent = typeof caseTimeline.$inferInsert;
