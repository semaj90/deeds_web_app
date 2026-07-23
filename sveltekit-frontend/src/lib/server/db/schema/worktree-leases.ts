import { sql } from 'drizzle-orm';
import {
  bigint,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const worktreeLeaseStatusValues = [
  'ALLOCATED',
  'ACTIVE',
  'VALIDATING',
  'READY_FOR_REVIEW',
  'BLOCKED',
  'RELEASED',
  'ARCHIVED',
] as const;

export type WorktreeLeaseStatus = (typeof worktreeLeaseStatusValues)[number];

export const worktreeLeases = pgTable(
  'worktree_leases',
  {
    leaseId: uuid('lease_id').defaultRandom().primaryKey().notNull(),
    taskId: text('task_id').notNull(),
    runId: text('run_id'),
    ownerAgent: text('owner_agent').notNull(),
    repositoryRoot: text('repository_root').notNull(),
    worktreePath: text('worktree_path').notNull(),
    branchName: text('branch_name').notNull(),
    baseCommit: text('base_commit').notNull(),
    allowedPaths: jsonb('allowed_paths').notNull().default(sql`'[]'::jsonb`),
    forbiddenPaths: jsonb('forbidden_paths').notNull().default(sql`'[]'::jsonb`),
    status: text('status').notNull().default('ALLOCATED'),
    acquiredAt: timestamp('acquired_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  },
  (table) => ({
    taskIdx: index('worktree_leases_task_idx').on(table.taskId),
    runIdx: index('worktree_leases_run_idx').on(table.runId),
    ownerIdx: index('worktree_leases_owner_idx').on(table.ownerAgent, table.status),
    pathIdx: uniqueIndex('worktree_leases_path_unique_idx').on(table.repositoryRoot, table.worktreePath),
    branchIdx: index('worktree_leases_branch_idx').on(table.branchName),
  }),
);

export type WorktreeLeaseRow = typeof worktreeLeases.$inferSelect;
export type NewWorktreeLeaseRow = typeof worktreeLeases.$inferInsert;
