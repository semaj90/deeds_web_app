import { index, jsonb, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const parentAtlasJobs = pgTable('parent_atlas_jobs', {
  id: serial('id').primaryKey(),
  recordId: text('record_id'),
  status: text('status').notNull().default('pending'),
  payload: jsonb('payload'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  statusIdx: index('idx_parent_atlas_jobs_status').on(table.status),
}));

export type ParentAtlasJob = typeof parentAtlasJobs.$inferSelect;
export type NewParentAtlasJob = typeof parentAtlasJobs.$inferInsert;
