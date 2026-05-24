import { pgTable, varchar, jsonb, timestamp, integer } from 'drizzle-orm/pg-core';

// Defines the structure for tracking agent failures and context issues
export const memoryStuckEvents = pgTable('memory_stuck_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  runId: varchar('run_id').notNull(),
  agent: varchar('agent').notNull(),
  userIntent: varchar('user_intent').$type<string>().default(null),
  phase: varchar('phase').notNull().$type<string>(), // e.g., 'tool_loop', 'context_overflow'
  symptom: varchar('symptom').notNull(),
  lastQuery: varchar('last_query').$type<string>().default(null),
  retryQuery: varchar('retry_query').$type<string>().default(null),
  sourceRefs: jsonb('source_refs').array<string>().default([]),
  toolsTried: jsonb('tools_tried').array<string>().default([]),
  filesRead: jsonb('files_read').array<string>().default([]),
  tokenEstimate: integer('token_estimate').default(null),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  // Additional fields for tracing/audit
  isProcessed: integer('is_processed').default(0),
  processedAt: timestamp('processed_at').default(null),
});
