import { sql } from 'drizzle-orm';
import { pgTable, bigserial, text, timestamp, integer, boolean, jsonb, index, numeric, uuid, uniqueIndex } from 'drizzle-orm/pg-core';

export const routeRuntimePackets = pgTable('route_runtime_packets', {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).defaultNow().notNull(),

    // Request identity
    route: text('route').notNull(),
    queryHash: text('query_hash'),
    queryPreview: text('query_preview'),

    // ACE packet fields
    sourceRefs: jsonb('source_refs').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    featureIds: jsonb('feature_ids').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    laneIds: jsonb('lane_ids').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    clusterId: text('cluster_id'),
    somCluster: text('som_cluster'),
    qdrantHits: integer('qdrant_hits'),
    redisHotKeys: jsonb('redis_hot_keys').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    raw: jsonb('raw').notNull().default(sql`'{}'::jsonb`),
    promptHash: text('prompt_hash'),
    reward: numeric('reward'),
    packetUuid: uuid('packet_uuid').defaultRandom(),
    routeState: text('route_state'),
    featureId: text('feature_id'),
    packetVersion: integer('packet_version'),
    supersedesPacketUuid: uuid('supersedes_packet_uuid'),
    supersededBy: uuid('superseded_by'),
    gitSha: text('git_sha'),
    gitDiffRank: numeric('git_diff_rank'),
    sourceRefQuality: numeric('source_ref_quality'),
    repairReason: text('repair_reason'),
    repairMethod: text('repair_method'),

    // Performance
    latencyMs: integer('latency_ms'),
    cacheHit: boolean('cache_hit').notNull().default(false),
    cacheTier: text('cache_tier'),

    // Outcome
    userId: integer('user_id'),
    sessionId: text('session_id'),
    responseTokens: integer('response_tokens'),
  },
  (t) => [
    index('idx_rrp_captured_at').on(t.capturedAt.desc()),
    index('idx_rrp_route').on(t.route, t.capturedAt.desc()),
    index('idx_rrp_cluster_id').on(t.clusterId).where(sql`${t.clusterId} IS NOT NULL`),
    index('idx_rrp_source_refs_gin').using('gin', t.sourceRefs),
    index('idx_rrp_feature_ids_gin').using('gin', t.featureIds),
    index('idx_route_runtime_packets_feature_id').on(t.featureId),
    index('idx_route_runtime_packets_feature_ids_gin').using('gin', t.featureIds),
    index('idx_route_runtime_packets_source_refs_gin').using('gin', t.sourceRefs),
    index('idx_route_runtime_packets_raw_gin').using('gin', t.raw),
    index('idx_rrp_git_sha').on(t.gitSha),
    index('idx_rrp_packet_version').on(t.packetVersion),
    index('idx_rrp_source_ref_quality').on(t.sourceRefQuality),
    index('idx_rrp_superseded_by').on(t.supersededBy),
    index('rrp_raw_gin').using('gin', t.raw),
    index('rrp_state_idx').on(t.routeState, t.capturedAt.desc()),
    index('rrp_feature_idx').on(t.featureId, t.capturedAt.desc()),
    uniqueIndex('rrp_packet_uuid_uidx').on(t.packetUuid),
  ]
);

export type RouteRuntimePacket = typeof routeRuntimePackets.$inferSelect;
export type NewRouteRuntimePacket = typeof routeRuntimePackets.$inferInsert;
