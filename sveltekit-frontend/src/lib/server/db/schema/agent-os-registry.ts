import { bigserial, jsonb, pgTable, timestamp, text, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const taskRegistry = pgTable('task_registry', {
  taskId: uuid('task_id').primaryKey().notNull(),
  taskType: text('task_type').notNull(),
  status: text('status').notNull(),
  payload: jsonb('payload').default(sql`'{}'::jsonb`).notNull(),
  result: jsonb('result').default(sql`'{}'::jsonb`).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const agentOsEvents = pgTable('agent_os_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey().notNull(),
  traceId: uuid('trace_id'),
  eventType: text('event_type'),
  source: text('source'),
  title: text('title'),
  body: text('body'),
  severity: text('severity'),
  featureId: text('feature_id'),
  packetId: text('packet_id'),
  metadata: jsonb('metadata').default(sql`'{}'::jsonb`).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export type TaskRegistryRow = typeof taskRegistry.$inferSelect;
export type NewTaskRegistryRow = typeof taskRegistry.$inferInsert;
export type AgentOsEventRow = typeof agentOsEvents.$inferSelect;
export type NewAgentOsEventRow = typeof agentOsEvents.$inferInsert;
