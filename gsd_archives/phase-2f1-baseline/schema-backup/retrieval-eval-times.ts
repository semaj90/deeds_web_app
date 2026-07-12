import { sql } from 'drizzle-orm';
import { pgTable, bigserial, text, real, integer, boolean, jsonb, timestamp, index } from 'drizzle-orm/pg-core';

/**
 * atlas_retrieval_eval_times
 *
 * Pointer-only telemetry rows. No full packet payload stored here.
 *
 * Column semantics:
 *   feature_id      Stable capability/function identity  e.g. retrieval.hyperrag.packet_rpc
 *   domain_class    Domain/ontology bucket               e.g. retrieval_pipeline, graph_topology
 *   ontology_label  Ontology classification              e.g. hyperrag_fusion, som_cluster
 *   topology_label  Structural graph role                e.g. core_search_entrypoint, cache_mirror
 *   source_ref      Exact evidence anchor                e.g. src/lib/server/retrieval/hyperrag-packet-rpc.ts#L40-L130
 */
export const atlasRetrievalEvalTimes = pgTable('atlas_retrieval_eval_times', {
  id:             bigserial('id', { mode: 'number' }).primaryKey(),
  queryHash:      text('query_hash'),
  route:          text('route'),
  packetKey:      text('packet_key'),
  /** Stable capability/function identity — e.g. retrieval.hyperrag.packet_rpc */
  featureId:      text('feature_id'),
  /** Domain/ontology bucket — e.g. retrieval_pipeline, graph_topology, runtime_evidence */
  domainClass:    text('domain_class'),
  /** Ontology classification — e.g. hyperrag_fusion, som_cluster, ace_context */
  ontologyLabel:  text('ontology_label'),
  /** Structural graph role — e.g. core_search_entrypoint, cache_mirror, graph_neighbor */
  topologyLabel:  text('topology_label'),
  sourceRef:      text('source_ref'),
  qdrantMs:       real('qdrant_ms'),
  bm25Ms:         real('bm25_ms'),
  pgBm25Ms:       real('pg_bm25_ms'),
  pgvectorMs:     real('pgvector_ms'),
  redisMs:        real('redis_ms'),
  bitfrostMs:     real('bitfrost_ms'),
  neo4jMs:        real('neo4j_ms'),
  turbovecMs:     real('turbovec_ms'),
  rerankMs:       real('rerank_ms'),
  gemma4Ms:       real('gemma4_ms'),
  totalMs:        real('total_ms'),
  cacheHitSource: text('cache_hit_source'),
  ttlRemaining:   integer('ttl_remaining'),
  protocol:       text('protocol'),
  accelerator:    text('accelerator'),
  cudaAvailable:  boolean('cuda_available'),
  cuvsEnabled:    boolean('cuvs_enabled'),
  matmulMs:       real('matmul_ms'),
  embeddingMs:    real('embedding_ms'),
  verdict:        text('verdict'),
  resultCount:    integer('result_count'),
  error:          text('error'),
  payload:        jsonb('payload').default(sql`'{}'::jsonb`),
  createdAt:      timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  queryHashIdx:     index('idx_eval_times_query_hash').on(table.queryHash),
  routeIdx:         index('idx_eval_times_route').on(table.route),
  packetKeyIdx:     index('idx_eval_times_packet_key').on(table.packetKey),
  featureIdIdx:     index('idx_eval_times_feature_id').on(table.featureId),
  domainClassIdx:   index('idx_eval_times_domain_class').on(table.domainClass),
  ontologyLabelIdx: index('idx_eval_times_ontology_label').on(table.ontologyLabel),
  resultCountIdx:   index('idx_eval_times_result_count').on(table.resultCount),
  protocolIdx:      index('idx_eval_times_protocol').on(table.protocol),
  acceleratorIdx:   index('idx_eval_times_accelerator').on(table.accelerator),
  verdictIdx:       index('idx_eval_times_verdict').on(table.verdict),
  payloadGin:       index('idx_eval_times_payload_gin').using('gin', table.payload),
}));

export type AtlasRetrievalEvalTimes = typeof atlasRetrievalEvalTimes.$inferSelect;
export type NewAtlasRetrievalEvalTimes = typeof atlasRetrievalEvalTimes.$inferInsert;
