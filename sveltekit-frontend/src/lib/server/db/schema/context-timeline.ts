import { pgTable, uuid, integer, text, varchar, real, boolean, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from '../schema-postgres';

/**
 * context_timeline table
 * Durable write-path for the RL self-modification feedback loop.
 */
export const contextTimeline = pgTable('context_timeline', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
	sessionId: text('session_id').notNull().default(''),
	eventType: text('event_type').notNull(), // research, feedback, citation, graph_edge, rl_adapt, tool_call, summary
	pipeline: text('pipeline').notNull().default('ace'),
	summaryId: uuid('summary_id'),
	hyperedgeHash: varchar('hyperedge_hash', { length: 8 }),
	signal: text('signal'), // thumbs_up, thumbs_down, dwell_long, dwell_short, citation_saved
	grpoReward: real('grpo_reward'),
	pipelineWeightAfter: real('pipeline_weight_after'),
	triggeredRebuild: boolean('triggered_rebuild').notNull().default(false),
	payload: jsonb('payload').notNull().default({}),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`)
}, (t) => ({
	userCreatedIdx: index('ctx_user_created').on(t.userId, t.createdAt),
	sessionCreatedIdx: index('ctx_session_created').on(t.sessionId, t.createdAt),
	eventTypeIdx: index('ctx_event_type').on(t.eventType, t.createdAt),
	pipelineRewardIdx: index('ctx_pipeline_reward').on(t.pipeline, t.grpoReward),
	hyperedgeIdx: index('ctx_hyperedge').on(t.hyperedgeHash)
}));

export type ContextTimeline = typeof contextTimeline.$inferSelect;
export type NewContextTimeline = typeof contextTimeline.$inferInsert;
