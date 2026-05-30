import { relations, sql } from 'drizzle-orm';
import {
    boolean,
    integer,
    jsonb,
    pgTable,
    serial,
    text,
    timestamp,
    uuid,
    varchar,
    vector,
} from 'drizzle-orm/pg-core';

/**
 * Cases table — matches actual PostgreSQL `cases` table (legal_ai_db).
 * Columns verified against `information_schema.columns` on 2026-02-15.
 */
export const cases = pgTable('cases', {
    id: uuid('id').defaultRandom().primaryKey(),
    title: varchar('title').notNull(),
    description: text('description'),
    caseNumber: varchar('case_number'),
    status: text('status').default('active').notNull(),
    priority: text('priority').default('medium').notNull(),
    practiceArea: varchar('practice_area'),
    jurisdiction: varchar('jurisdiction'),
    court: varchar('court'),
    clientName: varchar('client_name'),
    opposingParty: varchar('opposing_party'),
    assignedAttorney: integer('assigned_attorney'),
    filingDate: timestamp('filing_date', { withTimezone: true }),
    dueDate: timestamp('due_date', { withTimezone: true }),
    closedDate: timestamp('closed_date', { withTimezone: true }),
    caseEmbedding: vector('case_embedding', { dimensions: 384 }),
    qdrantId: uuid('qdrant_id'),
    qdrantCollection: varchar('qdrant_collection').default('cases'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    caseEmbedding384: vector('case_embedding_384', { dimensions: 384 }),
    userId: integer('user_id'),
});

/**
 * Crimes table: stores crime-specific information per case
 * A case can have multiple crimes (charges)
 */
export const crimes = pgTable('crimes', {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: uuid('case_id')
        .notNull()
        .references(() => cases.id, { onDelete: 'cascade' }),
    crimeCode: text('crime_code').notNull(), // e.g., "PC 211"
    crimeCategory: text('crime_category').notNull(), // e.g., "robbery", "drug", "homicide"
    crimeClassification: text('crime_classification').notNull(), // "felony" | "misdemeanor" | "infraction" | "wobbler"
    attempted: boolean('attempted').default(false),
    sentencingYear: integer('sentencing_year'),
    sentenceLengthMonths: integer('sentence_length_months'),
    enhancements: jsonb('enhancements'), // array of enhancement strings
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

/**
 * CaseChunks table: stores individual chunks from case documents
 * Each chunk is a section of a case with metadata
 */
export const caseChunks = pgTable('case_chunks', {
    id: serial('id').primaryKey(),
    caseId: uuid('case_id')
        .notNull()
        .references(() => cases.id, { onDelete: 'cascade' }),
    chunkText: text('chunk_text').notNull(),
    chunkSource: text('chunk_source').notNull(),
    chunkEmbeddingId: integer('chunk_embedding_id'),
    chunkEmbedding: vector('chunk_embedding', { dimensions: 384 }),
    chunkMetadata: jsonb('chunk_metadata'),
});

/**
 * Relations for cases
 */
export const casesRelations = relations(cases, ({ many }) => ({
    crimes: many(crimes),
    chunks: many(caseChunks),
}));

/**
 * Relations for crimes
 */
export const crimesRelations = relations(crimes, ({ one }) => ({
    case: one(cases, {
        fields: [crimes.caseId],
        references: [cases.id],
    }),
}));

/**
 * Relations for caseChunks
 */
export const caseChunksRelations = relations(caseChunks, ({ one }) => ({
    case: one(cases, {
        fields: [caseChunks.caseId],
        references: [cases.id],
    }),
}));
