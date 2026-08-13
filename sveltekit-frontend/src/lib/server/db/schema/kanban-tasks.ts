import { pgTable, text, jsonb, timestamp, integer, bigserial, boolean } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const kanbanTasks = pgTable('kanban_tasks', {
  taskId: text('task_id').primaryKey(),
  featureId: text('feature_id').notNull(),
  featureLabel: text('feature_label').notNull(),
  sourceRefs: jsonb('source_refs').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  lane: text('lane').notNull().default('todo'), // 'todo' | 'in_progress' | 'done'
  status: text('status').notNull().default('pending'), // 'pending' | 'active' | 'completed' | 'failed'
  validationCommand: text('validation_command'),
  assignee: text('assignee'),
  priority: integer('priority').notNull().default(0),
  claimToken: text('claim_token'),
  claimExpiresAt: timestamp('claim_expires_at', { withTimezone: true }),
  lastHeartbeatAt: timestamp('last_heartbeat_at', { withTimezone: true }),
  currentRunId: text('current_run_id'),
  attemptCount: integer('attempt_count').notNull().default(0),
  failureCount: integer('failure_count').notNull().default(0),
  maxRetries: integer('max_retries').notNull().default(3),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  idempotencyKey: text('idempotency_key'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

export type KanbanTask = typeof kanbanTasks.$inferSelect;
export type NewKanbanTask = typeof kanbanTasks.$inferInsert;

export const kanbanTaskDependencies = pgTable('kanban_task_dependencies', {
  parentTaskId: text('parent_task_id').notNull(),
  childTaskId: text('child_task_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const kanbanTaskComments = pgTable('kanban_task_comments', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  taskId: text('task_id').notNull(),
  author: text('author').notNull(),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const kanbanTaskEvents = pgTable('kanban_task_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  taskId: text('task_id').notNull(),
  runId: text('run_id'),
  eventType: text('event_type').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const kanbanTaskAttempts = pgTable('kanban_task_attempts', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  taskId: text('task_id').notNull(),
  runId: text('run_id').notNull(),
  worker: text('worker').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  success: boolean('success').notNull().default(false),
  failureKind: text('failure_kind'),
  executionReceiptId: text('execution_receipt_id'),
});
