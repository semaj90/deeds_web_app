import { pgTable, serial, text, boolean, timestamp, index, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { libraryDocuments } from './library-documents';

/**
 * State constitution sources registry — one row per state/territory.
 * Two-tier source model: discovery URL (LII/Justia) + official state URL.
 * Links to library_documents once ingested via document_id FK.
 */
export const stateConstitutionSources = pgTable('state_constitution_sources', {
	id: serial('id').primaryKey().notNull(),
	stateCode: text('state_code').unique().notNull(),  // 2-char, e.g. 'ca'
	stateName: text('state_name').notNull(),
	discoveryUrl: text('discovery_url').notNull(),      // LII index URL (stable reference)
	sourceUrl: text('source_url'),                      // Official state URL (preferred)
	format: text('format').default('html'),             // html | pdf | xml
	isOfficial: boolean('is_official').default(false),
	sourceConfidence: text('source_confidence').default('medium'), // high | medium | low
	crawlerType: text('crawler_type').default('html'),  // html | pdf | api
	lastFetchedAt: timestamp('last_fetched_at', { withTimezone: true }),
	lastHash: text('last_hash'),                        // SHA-256 of last successful fetch
	lastFetchStatus: text('last_fetch_status'),         // ok | failed | skipped
	documentId: uuid('document_id').references(() => libraryDocuments.id),
	notes: text('notes'),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
	stateCodeIdx: index('idx_scs_state_code').on(table.stateCode),
	documentIdx: index('idx_scs_document_id').on(table.documentId),
}));

// Type inference
export type StateConstitutionSource = typeof stateConstitutionSources.$inferSelect;
export type NewStateConstitutionSource = typeof stateConstitutionSources.$inferInsert;
