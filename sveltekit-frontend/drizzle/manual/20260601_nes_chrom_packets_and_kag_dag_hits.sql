-- NES chrom packets + KAG DAG hits
-- Additive migration for compact packet storage and KAG hit indexing.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS kag_dag_runs (
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

CREATE TABLE IF NOT EXISTS nes_chrom_packets (
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
  community_confidence numeric,
  community_source text,
  domain_class text,
  ledger_type text,
  lineage_version text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  canonical boolean NOT NULL DEFAULT false,
  payload_backfilled_at timestamptz,
  som_row integer,
  som_col integer,
  som_index integer,
  kmeans_cluster integer,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  embedding vector(768),
  qdrant_point_id text,
  kag_dag_run_id uuid REFERENCES kag_dag_runs(id) ON DELETE SET NULL,
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
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nes_chrom_packets_query_hash_idx ON nes_chrom_packets(query_hash);
CREATE INDEX IF NOT EXISTS nes_chrom_packets_chunk_id_idx ON nes_chrom_packets(chunk_id);
CREATE UNIQUE INDEX IF NOT EXISTS nes_chrom_packets_packet_key_key ON nes_chrom_packets(packet_key);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_packet_key_idx ON nes_chrom_packets(packet_key);
CREATE INDEX IF NOT EXISTS nes_chrom_packets_source_ref_idx ON nes_chrom_packets(source_ref);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_source_ref ON nes_chrom_packets(source_ref);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_source_ref_idx ON nes_chrom_packets(source_ref);
CREATE INDEX IF NOT EXISTS nes_chrom_packets_feature_id_idx ON nes_chrom_packets(feature_id);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_feature_id ON nes_chrom_packets(feature_id);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_feature_source ON nes_chrom_packets(feature_id, source_ref);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_feature_label_idx ON nes_chrom_packets(feature_label);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_community_id_idx ON nes_chrom_packets(community_id);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_community_confidence_idx ON nes_chrom_packets(community_confidence);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_community_source_idx ON nes_chrom_packets(community_source);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_domain_class_idx ON nes_chrom_packets(domain_class);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_ledger_type_idx ON nes_chrom_packets(ledger_type);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_lineage_version_idx ON nes_chrom_packets(lineage_version);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_metadata_gin ON nes_chrom_packets USING gin (metadata);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_tags_gin ON nes_chrom_packets USING gin (tags);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_som_index_idx ON nes_chrom_packets(som_index);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_kmeans_cluster_idx ON nes_chrom_packets(kmeans_cluster);
CREATE INDEX IF NOT EXISTS nes_chrom_packets_qdrant_point_idx ON nes_chrom_packets(qdrant_point_id);
CREATE INDEX IF NOT EXISTS nes_chrom_packets_kag_run_idx ON nes_chrom_packets(kag_dag_run_id);
CREATE INDEX IF NOT EXISTS nes_chrom_packets_source_refs_gin ON nes_chrom_packets USING gin (source_refs);
CREATE INDEX IF NOT EXISTS nes_chrom_packets_payload_gin ON nes_chrom_packets USING gin (payload);
CREATE INDEX IF NOT EXISTS nes_chrom_packets_embedding_hnsw
  ON nes_chrom_packets USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_feature_ids_gin ON nes_chrom_packets USING gin (feature_ids);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_lane_ids_gin ON nes_chrom_packets USING gin (lane_ids);
CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_som_cluster ON nes_chrom_packets (som_cluster);
CREATE INDEX IF NOT EXISTS nes_chrom_packets_source_ref_id_idx ON nes_chrom_packets (source_ref_id);
CREATE INDEX IF NOT EXISTS nes_chrom_packets_feature_code_idx ON nes_chrom_packets (feature_code);
CREATE INDEX IF NOT EXISTS nes_chrom_packets_som_code_idx ON nes_chrom_packets (som_code);
CREATE INDEX IF NOT EXISTS nes_chrom_packets_confidence_score_idx ON nes_chrom_packets (confidence_score);
CREATE INDEX IF NOT EXISTS nes_chrom_packets_packet_zstd_idx ON nes_chrom_packets (packet_zstd);

CREATE TABLE IF NOT EXISTS nes_chrom_kag_dag_hits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_id uuid NOT NULL REFERENCES nes_chrom_packets(id) ON DELETE CASCADE,
  run_id uuid REFERENCES kag_dag_runs(id) ON DELETE SET NULL,
  chunk_id text NOT NULL,
  source_ref text NOT NULL,
  hit_type text NOT NULL DEFAULT 'context',
  score real,
  node_key text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nes_chrom_kag_dag_hits_packet_idx ON nes_chrom_kag_dag_hits(packet_id);
CREATE INDEX IF NOT EXISTS nes_chrom_kag_dag_hits_run_idx ON nes_chrom_kag_dag_hits(run_id);
CREATE INDEX IF NOT EXISTS nes_chrom_kag_dag_hits_chunk_idx ON nes_chrom_kag_dag_hits(chunk_id);
CREATE INDEX IF NOT EXISTS nes_chrom_kag_dag_hits_source_ref_idx ON nes_chrom_kag_dag_hits(source_ref);
CREATE INDEX IF NOT EXISTS nes_chrom_kag_dag_hits_node_key_idx ON nes_chrom_kag_dag_hits(node_key);
CREATE INDEX IF NOT EXISTS nes_chrom_kag_dag_hits_evidence_gin ON nes_chrom_kag_dag_hits USING gin (evidence);
CREATE INDEX IF NOT EXISTS nes_chrom_kag_dag_hits_metadata_gin ON nes_chrom_kag_dag_hits USING gin (metadata);
