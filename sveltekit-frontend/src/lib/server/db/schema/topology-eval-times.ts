import { sql } from 'drizzle-orm';
import {
  pgTable, bigserial, text, real, integer, boolean, jsonb, timestamp, index
} from 'drizzle-orm/pg-core';

/**
 * atlas_topology_eval_times
 *
 * Pointer-only provenance rows for AE encode, SOM train, centroid cache,
 * HyperRAG topology, and replay lanes.
 *
 * Rules:
 *  - ONE row per operation (encode batch, training run, cache write, replay query)
 *  - NO vectors, NO full packet payloads stored here
 *  - hits go into metadata JSONB as a summary array (packet_key, feature_id, source_ref, fusion_score)
 *  - lane discriminates the operation type
 *
 * Lane values:
 *   ae_encode       — autoencoderEncode GPU batch (768→128→64)
 *   som_train       — trainSOM GPU run
 *   centroid_cache  — Redis centroid cache write/read
 *   hyperrag        — HyperRAG fusion query
 *   replay          — golden retrieval replay trace
 */
export const atlasTopologyEvalTimes = pgTable('atlas_topology_eval_times', {
  id:           bigserial('id', { mode: 'number' }).primaryKey(),

  // Identity pointers — no payload data
  queryHash:    text('query_hash'),
  packetKey:    text('packet_key').notNull().default(''),
  featureId:    text('feature_id'),
  sourceRef:    text('source_ref'),

  // Lane discriminator
  lane:         text('lane').notNull().default('hyperrag'),

  // Dimension metadata (no actual vectors)
  inputDim:     integer('input_dim'),
  latentDim:    integer('latent_dim'),
  somGrid:      text('som_grid'),

  // Per-lane timings (ms)
  encodeMs:     real('encode_ms'),
  somMs:        real('som_ms'),
  redisMs:      real('redis_ms'),
  postgresMs:   real('postgres_ms'),
  totalMs:      real('total_ms'),

  // Outcome
  cacheHit:     boolean('cache_hit').default(false),
  error:        text('error'),

  /**
   * Pointer-only metadata. Example for hyperrag lane:
   * {
   *   "hits": [
   *     { "packet_key": "...", "feature_id": "...", "source_ref": "...",
   *       "fusion_score": 0.82, "retrieval_strategy": "bm25+qdrant+neo4j+redis" }
   *   ],
   *   "counts": { "packet_hits": 10, "cache_hits": 1, "neo4j_expansions": 25 }
   * }
   */
  metadata:     jsonb('metadata').default(sql`'{}'::jsonb`),

  createdAt:    timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  laneIdx:        index('idx_topo_eval_lane').on(t.lane),
  packetKeyIdx:   index('idx_topo_eval_packet_key').on(t.packetKey),
  featureIdIdx:   index('idx_topo_eval_feature_id').on(t.featureId),
  queryHashIdx:   index('idx_topo_eval_query_hash').on(t.queryHash),
  createdAtIdx:   index('idx_topo_eval_created_at').on(t.createdAt),
  metadataGin:    index('idx_topo_eval_metadata_gin').using('gin', t.metadata),
}));

export type AtlasTopologyEvalTimes    = typeof atlasTopologyEvalTimes.$inferSelect;
export type NewAtlasTopologyEvalTimes = typeof atlasTopologyEvalTimes.$inferInsert;
