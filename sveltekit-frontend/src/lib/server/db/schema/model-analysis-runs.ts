import { sql } from 'drizzle-orm';
import { boolean, doublePrecision, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { createAnalysisRunBaseColumns } from './analysis-runs-v2.js';

/**
 * Model-analysis layer.
 *
 * HMM / Viterbi / Baum-Welch / recommendation-model runs stay separate from
 * graph-analysis runs so graph lineage does not become a catch-all.
 */
export const modelAnalysisRuns = pgTable('model_analysis_runs', {
  ...createAnalysisRunBaseColumns(),
  modelFamily: text('model_family').notNull(),
  modelRevision: text('model_revision').notNull(),
  corpusRevision: text('corpus_revision'),
  sequenceLength: integer('sequence_length'),
  observationCount: integer('observation_count'),
  stateCount: integer('state_count'),
  decoderRevision: text('decoder_revision'),
  trainable: boolean('trainable').notNull().default(false),
}, (table) => ({
  algorithmIdx: index('model_analysis_runs_algorithm_idx').on(table.algorithm, table.startedAt),
  modelFamilyIdx: index('model_analysis_runs_model_family_idx').on(table.modelFamily),
  statusIdx: index('model_analysis_runs_status_idx').on(table.status),
}));

export const modelAnalysisResults = pgTable('model_analysis_results', {
  runId: uuid('run_id').notNull(),
  sequenceId: text('sequence_id').notNull(),
  decodedPath: jsonb('decoded_path').default(sql`'[]'::jsonb`).notNull(),
  logProbability: doublePrecision('log_probability'),
  confidence: doublePrecision('confidence'),
  recommendation: text('recommendation'),
  gpuAccelerated: boolean('gpu_accelerated').notNull().default(false),
  sidecarUsed: boolean('sidecar_used').notNull().default(false),
  modelRevision: text('model_revision').notNull(),
  metadata: jsonb('metadata').default(sql`'{}'::jsonb`).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => ({
  primaryKey: primaryKey({ columns: [table.runId, table.sequenceId] }),
  runIdx: index('model_analysis_results_run_idx').on(table.runId),
  sequenceIdx: index('model_analysis_results_sequence_idx').on(table.sequenceId),
}));

export type ModelAnalysisRunRow = typeof modelAnalysisRuns.$inferSelect;
export type NewModelAnalysisRunRow = typeof modelAnalysisRuns.$inferInsert;
export type ModelAnalysisResultRow = typeof modelAnalysisResults.$inferSelect;
export type NewModelAnalysisResultRow = typeof modelAnalysisResults.$inferInsert;
