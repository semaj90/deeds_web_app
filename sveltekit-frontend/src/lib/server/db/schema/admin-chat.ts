import { pgTable, text, timestamp, uuid, jsonb, integer } from 'drizzle-orm/pg-core';

/**
 * Admin AI Chat Sessions: Persists conversation metadata for auditing and history.
 */
export const adminAiChatSessions = pgTable('admin_ai_chat_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull(),
  title: text('title').notNull().default('Admin chat'),
  mode: text('mode').notNull().default('read_only_trace'),
  provider: text('provider').notNull().default('ollama'),
  model: text('model').notNull(),
  kbSnapshotHash: text('kb_snapshot_hash'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

/**
 * Admin AI Chat Messages: Stores individual turns including tool calls and context packs.
 */
export const adminAiChatMessages = pgTable('admin_ai_chat_messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id').notNull().references(() => adminAiChatSessions.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // user | assistant | system | tool
  content: text('content').notNull(),
  toolName: text('tool_name'),
  toolCallJson: jsonb('tool_call_json'),
  toolResultJson: jsonb('tool_result_json'),
  contextPackJson: jsonb('context_pack_json'),
  attachments: jsonb('attachments'), // Array of { fileId, type, name, url }
  metadata: jsonb('metadata'), // Extra reasoning metadata
  tokenEstimate: integer('token_estimate'),
  latencyMs: integer('latency_ms'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

export type AdminAiChatSession = typeof adminAiChatSessions.$inferSelect;
export type NewAdminAiChatSession = typeof adminAiChatSessions.$inferInsert;
export type AdminAiChatMessage = typeof adminAiChatMessages.$inferSelect;
export type NewAdminAiChatMessage = typeof adminAiChatMessages.$inferInsert;
