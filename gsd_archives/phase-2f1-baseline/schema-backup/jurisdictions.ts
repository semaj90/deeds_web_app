import { pgTable, bigserial, text, uuid, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Jurisdictions — hierarchical lookup for legal authority levels.
 * Federal → State → County → City via parent_id self-reference.
 *
 * NOTE: uses bigserial id to match the existing DB migration (20260317_legal_library.sql).
 * All other legal tables reference this via bigint FK.
 */
export const jurisdictions = pgTable('jurisdictions', {
	id: bigserial('id', { mode: 'number' }).primaryKey().notNull(),
	code: text('code').unique().notNull(),       // e.g. 'federal', 'ca', 'sf_county'
	name: text('name').notNull(),
	level: text('level').notNull(),              // federal | state | county | city
	parentId: bigserial('parent_id', { mode: 'number' }), // self-referential hierarchy
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
	codeIdx: index('idx_jurisdictions_code').on(table.code),
	levelIdx: index('idx_jurisdictions_level').on(table.level),
}));

// Type inference
export type Jurisdiction = typeof jurisdictions.$inferSelect;
export type NewJurisdiction = typeof jurisdictions.$inferInsert;
