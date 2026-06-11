import { pgTable, text, jsonb, timestamp, uuid, doublePrecision, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const agentTraces = pgTable('agent_traces', {
  traceId: uuid('trace_id').defaultRandom().primaryKey(),
  taskId: text('task_id').notNull(),
  prompt: text('prompt').notNull(),
  retrievedPackets: jsonb('retrieved_packets').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  toolCalls: jsonb('tool_calls').$type<any[]>().notNull().default(sql`'[]'::jsonb`),
  commands: jsonb('commands').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  outcome: text('outcome').notNull(), // 'success' | 'failure' | 'partial'
  retrievalStrategy: text('retrieval_strategy').$type<'vector_only' | 'lexical_only' | 'structural_only' | 'fusion' | 'cold_neschrom'>().default('fusion'),
  selectedConcepts: jsonb('selected_concepts').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  score: doublePrecision('score').default(1.0),
  traceSource: text('trace_source').$type<'opencode' | 'claude_code' | 'gemma4' | 'manual' | 'ci'>().default('gemma4').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => ({
  strategyIdx: index('idx_agent_traces_strategy').on(table.retrievalStrategy),
  scoreIdx: index('idx_agent_traces_score').on(table.score),
  traceSourceIdx: index('idx_agent_traces_trace_source').on(table.traceSource)
}));

export type AgentTrace = typeof agentTraces.$inferSelect;
export type NewAgentTrace = typeof agentTraces.$inferInsert;
