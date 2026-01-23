// Additional Legal AI Database Tables
// These will be imported and added to the main unified-schema.ts
import {
    boolean,
    decimal,
    integer,
    jsonb,
    pgTable,
    text,
    timestamp,
    uuid,
    varchar
} from 'drizzle-orm/pg-core';
import { vector } from 'pgvector/drizzle-orm';
import type { cases, evidence, legalDocuments, users } from './schema-postgres.ts';

// Evidence Chain of Custody
export const evidenceChainOfCustody = pgTable('evidence_chain_of_custody', {
 id: uuid('id').primaryKey().defaultRandom(),
 evidenceId: uuid('evidence_id')
 .references(() => evidence.id)
 .notNull(),
 custodian: uuid('custodian')
 .references(() => users.id)
 .notNull(),
 action: varchar('action', { length: 50 }).notNull(), // 'received', 'transferred', 'analyzed', 'stored', 'destroyed'
 timestamp: timestamp('timestamp', { mode: 'date' }).defaultNow().notNull(),
 location: varchar('location', { length: 255 }).notNull(),
 condition: text('condition').notNull(),
 notes: text('notes'),
 signature: text('signature'),
 witnessSignature: text('witness_signature'),
 integrityHash: varchar('integrity_hash', { length: 64 }),
 createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
 updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

// Case Assignments
export const caseAssignments = pgTable('case_assignments', {
 id: uuid('id').primaryKey().defaultRandom(),
 caseId: uuid('case_id')
 .references(() => cases.id)
 .notNull(),
 userId: uuid('user_id')
 .references(() => users.id)
 .notNull(),
 role: varchar('role', { length: 50 }).notNull(), // 'lead_attorney', 'associate', 'paralegal', 'investigator'
 assignedAt: timestamp('assigned_at', { mode: 'date' }).defaultNow().notNull(),
 assignedBy: uuid('assigned_by')
 .references(() => users.id)
 .notNull(),
 status: varchar('status', { length: 20 }).default('active').notNull(), // 'active', 'inactive', 'completed'
 permissions: jsonb('permissions').default({}),
 createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
 updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

// AI Query Storage
export const userAiQueries = pgTable('user_ai_queries', {
 id: uuid('id').primaryKey().defaultRandom(),
 userId: uuid('user_id')
 .references(() => users.id)
 .notNull(),
 caseId: uuid('case_id').references(() => cases.id),
 query: text('query').notNull(),
 response: text('response').notNull(),
 embedding: vector('embedding', { dimensions: 384 }),
 metadata: jsonb('metadata').default({}),
 isSuccessful: boolean('is_successful').default(true).notNull(),
 errorMessage: text('error_message'),
 processingTimeMs: integer('processing_time_ms'),
 tokensUsed: integer('tokens_used'),
 model: varchar('model', { length: 100 }).default('gemma3-legal').notNull(),
 createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// Embedding Cache
export const embeddingCache = pgTable('embedding_cache', {
 textHash: varchar('text_hash', { length: 64 }).primaryKey(),
 embedding: vector('embedding', { dimensions: 384 }),
 model: varchar('model', { length: 100 }).notNull(),
 createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// RAG Sessions
export const ragSessions = pgTable('rag_sessions', {
 id: uuid('id').primaryKey().defaultRandom(),
 userId: uuid('user_id')
 .references(() => users.id)
 .notNull(),
 caseId: uuid('case_id').references(() => cases.id),
 sessionName: varchar('session_name', { length: 255 }),
 startedAt: timestamp('started_at', { mode: 'date' }).defaultNow().notNull(),
 endedAt: timestamp('ended_at', { mode: 'date' }),
 messageCount: integer('message_count').default(0).notNull(),
 isActive: boolean('is_active').default(true).notNull(),
 metadata: jsonb('metadata').default({}),
 createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
 updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

// RAG Messages
export const ragMessages = pgTable('rag_messages', {
 id: uuid('id').primaryKey().defaultRandom(),
 sessionId: uuid('session_id')
 .references(() => ragSessions.id)
 .notNull(),
 role: varchar('role', { length: 20 }).notNull(), // 'user', 'assistant', 'system'
 content: text('content').notNull(),
 embedding: vector('embedding', { dimensions: 384 }),
 sources: jsonb('sources').default([]),
 confidence: decimal('confidence', { precision: 3, scale: 2 }),
 processingTimeMs: integer('processing_time_ms'),
 createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// Document Chunks for RAG
export const additionalDocumentChunks = pgTable('document_chunks', {
 id: uuid('id').primaryKey().defaultRandom(),
 documentId: uuid('document_id')
 .references(() => legalDocuments.id)
 .notNull(),
 chunkIndex: integer('chunk_index').notNull(),
 content: text('content').notNull(),
 embedding: vector('embedding', { dimensions: 384 }),
 metadata: jsonb('metadata').default({}),
 wordCount: integer('word_count').notNull(),
 createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// Case Embeddings for vector search
export const caseEmbeddings = pgTable('case_embeddings', {
 id: uuid('id').primaryKey().defaultRandom(),
 caseId: uuid('case_id')
 .references(() => cases.id)
 .notNull(),
 embedding: vector('embedding', { dimensions: 384 }),
 embeddingType: varchar('embedding_type', { length: 50 }).notNull(), // 'description', 'summary', 'full_content'
 sourceField: varchar('source_field', { length: 100 }).notNull(),
 model: varchar('model', { length: 100 }).default('nomic-embed-text').notNull(),
 createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
 updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

// Evidence Vectors
export const evidenceVectors = pgTable('evidence_vectors', {
 id: uuid('id').primaryKey().defaultRandom(),
 evidenceId: uuid('evidence_id')
 .references(() => evidence.id)
 .notNull(),
 embedding: vector('embedding', { dimensions: 384 }),
 embeddingType: varchar('embedding_type', { length: 50 }).notNull(),
 sourceField: varchar('source_field', { length: 100 }).notNull(),
 model: varchar('model', { length: 100 }).default('nomic-embed-text').notNull(),
 createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
 updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

// Legal Precedents
export const legalPrecedents = pgTable('legal_precedents', {
 id: uuid('id').primaryKey().defaultRandom(),
 title: varchar('title', { length: 500 }).notNull(),
 citation: varchar('citation', { length: 255 }).notNull(),
 court: varchar('court', { length: 255 }).notNull(),
 year: integer('year').notNull(),
 jurisdiction: varchar('jurisdiction', { length: 100 }).notNull(),
 legalArea: varchar('legal_area', { length: 100 }).notNull(),
 summary: text('summary').notNull(),
 keyHolding: text('key_holding').notNull(),
 embedding: vector('embedding', { dimensions: 384 }),
 relevanceScore: decimal('relevance_score', { precision: 3, scale: 2 }),
 citeCount: integer('cite_count').default(0).notNull(),
 url: varchar('url', { length: 500 }),
 fullText: text('full_text'),
 createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
 updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});


