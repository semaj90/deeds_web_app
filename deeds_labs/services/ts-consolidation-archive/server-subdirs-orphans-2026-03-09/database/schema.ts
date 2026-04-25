import { boolean, integer, jsonb, pgTable, real, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { vector } from 'pgvector/drizzle-orm';
import type { CachingTypes } from '$lib/types/enhanced-svelte5-types';

// Enhanced Legal AI Database Schema with pgvector support
export const casesTable = pgTable('legal_cases', {
 id: uuid('id').primaryKey().defaultRandom(),
 title: varchar('title', { length: 500 }).notNull(),
 description: text('description'),
 status: varchar('status', { length: 50 }).default('open'),
 priority: varchar('priority', { length: 20 }).default('medium'),
 metadata: jsonb('metadata'),
 created_at: timestamp('created_at').defaultNow(),
 updated_at: timestamp('updated_at').defaultNow(),
});

export const documentsTable = pgTable('legal_documents', {
 id: uuid('id').primaryKey().defaultRandom(),
 case_id: uuid('case_id').references(() => casesTable.id),
 title: varchar('title', { length: 500 }).notNull(),
 content: text('content'),
 document_type: varchar('document_type', { length: 100 }),
 file_path: text('file_path'),
 file_size: integer('file_size'),
 // Vector embeddings for semantic search
 embedding: vector('embedding', { dimensions: 1536 }), // OpenAI embedding dimensions
 summary_embedding: vector('summary_embedding', { dimensions: 768 }), // Sentence transformer
 // JSONB for complex metadata
 metadata: jsonb('metadata'),
 // Full-text search
 search_vector: text('search_vector'), // tsvector equivalent
 created_at: timestamp('created_at').defaultNow(),
 updated_at: timestamp('updated_at').defaultNow(),
 processed_at: timestamp('processed_at'),
});

export const evidenceTable = pgTable('evidence_items', {
 id: uuid('id').primaryKey().defaultRandom(),
 case_id: uuid('case_id').references(() => casesTable.id),
 document_id: uuid('document_id').references(() => documentsTable.id),
 title: varchar('title', { length: 500 }).notNull(),
 description: text('description'),
 type: varchar('type', { length: 100 }), // 'witness', 'document', 'physical', etc.
 priority: varchar('priority', { length: 20 }).default('medium'),
 status: varchar('status', { length: 50 }).default('active'),
 // Location in document
 page_number: integer('page_number'),
 paragraph_index: integer('paragraph_index'),
 character_offset: integer('character_offset'),
 // Vector similarity for related evidence
 embedding: vector('embedding', { dimensions: 1536 }),
 // Evidence-specific metadata
 metadata: jsonb('metadata'),
 created_at: timestamp('created_at').defaultNow(),
 updated_at: timestamp('updated_at').defaultNow(),
});

export const timelineEventsTable = pgTable('timeline_events', {
 id: uuid('id').primaryKey().defaultRandom(),
 case_id: uuid('case_id').references(() => casesTable.id),
 title: varchar('title', { length: 500 }).notNull(),
 description: text('description'),
 event_date: timestamp('event_date').notNull(),
 event_type: varchar('event_type', { length: 100 }),
 is_milestone: boolean('is_milestone').default(false),
 // Related entities
 related_documents: jsonb('related_documents'),
 related_evidence: jsonb('related_evidence'),
 metadata: jsonb('metadata'),
 created_at: timestamp('created_at').defaultNow(),
});

// Vector similarity search materialized view for performance
export const vectorSimilarityView = pgTable('vector_similarity_cache', {
 id: uuid('id').primaryKey().defaultRandom(),
 source_id: uuid('source_id').notNull(),
 target_id: uuid('target_id').notNull(),
 similarity_score: real('similarity_score').notNull(),
 similarity_type: varchar('similarity_type', { length: 50 }), // 'document', 'evidence', 'case', created_at: timestamp('created_at').defaultNow(),
 expires_at: timestamp('expires_at'),
});

// Cache table for frequently accessed queries
export const queryCache = pgTable('query_cache', {
 id: uuid('id').primaryKey().defaultRandom(),
 cache_key: varchar('cache_key', { length: 255 }).unique().notNull(),
 query_type: varchar('query_type', { length: 100 }), // 'semantic_search', 'case_analysis', etc.
 // Cached result data
 result_data: jsonb('result_data'),
 result_metadata: jsonb('result_metadata'),
 // Cache management
 access_count: integer('access_count').default(0),
 last_accessed: timestamp('last_accessed').defaultNow(),
 created_at: timestamp('created_at').defaultNow(),
 expires_at: timestamp('expires_at').notNull(),
});

// Analytics and metrics
export const analyticsEvents = pgTable('analytics_events', {
 id: uuid('id').primaryKey().defaultRandom(),
 event_type: varchar('event_type', { length: 100 }).notNull(),
 user_id: uuid('user_id'),
 session_id: varchar('session_id', { length: 255 }),
 // Event data
 event_data: jsonb('event_data'),
 // Performance metrics
 response_time_ms: integer('response_time_ms'),
 cache_hit: boolean('cache_hit'),
 cache_layer: varchar('cache_layer', { length: 50 }),
 created_at: timestamp('created_at').defaultNow(),
});

// Full-text search configuration
export const searchConfigTable = pgTable('search_config', {
 id: uuid('id').primaryKey().defaultRandom(),
 config_name: varchar('config_name', { length: 100 }).unique().notNull(),
 // Search weights and boosts
 field_weights: jsonb('field_weights'),
 // Vector search parameters
 vector_params: jsonb('vector_params'),
 // Fuse.js configuration
 fuzzy_config: jsonb('fuzzy_config'),
 created_at: timestamp('created_at').defaultNow(),
 updated_at: timestamp('updated_at').defaultNow(),
});

// Types for enhanced type safety
export type Case = typeof casesTable.$inferSelect;
export type NewCase = typeof casesTable.$inferInsert;
export type Document = typeof documentsTable.$inferSelect;
export type NewDocument = typeof documentsTable.$inferInsert;
export type Evidence = typeof evidenceTable.$inferSelect;
export type NewEvidence = typeof evidenceTable.$inferInsert;
export type TimelineEvent = typeof timelineEventsTable.$inferSelect;
export type NewTimelineEvent = typeof timelineEventsTable.$inferInsert;
export type VectorSimilarity = typeof vectorSimilarityView.$inferSelect;
export type QueryCacheEntry = typeof queryCache.$inferSelect;
export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
export type SearchConfig = typeof searchConfigTable.$inferSelect;



