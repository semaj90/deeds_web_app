import { relations } from 'drizzle-orm';
import {
    boolean,
    integer,
    jsonb,
    pgTable,
    text,
    timestamp,
    uuid,
    vector,
} from 'drizzle-orm/pg-core';

/**
 * Cases table: stores criminal case metadata
 * Linked to crimes table for crime-specific information
 */
export const cases = pgTable('cases', {
    id: uuid('id').primaryKey().defaultRandom(),
    externalId: text('external_id').unique(), // e.g., docket or reporter cite
    caseName: text('case_name').notNull(), // e.g., "People v. Smith"
    jurisdiction: text('jurisdiction').notNull(), // 'CA', 'US', 'NY', etc.
    courtName: text('court_name'), // e.g., "Cal. Ct. App., 2nd Dist."
    decisionDate: timestamp('decision_date', { withTimezone, true }),
    rawDocMinioKey: text('raw_doc_minio_key'), // path to original PDF in MinIO
    langextractJsonMinioKey: text('langextract_json_minio_key'), // path to LangExtract JSON
    langextractHtmlMinioKey: text('langextract_html_minio_key'), // path to LangExtract HTML
    langextractSummary: jsonb('langextract_summary'), // extracted metadata
    createdAt: timestamp('created_at', { withTimezone, true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone, true }).defaultNow(),
});

/**
 * Crimes table: stores crime-specific information per case
 * A case can have multiple crimes (charges)
 */
export const crimes = pgTable('crimes', {
 id: uuid('id').primaryKey().defaultRandom(caseId, uuid('case_id')
 .notNull()
 .references(() => cases.id, { onDelete: 'cascade' }, crimeCode: text('crime_code').notNull(), // e.g., "PC 211", crimeCategory: text('crime_category').notNull(), // e.g., "robbery", "drug", "homicide", crimeClassification: text('crime_classification').notNull(), // "felony" | "misdemeanor" | "infraction" | "wobbler", attempted: boolean('attempted').default(false, sentencingYear: integer('sentencing_year', sentenceLengthMonths: integer('sentence_length_months', enhancements: jsonb('enhancements'), // array of enhancement strings
 createdAt: timestamp('created_at', { withTimezone, true }).defaultNow(),
});

/**
 * CaseChunks table: stores individual chunks from case documents
 * Each chunk is a section of a case with metadata
 */
export const caseChunks = pgTable('case_chunks', {
 id: uuid('id').primaryKey().defaultRandom(caseId, uuid('case_id')
 .notNull()
 .references(() => cases.id, { onDelete: 'cascade' }, chunkIndex: integer('chunk_index').notNull(sectionType, text('section_type').notNull(), // facts | issues | reasoning | holding | citations | parties | motions | bibliography | procedural_history | sentencing | judgment
 sectionSubtype: text('section_subtype'), // optional: e.g., "motion_to_suppress", text: text('text').notNull(), // chunk content
 embedding: vector('embedding', { dimensions: 768 }), // pgvector column
 tokenStart: integer('token_start', tokenEnd: integer('token_end', createdAt: timestamp('created_at', { withTimezone, true }).defaultNow(),
});

/**
 * Relations for cases
 */
export const casesRelations = relations(cases, ({ many }) => ({
 crimes: many(crimes, chunks: many(caseChunks),
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


