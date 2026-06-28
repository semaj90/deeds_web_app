-- Parent Atlas recovery spine
-- Purpose: recreate the minimum packet + summary tables required by current
-- scripts after a partial restore where only atlas_packet_registry survived.
-- Additive only: no drops, no deletes, no packet identity mutation.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS atlas_packets (
  packet_id text PRIMARY KEY,
  artifact_id text,
  packet_key text UNIQUE,
  source_ref text,
  source_ref_key text,
  file_path text,
  directory_path text,
  feature_id text,
  feature_label text,
  function_symbol text,
  community_id integer,
  concept_ids text[],
  cluster_id integer,
  embedding vector(768),
  payload jsonb DEFAULT '{}'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  permissions jsonb NOT NULL DEFAULT '{"visibility":"internal","can_write":false,"can_execute":false,"can_export":false,"source":"repo_index"}'::jsonb,
  topology jsonb NOT NULL DEFAULT '{}'::jsonb,
  vectors jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary text,
  tags text[],
  byte_start bigint,
  byte_end bigint,
  sha256 text,
  source_kind text,
  source_path text,
  group_id text,
  packet_universe text DEFAULT 'atlas',
  qdrant_point_id text,
  qdrant_collection text,
  qdrant_vector_dim integer,
  identity_lane text DEFAULT 'qdrant_chunk',
  identity_confidence double precision DEFAULT 1.0,
  som_cluster text,
  som_row integer,
  som_col integer,
  som_index integer,
  kmeans_cluster integer,
  pagerank real,
  betweenness real,
  eigenvector real,
  neo4j_node_id text,
  redis_centroid_key text,
  latent_64 bytea,
  reward_prior double precision DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS atlas_summary_layers (
  packet_key text NOT NULL REFERENCES atlas_packets(packet_key) ON DELETE CASCADE,
  layer_type text,
  summary_level text,
  summary text,
  summary_text text,
  keywords text[],
  entities text[],
  metadata jsonb DEFAULT '{}'::jsonb,
  embedding vector(768),
  embedding_model text DEFAULT 'embeddinggemma:latest',
  vector_dim integer DEFAULT 768,
  model_name text,
  generated_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_atlas_packets_packet_key
  ON atlas_packets (packet_key);

CREATE INDEX IF NOT EXISTS idx_atlas_packets_source_ref
  ON atlas_packets (source_ref);

CREATE INDEX IF NOT EXISTS idx_atlas_packets_source_ref_key
  ON atlas_packets (source_ref_key);

CREATE INDEX IF NOT EXISTS idx_atlas_packets_feature_id
  ON atlas_packets (feature_id);

CREATE INDEX IF NOT EXISTS idx_atlas_packets_file_path
  ON atlas_packets (file_path);

CREATE INDEX IF NOT EXISTS idx_atlas_packets_file_path_trgm
  ON atlas_packets USING gin (file_path gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_atlas_packets_metadata_gin
  ON atlas_packets USING gin (metadata);

CREATE INDEX IF NOT EXISTS idx_atlas_packets_payload_gin
  ON atlas_packets USING gin (payload);

CREATE INDEX IF NOT EXISTS idx_atlas_packets_permissions_gin_pathops
  ON atlas_packets USING gin (permissions jsonb_path_ops);

CREATE INDEX IF NOT EXISTS idx_atlas_packets_topology_gin_pathops
  ON atlas_packets USING gin (topology jsonb_path_ops);

CREATE INDEX IF NOT EXISTS idx_atlas_packets_vectors_gin_pathops
  ON atlas_packets USING gin (vectors jsonb_path_ops);

CREATE INDEX IF NOT EXISTS idx_atlas_packets_concept_ids
  ON atlas_packets USING gin (concept_ids);

CREATE INDEX IF NOT EXISTS idx_atlas_packets_tags
  ON atlas_packets USING gin (tags);

CREATE INDEX IF NOT EXISTS idx_atlas_packets_summary_fts
  ON atlas_packets USING gin (to_tsvector('english', coalesce(summary, '')));

CREATE INDEX IF NOT EXISTS idx_atlas_packets_qdrant_point_id
  ON atlas_packets (qdrant_point_id);

CREATE INDEX IF NOT EXISTS idx_atlas_packets_identity_lane
  ON atlas_packets (identity_lane);

CREATE INDEX IF NOT EXISTS idx_atlas_packets_som_cluster
  ON atlas_packets (som_cluster);

CREATE INDEX IF NOT EXISTS idx_atlas_packets_som_index
  ON atlas_packets (som_index);

CREATE INDEX IF NOT EXISTS idx_atlas_packets_neo4j_node_id
  ON atlas_packets (neo4j_node_id) WHERE neo4j_node_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_atlas_packets_redis_centroid_key
  ON atlas_packets (redis_centroid_key) WHERE redis_centroid_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_summary_layers_packet_key
  ON atlas_summary_layers (packet_key);

CREATE INDEX IF NOT EXISTS idx_summary_layers_layer_type
  ON atlas_summary_layers (layer_type);

CREATE INDEX IF NOT EXISTS idx_summary_layers_packet_effective_level
  ON atlas_summary_layers (packet_key, COALESCE(layer_type, summary_level));

CREATE INDEX IF NOT EXISTS idx_summary_layers_keywords
  ON atlas_summary_layers USING gin (keywords);

CREATE INDEX IF NOT EXISTS idx_summary_layers_entities
  ON atlas_summary_layers USING gin (entities);

CREATE INDEX IF NOT EXISTS idx_summary_layers_metadata_gin
  ON atlas_summary_layers USING gin (metadata);

CREATE INDEX IF NOT EXISTS idx_summary_layers_summary_fts
  ON atlas_summary_layers USING gin (to_tsvector('english', coalesce(summary, summary_text, '')));
