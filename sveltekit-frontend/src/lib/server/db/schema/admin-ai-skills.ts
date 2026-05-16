import { pgTable, text, timestamp, uuid, jsonb, boolean, integer } from 'drizzle-orm/pg-core';

/**
 * Persists reusable "Skills" for Gemma 4.
 * A skill is a guided mission with specific tools and a custom system prompt.
 */
export const adminAiSkills = pgTable('admin_ai_skills', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(), // e.g., "log_analyzer", "ui_auditor"
  description: text('description'),
  systemPrompt: text('system_prompt').notNull(),
  toolAllowlist: text('tool_allowlist').array(), // List of MCP tools this skill can use
  inputSchema: jsonb('input_schema'), // Zod-like schema for input parameters
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  createdBy: integer('created_by'),
  isSystem: boolean('is_system').default(false) // Built-in skills
});

/**
 * Tracks the execution of subagent runs.
 * Each run is a sequence of thoughts and tool calls toward a mission.
 */
export const adminAiSubagentRuns = pgTable('admin_ai_subagent_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  skillId: uuid('skill_id').references(() => adminAiSkills.id),
  sessionId: uuid('session_id'), // Link back to the parent chat session
  status: text('status').notNull(), // "running", "completed", "failed"
  mission: text('mission').notNull(),
  result: text('result'),
  trace: jsonb('trace').notNull(), // Array of { thought, tool, output }
  tokensUsed: integer('tokens_used').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  completedAt: timestamp('completed_at')
});
