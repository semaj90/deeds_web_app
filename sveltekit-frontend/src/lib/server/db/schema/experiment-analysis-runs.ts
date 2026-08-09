import { sql } from 'drizzle-orm';
import { boolean, doublePrecision, index, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { createAnalysisRunBaseColumns } from './analysis-runs-v2.js';

/**
 * Experiment-analysis layer.
 *
 * This is the ablation / parity / promotion-gate home. It compares runs from
 * graph-analysis or model-analysis, but it does not own either of those
 * result domains.
 */
export const experimentAnalysisRuns = pgTable('experiment_analysis_runs', {
  ...createAnalysisRunBaseColumns(),
  algorithm: text('algorithm').notNull().default('experiment'),
  experimentKind: text('experiment_kind').notNull(),
  baselineRunId: uuid('baseline_run_id'),
  candidateRunIds: jsonb('candidate_run_ids').default(sql`'[]'::jsonb`).notNull(),
  metricNames: jsonb('metric_names').default(sql`'[]'::jsonb`).notNull(),
  passCriteria: jsonb('pass_criteria').default(sql`'{}'::jsonb`).notNull(),
  comparisonSummary: jsonb('comparison_summary').default(sql`'{}'::jsonb`).notNull(),
}, (table) => ({
  algorithmIdx: index('experiment_analysis_runs_algorithm_idx').on(table.algorithm, table.startedAt),
  kindIdx: index('experiment_analysis_runs_kind_idx').on(table.experimentKind),
  statusIdx: index('experiment_analysis_runs_status_idx').on(table.status),
}));

export const experimentAnalysisResults = pgTable('experiment_analysis_results', {
  runId: uuid('run_id').notNull(),
  metricName: text('metric_name').notNull(),
  baselineValue: doublePrecision('baseline_value'),
  candidateValue: doublePrecision('candidate_value'),
  delta: doublePrecision('delta'),
  passed: boolean('passed').notNull(),
  reason: text('reason'),
  metadata: jsonb('metadata').default(sql`'{}'::jsonb`).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => ({
  primaryKey: primaryKey({ columns: [table.runId, table.metricName] }),
  runIdx: index('experiment_analysis_results_run_idx').on(table.runId),
  metricIdx: index('experiment_analysis_results_metric_idx').on(table.metricName),
}));

export type ExperimentAnalysisRunRow = typeof experimentAnalysisRuns.$inferSelect;
export type NewExperimentAnalysisRunRow = typeof experimentAnalysisRuns.$inferInsert;
export type ExperimentAnalysisResultRow = typeof experimentAnalysisResults.$inferSelect;
export type NewExperimentAnalysisResultRow = typeof experimentAnalysisResults.$inferInsert;
