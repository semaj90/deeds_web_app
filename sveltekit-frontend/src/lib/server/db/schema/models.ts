import { pgTable, uuid, text, boolean, timestamp } from 'drizzle-orm/pg-core';

/**
 * model_artifacts
 * 
 * Staging and audit table for GGUF model weights.
 * Part of the MCP weight-upload security workflow.
 */
export const modelArtifacts = pgTable('model_artifacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  path: text('path').notNull(),
  sha256: text('sha256').unique().notNull(),
  sourceUrl: text('source_url'),
  backend: text('backend'), // e.g. 'llama.cpp', 'tensorrt'
  weightQuant: text('weight_quant'), // e.g. 'Q4_K_M', 'IQ4_XS'
  approved: boolean('approved').default(false).notNull(),
  scanResult: text('scan_result'), // Result from llama.cpp tooling scan
  createdAt: timestamp('created_at').defaultNow().notNull(),
  activatedAt: timestamp('activated_at')
});

export type ModelArtifact = typeof modelArtifacts.$inferSelect;
export type NewModelArtifact = typeof modelArtifacts.$inferInsert;
