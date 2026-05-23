import { pgTable, uuid, text, timestamp, jsonb, integer } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const featureRegistry = pgTable('feature_registry', {
  id: uuid('id').defaultRandom().primaryKey(),
  featureKey: text('feature_key').notNull().unique(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull(), // missing | partial | implemented | blocked
  summary: text('summary'),
  sourceRefs: jsonb('source_refs').notNull().default(sql`'[]'::jsonb`),
  chunkIds: jsonb('chunk_ids').notNull().default(sql`'[]'::jsonb`),
  tags: jsonb('tags').notNull().default(sql`'[]'::jsonb`),
  codeRefs: jsonb('code_refs').notNull().default(sql`'[]'::jsonb`),
  testRefs: jsonb('test_refs').notNull().default(sql`'[]'::jsonb`),
  retryQueries: jsonb('retry_queries').notNull().default(sql`'[]'::jsonb`),
  clusterId: integer('cluster_id'),
  trustTier: text('trust_tier'),
  lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }).default(sql`now()`),
});

export const featureTasks = pgTable('feature_tasks', {
  id: uuid('id').defaultRandom().primaryKey(),
  featureKey: text('feature_key').notNull(),
  checkboxText: text('checkbox_text').notNull(),
  sourceRef: text('source_ref').notNull(),
  status: text('status').notNull(),
  priority: text('priority'),
  suggestedCommand: text('suggested_command'),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`),
});

export const agentProgressLog = pgTable('agent_progress_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  runId: text('run_id').notNull(),
  featureKey: text('feature_key').notNull(),
  query: text('query').notNull(),
  attemptedFix: text('attempted_fix'),
  result: text('result').notNull(), // solved | failed | partial
  errorSignature: text('error_signature'),
  commandsRun: jsonb('commands_run').notNull().default(sql`'[]'::jsonb`),
  filesChanged: jsonb('files_changed').notNull().default(sql`'[]'::jsonb`),
  retryQuery: text('retry_query'),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`now()`),
});
