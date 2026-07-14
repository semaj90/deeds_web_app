// @ts-nocheck
/**
 * Atlas Packet Registry Schema (Drizzle ORM)
 * Canonical truth for all packet state across the system.
 * Every service reads/writes via this table; mirrors live in Qdrant, Valkey, Neo4j, DuckDB.
 */

import {
  pgTable,
  text,
  integer,
  real,
  bigint,
  jsonb,
  timestamp,
  vector,
  index,
  uniqueIndex,
  sql,
} from 'drizzle-orm/pg-core';

export const atlasPacketRegistry = pgTable(
  'atlas_packet_registry',
  {
    // Identity (immutable spine)
    packet_key: text('packet_key').primaryKey(),
    trace_id: text('trace_id'),
    source_ref: text('source_ref').notNull(),
    file_path: text('file_path').notNull(),
    feature_id: text('feature_id').notNull(),

    // Content
    title: text('title'),
    summary: text('summary'),

    // Embedding & Latent State
    embedding_status: text('embedding_status').default('missing'),
    embedding_dim: integer('embedding_dim').default(768),
    embedding_768d: vector('embedding_768d', { dimensions: 768 }),
    latent_384d: vector('latent_384d', { dimensions: 384 }),
    latent_64: text('latent_64'), // Compressed 64-dim latent vector (from autoencoder), stored as hex string

    // Clustering & Manifold Geometry
    kmeans_cluster_id: text('kmeans_cluster_id'),
    som_x: integer('som_x'),
    som_y: integer('som_y'),
    semantic_z: real('semantic_z'), // 3rd-dim semantic coordinate
    activity_w: real('activity_w'), // 4th-dim activity coordinate
    manifold4: jsonb('manifold4'), // Full 4D manifold projection

    // Service References (Canonical → Mirror Mapping)
    qdrant_point_id: bigint('qdrant_point_id', { mode: 'number' }).unique(),
    turbovec_id: text('turbovec_id').unique(),
    neo4j_node_id: text('neo4j_node_id').unique(),
    valkey_cache_key: text('valkey_cache_key').unique(),
    ace_cache_key: text('ace_cache_key').unique(),
    seaweedfs_filer_path: text('seaweedfs_filer_path').unique(),

    // Authority & Ranking
    pagerank_score: real('pagerank_score'),
    authority_blend: real('authority_blend'), // 0.4·pagerank + 0.3·attention + 0.3·authority
    karpathy_score: real('karpathy_score'),
    last_rerank_score: real('last_rerank_score'),

    // Retrieval Metrics
    retrieval_count: integer('retrieval_count').default(0),
    cache_hits: integer('cache_hits').default(0),
    cache_misses: integer('cache_misses').default(0),
    last_retrieved: timestamp('last_retrieved'),

    // Cache State & Lifecycle
    cache_state: text('cache_state')
      .default('cold')
      .check(
        check(
          'cache_state_check',
          sql`cache_state IN ('L1:redis', 'L2:bifrost', 'L3:qdrant', 'L4:disk', 'cold')`
        )
      ),
    activity: jsonb('activity'), // {indexed_at, embedded_at, cached_at, retrieved_at, reranked_at, etc}
    status: text('status')
      .default('active')
      .check(
        check('status_check', sql`status IN ('active', 'archived', 'staged', 'error')`)
      ),

    // Timestamps
    created_at: timestamptz('created_at').defaultNow(),
    updated_at: timestamptz('updated_at').defaultNow(),

    // Relationships (for KAG/DAG retrieval)
    kag_edges: jsonb('kag_edges').default(sql`'{}'::jsonb`),
    dag_edges: jsonb('dag_edges').default(sql`'{}'::jsonb`),

    // Operational Metadata
    total_size_bytes: bigint('total_size_bytes', { mode: 'number' }),
    validation_status: text('validation_status').check(
      check(
        'validation_status_check',
        sql`validation_status IN ('valid', 'needs_review', 'corrupted')`
      )
    ),
    last_validated: timestamp('last_validated'),
  },
  (table) => ({
    idx_packet_feature_id: index('idx_packet_feature_id').on(table.feature_id),
    idx_packet_cache_state: index('idx_packet_cache_state').on(table.cache_state),
    idx_packet_pagerank: index('idx_packet_pagerank').on(table.pagerank_score),
    idx_packet_authority: index('idx_packet_authority').on(table.authority_blend),
    idx_packet_retrieved: index('idx_packet_retrieved').on(table.last_retrieved),
    idx_packet_updated: index('idx_packet_updated').on(table.updated_at),
    idx_packet_embedding_cosine: index('idx_packet_embedding_cosine').using('hnsw', table.embedding_768d),
    idx_packet_kag_edges: index('idx_packet_kag_edges').using('gin', table.kag_edges),
    idx_packet_dag_edges: index('idx_packet_dag_edges').using('gin', table.dag_edges),
  })
);

export type AtlasPacket = typeof atlasPacketRegistry.$inferSelect;
export type NewAtlasPacket = typeof atlasPacketRegistry.$inferInsert;
