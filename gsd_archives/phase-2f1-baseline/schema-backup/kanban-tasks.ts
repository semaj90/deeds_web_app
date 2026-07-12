import { pgTable, text, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const kanbanTasks = pgTable('kanban_tasks', {
  taskId: text('task_id').primaryKey(),
  featureId: text('feature_id').notNull(),
  featureLabel: text('feature_label').notNull(),
  sourceRefs: jsonb('source_refs').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  lane: text('lane').notNull().default('todo'), // 'todo' | 'in_progress' | 'done'
  status: text('status').notNull().default('pending'), // 'pending' | 'active' | 'completed' | 'failed'
  validationCommand: text('validation_command'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

export type KanbanTask = typeof kanbanTasks.$inferSelect;
export type NewKanbanTask = typeof kanbanTasks.$inferInsert;
