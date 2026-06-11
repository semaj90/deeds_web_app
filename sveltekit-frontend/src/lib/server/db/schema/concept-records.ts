import { pgTable, text, jsonb, timestamp, integer, doublePrecision } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const conceptRecords = pgTable('concept_records', {
  conceptId: text('concept_id').primaryKey(),
  label: text('label'),
  evidenceCards: jsonb('evidence_cards').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  featureIds: jsonb('feature_ids').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  packetKeys: jsonb('packet_keys').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  successCount: integer('success_count').notNull().default(0),
  failureCount: integer('failure_count').notNull().default(0),

  // Legacy/existing fields
  evidence: jsonb('evidence').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  somClusters: jsonb('som_clusters').$type<number[]>().notNull().default(sql`'[]'::jsonb`),
  retrievalCount: integer('retrieval_count').notNull().default(0),
  repairSuccess: doublePrecision('repair_success').notNull().default(1.0),

  // Phase 3E: Concept Memory Lifecycle Fields
  // Tracks how concepts are discovered and their behavioral temperature
  retrievalStrategy: text('retrieval_strategy').$type<'vector_only' | 'lexical_only' | 'structural_only' | 'fusion' | 'cold_neschrom'>().default('fusion'),
  lastRetrievedAt: timestamp('last_retrieved_at', { withTimezone: true }),
  conceptTemperature: doublePrecision('concept_temperature').default(0.5),

  // Strategy distribution: Why is this concept hot? (causality preservation)
  // E.g., { "fusion": 842, "vector_only": 131, "lexical_only": 62 }
  // Enables learning: "Concept A is hot because fusion always finds it (robust)"
  // vs "Concept B is hot but only vector finds it (brittle)"
  strategyDistribution: jsonb('strategy_distribution').$type<Record<string, number>>().notNull().default(sql`'{}'::jsonb`),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

export type ConceptRecord = typeof conceptRecords.$inferSelect;
export type NewConceptRecord = typeof conceptRecords.$inferInsert;
