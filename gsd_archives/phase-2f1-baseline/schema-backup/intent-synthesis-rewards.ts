/**
 * intentSynthesisRewards — sidecar schema
 *
 * Auto-extracted from drizzle-kit introspect (2026-05-30 drift remediation).
 * Live DB table: `intent_synthesis_rewards`
 *
 * NOTE: this file mirrors the LIVE DB shape. If you change the schema here,
 * make a matching SQL migration in drizzle/manual/ to keep the DB in sync.
 */

import { boolean, index, jsonb, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const intentSynthesisRewards = pgTable("intent_synthesis_rewards", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	queryHash: text("query_hash").notNull(),
	contextPackKey: text("context_pack_key"),
	selectedLane: text("selected_lane"),
	sourceRefs: jsonb("source_refs").default([]),
	chunkIds: jsonb("chunk_ids").default([]),
	retrievedCards: jsonb("retrieved_cards").default([]),
	authority: jsonb().default({}),
	retrievalTrace: jsonb("retrieval_trace").default({}),
	cachedSteps: jsonb("cached_steps").default([]),
	rewardScore: numeric("reward_score").default('0'),
	rewardReason: text("reward_reason"),
	feedback: jsonb().default({}),
	degraded: boolean().default(false),
	degradedReason: text("degraded_reason"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("intent_synthesis_rewards_context_pack_key_idx").using("btree", table.contextPackKey.asc().nullsLast().op("text_ops")),
	index("intent_synthesis_rewards_created_at_idx").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("intent_synthesis_rewards_query_hash_idx").using("btree", table.queryHash.asc().nullsLast().op("text_ops")),
]);

export type IntentSynthesisRewards = typeof intentSynthesisRewards.$inferSelect;
export type NewIntentSynthesisRewards = typeof intentSynthesisRewards.$inferInsert;
