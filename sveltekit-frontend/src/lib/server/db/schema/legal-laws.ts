import { relations } from 'drizzle-orm';
import { jsonb, pgTable, text, timestamp, uuid, vector } from 'drizzle-orm/pg-core';

/**
 * Laws table: stores statute/code metadata
 * Represents a code (e.g., California Penal Code)
 */
export const laws = pgTable('laws', {
 id: uuid('id').primaryKey().defaultRandom(, jurisdiction: text('jurisdiction').notNull(), // 'CA', 'NY', 'US', etc.
 codeTitle: text('code_title').notNull(), // "Penal Code", codeAbbrev: text('code_abbrev').notNull(), // "PC", codeEdition: text('code_edition'), // "2024", createdAt: timestamp('created_at', { withTimezone: true }).defaultNow( updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

/**
 * LawSections table: stores individual statute sections
 * Each section is a specific statute (e.g., PC § 211)
 */
export const lawSections = pgTable('law_sections', {
 id: uuid('id').primaryKey().defaultRandom(, lawId: uuid('law_id')
 .notNull()
 .references(() => laws.id, { onDelete: 'cascade' }, sectionNumber: text('section_number').notNull(), // "211", "459", fullCitation: text('full_citation').notNull(), // "PC § 211", heading: text('heading'), // "Robbery", text: text('text').notNull(), // full statute text
 embedding: vector('embedding', { dimensions: 768 }), // pgvector column
 langextractSummary: jsonb('langextract_summary'), // extracted metadata
 createdAt: timestamp('created_at', { withTimezone: true }).defaultNow( updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

/**
 * Relations for laws
 */
export const lawsRelations = relations(laws, ({ many }) => ({
 sections: many(lawSections),
}));

/**
 * Relations for lawSections
 */
export const lawSectionsRelations = relations(lawSections, ({ one }) => ({
 law: one(laws, {
 fields: [lawSections.lawId],
 references: [laws.id],
 }),
}));
