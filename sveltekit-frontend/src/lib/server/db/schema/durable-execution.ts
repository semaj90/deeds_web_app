import {
  pgTable,
  bigserial,
  text,
  timestamp,
  jsonb,
  boolean,
  integer,
  index,
  uniqueIndex,
  foreignKey,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Durable Execution Journal Schema
 *
 * Enables crash recovery and idempotent re-execution of workflow steps.
 * Every consequential operation (LLM call, DB write, tool invocation) is
 * recorded BEFORE and AFTER execution, so recovery can replay stored
 * results instead of re-running them.
 */

// ============================================================================
// executionRuns — Represents one workflow invocation
// ============================================================================

export const executionRuns = pgTable(
  'execution_runs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),

    // Unique identification
    runId: text('run_id').notNull().unique(),
    taskId: text('task_id').notNull(),
    agent: text('agent').notNull(),

    // Execution state
    status: text('status')
      .notNull()
      .default('ACTIVE'),
    // ACTIVE | COMPLETED | FAILED | SUSPENDED | RESUMED

    input: jsonb('input').notNull(),
    output: jsonb('output'),
    errorMessage: text('error_message'),

    // Crash recovery
    checkpointStepId: bigserial('checkpoint_step_id', { mode: 'number' }),
    recoveryCount: integer('recovery_count').default(0),

    // Temporal metadata
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    resumedAt: timestamp('resumed_at', { withTimezone: true }),
  },
  (table) => ({
    idxRunId: uniqueIndex('idx_execution_runs_run_id').on(table.runId),
    idxTaskId: index('idx_execution_runs_task_id').on(table.taskId),
    idxAgent: index('idx_execution_runs_agent').on(table.agent),
    idxStatus: index('idx_execution_runs_status').on(table.status),
  })
);

export type ExecutionRun = typeof executionRuns.$inferSelect;
export type NewExecutionRun = typeof executionRuns.$inferInsert;

// ============================================================================
// executionJournalSteps — Records each atomic operation
// ============================================================================

export const executionJournalSteps = pgTable(
  'execution_journal_steps',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),

    // Ownership
    runId: text('run_id')
      .notNull()
      .references(() => executionRuns.runId, { onDelete: 'cascade' }),
    stepIndex: integer('step_index').notNull(),

    // Step definition
    stepName: text('step_name').notNull(),
    stepType: text('step_type').notNull(),
    // 'tool_call' | 'llm_completion' | 'db_mutation' | 'validation'

    idempotencyKey: text('idempotency_key').notNull().unique(),

    // Execution
    status: text('status')
      .notNull()
      .default('PENDING'),
    // PENDING | EXECUTING | SUCCESS | FAILED | SKIPPED

    // Input & output
    input: jsonb('input').notNull(),
    output: jsonb('output'),
    error: text('error'),

    // Proof of execution
    executionDurationMs: integer('execution_duration_ms'),
    tokensUsed: integer('tokens_used'),
    cacheHit: boolean('cache_hit').default(false),

    // Recovery info
    executionAttempt: integer('execution_attempt').default(1),
    executedAt: timestamp('executed_at', { withTimezone: true }),
  },
  (table) => ({
    idxRunId: index('idx_steps_run_id').on(table.runId),
    idxIdempotencyKey: uniqueIndex('idx_steps_idempotency_key').on(
      table.idempotencyKey
    ),
    idxStatus: index('idx_steps_status').on(table.status),
    idxStepType: index('idx_steps_step_type').on(table.stepType),
  })
);

export type ExecutionJournalStep = typeof executionJournalSteps.$inferSelect;
export type NewExecutionJournalStep = typeof executionJournalSteps.$inferInsert;

// ============================================================================
// executionSideEffects — Immutable log of mutations
// ============================================================================

export const executionSideEffects = pgTable(
  'execution_side_effects',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),

    // Ownership
    runId: text('run_id')
      .notNull()
      .references(() => executionRuns.runId, { onDelete: 'cascade' }),
    stepId: bigserial('step_id', { mode: 'number' })
      .notNull()
      .references(() => executionJournalSteps.id, { onDelete: 'cascade' }),

    // Effect type
    effectType: text('effect_type').notNull(),
    // 'db_write' | 'file_write' | 'api_call' | 'cache_invalidate'

    resourceId: text('resource_id').notNull(),

    // Immutable record
    operation: text('operation').notNull(),
    // 'INSERT' | 'UPDATE' | 'DELETE' | 'WRITE'

    oldValue: jsonb('old_value'),
    newValue: jsonb('new_value'),

    // Status
    status: text('status').default('RECORDED'),
    // RECORDED | VERIFIED | REVERSED

    // Recovery
    reversible: boolean('reversible').default(false),
    reverseOperation: text('reverse_operation'),
    reversedAt: timestamp('reversed_at', { withTimezone: true }),

    occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    idxRunId: index('idx_effects_run_id').on(table.runId),
    idxStepId: index('idx_effects_step_id').on(table.stepId),
  })
);

export type ExecutionSideEffect = typeof executionSideEffects.$inferSelect;
export type NewExecutionSideEffect = typeof executionSideEffects.$inferInsert;

// ============================================================================
// executionDependencies — Step ordering and data flow
// ============================================================================

export const executionDependencies = pgTable(
  'execution_dependencies',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),

    // The dependency edge
    runId: text('run_id')
      .notNull()
      .references(() => executionRuns.runId, { onDelete: 'cascade' }),

    fromStepId: bigserial('from_step_id', { mode: 'number' })
      .notNull()
      .references(() => executionJournalSteps.id, { onDelete: 'cascade' }),

    toStepId: bigserial('to_step_id', { mode: 'number' })
      .notNull()
      .references(() => executionJournalSteps.id, { onDelete: 'cascade' }),

    // Metadata
    dependencyType: text('dependency_type'),
    // 'data_dependency' | 'control_flow' | 'temporal'

    reason: text('reason'),
  },
  (table) => ({
    idxRunId: index('idx_deps_run_id').on(table.runId),
    idxFromStep: index('idx_deps_from_step').on(table.fromStepId),
    idxToStep: index('idx_deps_to_step').on(table.toStepId),
    uniqueDep: uniqueIndex('unique_dependency').on(table.fromStepId, table.toStepId),
  })
);

export type ExecutionDependency = typeof executionDependencies.$inferSelect;
export type NewExecutionDependency = typeof executionDependencies.$inferInsert;

// ============================================================================
// Temporal validity columns for agent_memory_registry
// (See agent-memory-registry.ts — these columns are added via ALTER TABLE)
// ============================================================================

/**
 * Temporal validity metadata added to agent_memory_registry:
 *
 * validFrom: TIMESTAMP — when the fact became true
 * validTo: TIMESTAMP — when it stopped being true (NULL = still valid)
 * observedAt: TIMESTAMP — when Atlas learned it
 * confidence: REAL [0,1] — extraction confidence
 * sourceEventId: TEXT — evidence that produced it
 * supersedesId: BIGINT — previous fact revision (if this supersedes)
 * invalidatedAt: TIMESTAMP — when it was marked superseded
 *
 * Example query:
 *   SELECT * FROM agent_memory_registry
 *   WHERE featureId = 'auth.sessions'
 *     AND validFrom <= NOW()
 *     AND (validTo IS NULL OR validTo > NOW())
 *   ORDER BY confidence DESC;
 */
