-- Restore the proven NES/CHROM packet projection contract.
-- Additive and idempotent: creates missing tables/columns/indexes only.
-- Does not delete, truncate, rewrite, or backfill existing data.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS public.kag_dag_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query text NOT NULL,
  query_hash text NOT NULL,
  intent text,
  status text NOT NULL,
  model text,
  total_duration_ms integer,
  final_answer text,
  final_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  finished_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.nes_chrom_packets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_key text NOT NULL,
  query_hash text NOT NULL,
  chunk_id text NOT NULL,
  source_ref text NOT NULL,
  source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  feature_id text NOT NULL,
  feature_label text,
  packet_type text NOT NULL DEFAULT 'nes_chrom',
  lane text NOT NULL DEFAULT 'semantic_packet',
  model text NOT NULL DEFAULT 'gemma4-rotorquant:latest',
  summary text,
  file_path text,
  community_id integer,
  community_confidence real,
  community_source text,
  domain_class text,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  topology jsonb NOT NULL DEFAULT '{}'::jsonb,
  vectors jsonb NOT NULL DEFAULT '{}'::jsonb,
  ledger_type text,
  lineage_version text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  canonical boolean NOT NULL DEFAULT false,
  identity_lane text DEFAULT 'qdrant_chunk',
  payload_backfilled_at timestamptz,
  pagerank real,
  betweenness real,
  eigenvector real,
  neo4j_node_id text,
  redis_centroid_key text,
  som_row integer,
  som_col integer,
  som_index integer,
  kmeans_cluster integer,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  embedding vector(768),
  qdrant_point_id text,
  kag_dag_run_id uuid REFERENCES public.kag_dag_runs(id) ON DELETE SET NULL,
  kag_node_key text,
  token_budget integer,
  feature_ids text[],
  som_cluster text,
  lane_ids text[],
  source_ref_id integer,
  feature_code integer,
  som_code smallint,
  confidence_score smallint,
  packet_zstd bytea,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT nes_chrom_packets_packet_key_key UNIQUE (packet_key)
);

ALTER TABLE public.nes_chrom_packets
  ADD COLUMN IF NOT EXISTS feature_label text,
  ADD COLUMN IF NOT EXISTS file_path text,
  ADD COLUMN IF NOT EXISTS community_id integer,
  ADD COLUMN IF NOT EXISTS community_confidence real,
  ADD COLUMN IF NOT EXISTS community_source text,
  ADD COLUMN IF NOT EXISTS domain_class text,
  ADD COLUMN IF NOT EXISTS permissions jsonb DEFAULT '{}'::jsonb NOT NULL,
  ADD COLUMN IF NOT EXISTS topology jsonb DEFAULT '{}'::jsonb NOT NULL,
  ADD COLUMN IF NOT EXISTS vectors jsonb DEFAULT '{}'::jsonb NOT NULL,
  ADD COLUMN IF NOT EXISTS ledger_type text,
  ADD COLUMN IF NOT EXISTS lineage_version text,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  ADD COLUMN IF NOT EXISTS tags jsonb DEFAULT '[]'::jsonb NOT NULL,
  ADD COLUMN IF NOT EXISTS canonical boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS identity_lane text DEFAULT 'qdrant_chunk',
  ADD COLUMN IF NOT EXISTS payload_backfilled_at timestamptz,
  ADD COLUMN IF NOT EXISTS pagerank real,
  ADD COLUMN IF NOT EXISTS betweenness real,
  ADD COLUMN IF NOT EXISTS eigenvector real,
  ADD COLUMN IF NOT EXISTS neo4j_node_id text,
  ADD COLUMN IF NOT EXISTS redis_centroid_key text,
  ADD COLUMN IF NOT EXISTS som_row integer,
  ADD COLUMN IF NOT EXISTS som_col integer,
  ADD COLUMN IF NOT EXISTS som_index integer,
  ADD COLUMN IF NOT EXISTS kmeans_cluster integer,
  ADD COLUMN IF NOT EXISTS embedding vector(768),
  ADD COLUMN IF NOT EXISTS qdrant_point_id text,
  ADD COLUMN IF NOT EXISTS kag_dag_run_id uuid,
  ADD COLUMN IF NOT EXISTS kag_node_key text,
  ADD COLUMN IF NOT EXISTS token_budget integer,
  ADD COLUMN IF NOT EXISTS feature_ids text[],
  ADD COLUMN IF NOT EXISTS som_cluster text,
  ADD COLUMN IF NOT EXISTS lane_ids text[],
  ADD COLUMN IF NOT EXISTS source_ref_id integer,
  ADD COLUMN IF NOT EXISTS feature_code integer,
  ADD COLUMN IF NOT EXISTS som_code smallint,
  ADD COLUMN IF NOT EXISTS confidence_score smallint,
  ADD COLUMN IF NOT EXISTS packet_zstd bytea;

CREATE UNIQUE INDEX IF NOT EXISTS nes_chrom_packets_packet_key_key
  ON public.nes_chrom_packets (packet_key);
CREATE INDEX IF NOT EXISTS nes_chrom_packets_query_hash_idx
  ON public.nes_chrom_packets (query_hash);
CREATE INDEX IF NOT EXISTS nes_chrom_packets_chunk_id_idx
  ON public.nes_chrom_packets (chunk_id);
CREATE INDEX IF NOT EXISTS nes_chrom_packets_source_ref_idx
  ON public.nes_chrom_packets (source_ref);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_source_ref
  ON public.nes_chrom_packets (source_ref);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_source_ref_idx
  ON public.nes_chrom_packets (source_ref);
CREATE INDEX IF NOT EXISTS nes_chrom_packets_feature_id_idx
  ON public.nes_chrom_packets (feature_id);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_feature_id
  ON public.nes_chrom_packets (feature_id);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_feature_id_idx
  ON public.nes_chrom_packets (feature_id);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_feature_source
  ON public.nes_chrom_packets (feature_id, source_ref);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_feature_label_idx
  ON public.nes_chrom_packets (feature_label);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_community_id_idx
  ON public.nes_chrom_packets (community_id);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_community_confidence_idx
  ON public.nes_chrom_packets (community_confidence);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_community_source_idx
  ON public.nes_chrom_packets (community_source);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_domain_class_idx
  ON public.nes_chrom_packets (domain_class);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_ledger_type_idx
  ON public.nes_chrom_packets (ledger_type);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_lineage_version_idx
  ON public.nes_chrom_packets (lineage_version);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_permissions_gin
  ON public.nes_chrom_packets USING gin (permissions);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_topology_gin
  ON public.nes_chrom_packets USING gin (topology);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_vectors_gin
  ON public.nes_chrom_packets USING gin (vectors);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_pagerank
  ON public.nes_chrom_packets (pagerank);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_betweenness
  ON public.nes_chrom_packets (betweenness);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_eigenvector
  ON public.nes_chrom_packets (eigenvector);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_neo4j_node_id
  ON public.nes_chrom_packets (neo4j_node_id);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_redis_centroid_key
  ON public.nes_chrom_packets (redis_centroid_key);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_packet_key_idx
  ON public.nes_chrom_packets (packet_key);
CREATE INDEX IF NOT EXISTS nes_chrom_packets_qdrant_point_idx
  ON public.nes_chrom_packets (qdrant_point_id);
CREATE INDEX IF NOT EXISTS nes_chrom_packets_kag_run_idx
  ON public.nes_chrom_packets (kag_dag_run_id);
CREATE INDEX IF NOT EXISTS nes_chrom_packets_source_refs_gin
  ON public.nes_chrom_packets USING gin (source_refs);
CREATE INDEX IF NOT EXISTS nes_chrom_packets_payload_gin
  ON public.nes_chrom_packets USING gin (payload);
CREATE INDEX IF NOT EXISTS nes_chrom_packets_metadata_gin
  ON public.nes_chrom_packets USING gin (metadata);
CREATE INDEX IF NOT EXISTS nes_chrom_packets_tags_gin
  ON public.nes_chrom_packets USING gin (tags);
CREATE INDEX IF NOT EXISTS nes_chrom_packets_feature_ids_gin
  ON public.nes_chrom_packets USING gin (feature_ids);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_feature_ids_gin
  ON public.nes_chrom_packets USING gin (feature_ids);
CREATE INDEX IF NOT EXISTS nes_chrom_packets_lane_ids_gin
  ON public.nes_chrom_packets USING gin (lane_ids);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_lane_ids_gin
  ON public.nes_chrom_packets USING gin (lane_ids);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_metadata_gin
  ON public.nes_chrom_packets USING gin (metadata);
CREATE INDEX IF NOT EXISTS nes_chrom_packets_embedding_hnsw
  ON public.nes_chrom_packets USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS nes_chrom_packets_source_ref_trgm_idx
  ON public.nes_chrom_packets USING gin (source_ref gin_trgm_ops);
CREATE INDEX IF NOT EXISTS nes_chrom_packets_norm_source_ref_trgm_idx
  ON public.nes_chrom_packets USING gin (lower(source_ref) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS nes_chrom_packets_summary_trgm_idx
  ON public.nes_chrom_packets USING gin (summary gin_trgm_ops);
CREATE INDEX IF NOT EXISTS nes_chrom_packets_som_index_idx
  ON public.nes_chrom_packets (som_index);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_som_index_idx
  ON public.nes_chrom_packets (som_index);
CREATE INDEX IF NOT EXISTS nes_chrom_packets_kmeans_cluster_idx
  ON public.nes_chrom_packets (kmeans_cluster);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_kmeans_cluster_idx
  ON public.nes_chrom_packets (kmeans_cluster);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_som_cluster
  ON public.nes_chrom_packets (som_cluster);
CREATE INDEX IF NOT EXISTS nes_chrom_packets_source_ref_id_idx
  ON public.nes_chrom_packets (source_ref_id);
CREATE INDEX IF NOT EXISTS nes_chrom_packets_feature_code_idx
  ON public.nes_chrom_packets (feature_code);
CREATE INDEX IF NOT EXISTS nes_chrom_packets_som_code_idx
  ON public.nes_chrom_packets (som_code);
CREATE INDEX IF NOT EXISTS nes_chrom_packets_confidence_score_idx
  ON public.nes_chrom_packets (confidence_score);
CREATE INDEX IF NOT EXISTS nes_chrom_packets_packet_zstd_idx
  ON public.nes_chrom_packets (packet_zstd);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_tags_gin
  ON public.nes_chrom_packets USING gin (tags);

CREATE TABLE IF NOT EXISTS public.nes_chrom_kag_dag_hits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_id uuid NOT NULL REFERENCES public.nes_chrom_packets(id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.kag_dag_runs(id) ON DELETE SET NULL,
  chunk_id text NOT NULL,
  source_ref text NOT NULL,
  hit_type text NOT NULL DEFAULT 'context',
  score real,
  node_key text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.nes_chrom_kag_dag_hits
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb NOT NULL;

CREATE INDEX IF NOT EXISTS nes_chrom_kag_dag_hits_packet_idx
  ON public.nes_chrom_kag_dag_hits (packet_id);
CREATE INDEX IF NOT EXISTS nes_chrom_kag_dag_hits_run_idx
  ON public.nes_chrom_kag_dag_hits (run_id);
CREATE INDEX IF NOT EXISTS nes_chrom_kag_dag_hits_chunk_idx
  ON public.nes_chrom_kag_dag_hits (chunk_id);
CREATE INDEX IF NOT EXISTS nes_chrom_kag_dag_hits_source_ref_idx
  ON public.nes_chrom_kag_dag_hits (source_ref);
CREATE INDEX IF NOT EXISTS nes_chrom_kag_dag_hits_node_key_idx
  ON public.nes_chrom_kag_dag_hits (node_key);
CREATE INDEX IF NOT EXISTS nes_chrom_kag_dag_hits_evidence_gin
  ON public.nes_chrom_kag_dag_hits USING gin (evidence);
CREATE INDEX IF NOT EXISTS nes_chrom_kag_dag_hits_metadata_gin
  ON public.nes_chrom_kag_dag_hits USING gin (metadata);
