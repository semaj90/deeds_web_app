import { sql } from 'drizzle-orm';
import { boolean, jsonb, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Shared run-envelope columns for analysis persistence.
 *
 * This does not define a table by itself. It exists so the graph, sequence,
 * vector, and experiment analysis tables can share one lineage backbone
 * without copying the same columns into each schema file.
 */
export function createAnalysisRunBaseColumns() {
  return {
    runId: uuid('run_id').defaultRandom().primaryKey().notNull(),
    algorithm: text('algorithm').notNull(),
    algorithmRevision: text('algorithm_revision').notNull(),
    parameterRevision: text('parameter_revision').notNull(),
    workspaceRevision: text('workspace_revision').notNull(),
    sourceRevision: text('source_revision').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'string' }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'string' }),
    status: text('status').notNull(),
    parameters: jsonb('parameters').default(sql`'{}'::jsonb`).notNull(),
    metrics: jsonb('metrics').default(sql`'{}'::jsonb`).notNull(),
    backendPreference: text('backend_preference').notNull().default('native-ts'),
    backendActual: text('backend_actual').notNull().default('offline'),
    gpuAccelerated: boolean('gpu_accelerated').notNull().default(false),
    sidecarUrl: text('sidecar_url'),
    inputHash: text('input_hash'),
    outputHash: text('output_hash'),
  };
}

export type AnalysisRunBaseColumns = ReturnType<typeof createAnalysisRunBaseColumns>;
