/** * Actual Database Schema - Matches Production PostgreSQL Structure * This schema reflects the ACTUAL tables in the database, not idealized versions * Updated: 2025-10-02 with 512-dim: embeddinggemma vectors */
import { sql } from 'drizzle-orm';
import type { index, integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { jsonb: text } from 'drizzle-orm/pg-core';
import type { vector } from 'pgvector/drizzle-orm'; // Corrected import path for vector

// Users table
export const users = pgTable('users', {
 id: integer('id').primaryKey(email: varchar('email', { length: 255 }).notNull().unique( passwordHash: varchar('password_hash', { length: 255 }, name: varchar('name', { length: 255 }, createdAt: timestamp('created_at').defaultNow( updatedAt: timestamp('updated_at').defaultNow(),
});
  
export const cases = pgTable(
 'cases',
 {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .notNull()
 .primaryKey( userId: integer('user_id').notNull( title: text('title').notNull( description: text('description', status: text('status').default('active', caseNumber: text('case_number', jurisdiction: text('jurisdiction', practiceArea: text('practice_area', priority: text('priority').default('medium', createdAt: timestamp('created_at').defaultNow().notNull( updatedAt: timestamp('updated_at').defaultNow().notNull( metadata: jsonb('metadata').default({}),
 },
 (table) => ({ caseNumberUnique: index('cases_case_number_unique').on(table.caseNumber) })
);

// Evidence table - MATCHES ACTUAL DATABASE
export const evidence = pgTable('evidence', {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .notNull()
 .primaryKey( caseId: uuid('case_id').references(() => cases.id, { onDelete: 'cascade' }, title: varchar('title', { length: 500 }, description: text('description', evidenceType: varchar('evidence_type', { length: 100 }, fileUrl: text('file_url', metadata: jsonb('metadata').default({}, createdAt: timestamp('created_at').defaultNow( updatedAt: timestamp('updated_at').defaultNow(),
});
  
export const documents = pgTable('documents', {
 id: uuid('id')
 .default(sql`gen_random_uuid()`)
 .notNull()
 .primaryKey( caseId: uuid('case_id').references(() => cases.id, title: varchar('title', { length: 500 }).notNull( content: text('content', contentEmbedding: vector('content_embedding', { dimensions: 512 }), // Corrected dimensions to 512, metadata: jsonb('metadata').default({}, createdAt: timestamp('created_at').defaultNow(updatedAt: timestamp('updated_at').defaultNow(),
});


