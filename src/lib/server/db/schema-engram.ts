import { pgTable, text, integer, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

/**
 * @description Schema for storing cached context packets (Engrams) retrieved via ACE/Bifrost.
 * This table is designed to store transient, high-relevance context chunks used for
 * low-latency retrieval enrichment, separate from core application data.
 */
export const engramPackets = pgTable('engram_packets', {
  // Unique ID for the context packet, often derived from a run ID or hash
  id: text('id').primaryKey(),

  // The primary context query or run identifier
  runId: text('run_id').notNull().index('idx_run_id'),

  // A human-readable summary of what the packet contains
  summary: text('summary').notNull(),

  // The full, serialized context blob (e.g., compressed JSON structure)
  contextBlob: text('context_blob').notNull(),

  // --- NEW PARENT ATLAS METADATA FIELDS ---
  featureId: text('feature_id').notNull().index('idx_feature'), // New required field for feature tracking
  communityId: integer('community_id').notNull().index('idx_community'), // New required field for community grouping
  metadataJsonb: jsonb('metadata_jsonb').default(jsonb('{}')).notNull(), // General metadata payload

  // --- EXISTING/RELATED FIELDS ---
  embeddingDimensions: integer('embedding_dimensions').default(768),

  // Timestamp of when the packet was created or last updated
  createdAt: timestamp('created_at').defaultNow().notNull(),

  // A flag indicating if this packet was part of a successful, high-confidence retrieval
  isVerified: integer('is_verified').default(0),

  // Link to the source of the context, if known (e.g., a specific API route or file)
  sourceFile: text('source_file').references(() => files.path, { onDelete: 'cascade' }),

  // Optional link to the calling agent/service
  callingAgent: text('calling_agent').default('unknown'),
});

export type EngramPacket = typeof engramPackets.$inferSelect;
export type NewEngramPacket = typeof engramPackets.$inferInsert;

// Placeholder for a general file mapping table if necessary for complex source linking
export const files = pgTable('files', {
    path: text('path').primaryKey(),
    mtime: timestamp('mtime').defaultNow(),
});

export const relations = {
    engramPackets: relations(engramPackets, ({ one }) => ({
        sourceFile: one(files).references(() => files.path, { onDelete: 'cascade' }),
    })),
};