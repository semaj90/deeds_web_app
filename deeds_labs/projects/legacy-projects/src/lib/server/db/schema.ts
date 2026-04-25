/**
 * Database Schema for Legal AI Platform
 * Using Drizzle ORM with PostgreSQL + pgvector
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  serial,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { vector } from 'drizzle-orm/pg-vector';

/**
 * Evidence table with pgvector support
 */
export const evidence = pgTable('evidence', {
  id: uuid('id').primaryKey().defaultRandom(),
  case_id: uuid('case_id').notNull(),

  // Evidence identification
  evidence_number: varchar('evidence_number', { length: 100 }).notNull(),
  title: text('title').notNull(),
  description: text('description'),

  // Evidence type and classification
  evidence_type: varchar('evidence_type', { length: 50 }).notNull(),

  // File and storage information
  file_name: varchar('file_name', { length: 255 }),
  file_path: varchar('file_path', { length: 1000 }),
  file_size: integer('file_size'),
  mime_type: varchar('mime_type', { length: 100 }),
  checksum: varchar('checksum', { length: 64 }), // SHA-256

  // Chain of custody
  source: text('source'),
  custody_chain: jsonb('custody_chain').default(sql`'[]'::jsonb`),
  authenticated: boolean('authenticated').notNull().default(false),

  // Analysis and processing
  analyzed: boolean('analyzed').notNull().default(false),
  analysis_results: jsonb('analysis_results').default(sql`'{}'::jsonb`),
  ocr_text: text('ocr_text'),

  // Classification and tags
  confidentiality_level: varchar('confidentiality_level', { length: 20 })
    .notNull()
    .default('public'),
  tags: jsonb('tags').default(sql`'[]'::jsonb`),

  // Dates
  date_created: timestamp('date_created', { withTimezone: true }).notNull().defaultNow(),
  date_modified: timestamp('date_modified', { withTimezone: true }).notNull().defaultNow(),
  date_received: timestamp('date_received', { withTimezone: true }),
  date_analyzed: timestamp('date_analyzed', { withTimezone: true }),

  // Metadata
  metadata: jsonb('metadata').default(sql`'{}'::jsonb`),

  // Archive status
  archived: boolean('archived').notNull().default(false),

  // Audit fields
  created_by: uuid('created_by'),
  modified_by: uuid('modified_by'),

  // Vector embedding (384 dimensions for embeddinggemma)
  // Note: Requires pgvector extension
  // embedding: vector('embedding', { dimensions: 384 }),
});

/**
 * Cases table
 */
export const cases = pgTable('cases', {
  id: uuid('id').primaryKey().defaultRandom(),
  case_number: varchar('case_number', { length: 100 }).notNull().unique(),
  title: varchar('title', { length: 500 }).notNull(),
  description: text('description'),
  status: varchar('status', { length: 50 }).notNull().default('active'),
  priority: varchar('priority', { length: 20 }).notNull().default('medium'),

  // Case metadata
  case_type: varchar('case_type', { length: 100 }),
  jurisdiction: varchar('jurisdiction', { length: 100 }),
  court: varchar('court', { length: 200 }),

  // Parties
  client_name: varchar('client_name', { length: 200 }),
  opposing_party: varchar('opposing_party', { length: 200 }),
  assigned_attorney: uuid('assigned_attorney'),

  // Dates
  date_created: timestamp('date_created', { withTimezone: true }).notNull().defaultNow(),
  date_modified: timestamp('date_modified', { withTimezone: true }).notNull().defaultNow(),
  date_filed: timestamp('date_filed', { withTimezone: true }),
  date_resolved: timestamp('date_resolved', { withTimezone: true }),

  // Metadata
  metadata: jsonb('metadata').default(sql`'{}'::jsonb`),

  // Archive
  archived: boolean('archived').notNull().default(false),

  // Audit
  created_by: uuid('created_by'),
  modified_by: uuid('modified_by'),
});

// Export types for TypeScript
export type Evidence = typeof evidence.$inferSelect;
export type NewEvidence = typeof evidence.$inferInsert;
export type Case = typeof cases.$inferSelect;
export type NewCase = typeof cases.$inferInsert;

// 🧠 User Reports Table
export const reports = pgTable('reports', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  summary: text('summary'),
  tags: jsonb('tags')
    .$type<string[]>()
    .default(sql`'[]'::jsonb`),
  autoKeywords: jsonb('auto_keywords')
    .$type<string[]>()
    .default(sql`'[]'::jsonb`),
  embedding: vector('embedding', { dimensions: 1536 }),
  sourceUri: text('source_uri'),
  isFavorite: boolean('is_favorite').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export type Report = typeof reports.$inferSelect;
export type NewReport = typeof reports.$inferInsert;

// 🧠 Search Logs Table
export const searchLogs = pgTable('search_logs', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  query: text('query').notNull(),
  resultCount: integer('result_count').notNull(),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
});

export type SearchLog = typeof searchLogs.$inferSelect;
export type NewSearchLog = typeof searchLogs.$inferInsert;
