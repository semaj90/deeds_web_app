import { pgTable, text, jsonb, timestamp, integer, index } from 'drizzle-orm/pg-core';

// Defines the structure for tracking agent failures and context issues
export const memoryStuckEvents = pgTable(
  'memory_stuck_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    runId: text('run_id').notNull(),
    agent: text('agent').notNull(),
    userIntent: text('user_intent'),
    phase: text('phase').notNull(), // e.g., 'tool_loop', 'context_overflow'
    symptom: text('symptom').notNull(),
    lastQuery: text('last_query'),
    retryQuery: text('retry_query'),
    sourceRefs: jsonb('source_refs').$type<string[]>().default([]).notNull(),
    toolsTried: jsonb('tools_tried').$type<string[]>().default([]).notNull(),
    filesRead: jsonb('files_read').$type<string[]>().default([]).notNull(),
    tokenEstimate: integer('token_estimate'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    // Additional fields for tracing/audit
    isProcessed: integer('is_processed').default(0),
    processedAt: timestamp('processed_at'),
  },
  (table) => ({
    runIdIdx: index('memory_stuck_events_run_id_idx').on(table.runId),
    agentIdx: index('memory_stuck_events_agent_idx').on(table.agent),
  })
);
