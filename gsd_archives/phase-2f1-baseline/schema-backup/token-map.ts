import { boolean, index, integer, jsonb, pgTable, real, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Token-map packets and cards.
 *
 * Captures the compact prompt/answer boundary for ACE/NES routing:
 * source chunks, token costs, feature labels, graph paths, and cacheability.
 */
export const tokenMapCards = pgTable(
  'token_map_cards',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    cacheKey: text('cache_key').notNull(),
    query: text('query').notNull(),
    model: text('model').notNull(),
    featureKey: text('feature_key').notNull(),
    packetState: text('packet_state').notNull(),
    promptTokens: integer('prompt_tokens').notNull().default(0),
    completionTokens: integer('completion_tokens').notNull().default(0),
    totalTokens: integer('total_tokens').notNull().default(0),
    compressedTokens: integer('compressed_tokens').notNull().default(0),
    bpeWasteScore: real('bpe_waste_score').notNull().default(0),
    chunkIds: text('chunk_ids').array().notNull().default(sql`'{}'::text[]`),
    featureKeys: text('feature_keys').array().notNull().default(sql`'{}'::text[]`),
    graphPaths: text('graph_paths').array().notNull().default(sql`'{}'::text[]`),
    sourceRefs: text('source_refs').array().notNull().default(sql`'{}'::text[]`),
    toolPolicy: text('tool_policy').notNull().default('read_only'),
    answerSummary: text('answer_summary').notNull(),
    answerHash: text('answer_hash'),
    qdrantPointId: text('qdrant_point_id'),
    turbovecCode: text('turbovec_code'),
    nextActions: text('next_actions').array().notNull().default(sql`'{}'::text[]`),
    cacheable: boolean('cacheable').notNull().default(true),
    degraded: boolean('degraded').notNull().default(false),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    cacheKeyUq: unique('token_map_cards_cache_key_uq').on(t.cacheKey),
    queryIdx: index('idx_token_map_cards_query').on(t.query),
    modelIdx: index('idx_token_map_cards_model').on(t.model),
    featureKeyIdx: index('idx_token_map_cards_feature_key').on(t.featureKey),
    packetStateIdx: index('idx_token_map_cards_packet_state').on(t.packetState),
  })
);

export type TokenMapCardRow = typeof tokenMapCards.$inferSelect;
export type NewTokenMapCardRow = typeof tokenMapCards.$inferInsert;
