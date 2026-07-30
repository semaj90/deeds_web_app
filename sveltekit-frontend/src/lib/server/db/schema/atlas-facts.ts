import { sql } from 'drizzle-orm';
import {
  pgTable, text, integer, real, uuid, timestamp, index, foreignKey
} from 'drizzle-orm/pg-core';
import { atlasPackets } from './atlas-packets.js';

/**
 * Atlas Facts — N-ary fact extraction output from Gate G13 (Gemma4 fact extraction)
 * Stores structured facts extracted from source_ref with confidence scoring and reasoning trace
 */
export const atlasFacts = pgTable('atlas_facts', {
  id: uuid('id').primaryKey().defaultRandom().notNull(),
  packetKey: text('packet_key').notNull(),
  sourceRef: text('source_ref').notNull(),
  factText: text('fact_text').notNull(),
  confidence: real('confidence'),
  // e.g., 0.95 = high confidence fact extracted from source_ref
  reasoningTrace: text('reasoning_trace'),
  // Gemma4's reasoning path (for audit trail)
  extractedAt: timestamp('extracted_at', { withTimezone: true }).defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  packetKeyIdx: index('idx_atlas_facts_packet_key').on(table.packetKey),
  sourceRefIdx: index('idx_atlas_facts_source_ref').on(table.sourceRef),
  confidenceIdx: index('idx_atlas_facts_confidence').on(table.confidence),
  extractedAtIdx: index('idx_atlas_facts_extracted_at').on(table.extractedAt.desc()),
}));

export type AtlasFact = typeof atlasFacts.$inferSelect;
export type NewAtlasFact = typeof atlasFacts.$inferInsert;

/**
 * Atlas Fact Arguments — N-ary arguments for facts
 * Each fact can have multiple structured arguments (subject, object, predicate, etc.)
 */
export const atlasFactArguments = pgTable('atlas_fact_arguments', {
  id: uuid('id').primaryKey().defaultRandom().notNull(),
  factId: uuid('fact_id').notNull().references(() => atlasFacts.id, { onDelete: 'cascade' }),
  argumentIndex: integer('argument_index'),
  // Position in argument list (0-indexed)
  argumentName: text('argument_name'),
  // e.g., 'subject', 'object', 'predicate', 'temporal_anchor', 'location'
  argumentValue: text('argument_value'),
  // Structured or free-text value
  argumentType: text('argument_type'),
  // e.g., 'entity', 'event', 'location', 'temporal', 'numeric', 'boolean'
}, (table) => ({
  factIdIdx: index('idx_atlas_fact_arguments_fact_id').on(table.factId),
  argumentNameIdx: index('idx_atlas_fact_arguments_name').on(table.argumentName),
  argumentTypeIdx: index('idx_atlas_fact_arguments_type').on(table.argumentType),
}));

export type AtlasFactArgument = typeof atlasFactArguments.$inferSelect;
export type NewAtlasFactArgument = typeof atlasFactArguments.$inferInsert;
