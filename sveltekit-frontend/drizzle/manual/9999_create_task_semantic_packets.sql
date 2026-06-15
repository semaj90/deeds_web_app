-- 9999_create_task_semantic_packets.sql
-- Manual sidecar migration: Create task_semantic_packets table
-- Safe to run idempotently (IF NOT EXISTS guarded)

CREATE TABLE IF NOT EXISTS task_semantic_packets (
  id bigserial PRIMARY KEY,
  point_kind text DEFAULT 'task_summary' NOT NULL,
  packet_key text,
  qdrant_point_id text,
  workspace_id text,
  workspace_task_id integer NOT NULL,
  feature_id text,
  feature_label text,
  alias_id text,
  source_ref text,
  canonical_source_ref text,
  source_ref_hash text,
  file_path text,
  community_id integer,
  community_source text,
  community_confidence numeric,
  semantic_path jsonb NOT NULL DEFAULT '[]'::jsonb,
  related_feature_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  related_task_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  related_file_paths jsonb NOT NULL DEFAULT '[]'::jsonb,
  cluster_id text,
  centroid_id text,
  parent_centroid_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary text,
  summary_llm text,
  summary_model varchar(200),
  next_action text,
  summary_hash varchar(128),
  confidence numeric(5,4) DEFAULT 0.0,
  lineage_version text,
  ledger_type text,
  canonical boolean DEFAULT false NOT NULL,
  payload_backfilled_at timestamptz,
  domain_class text,
  som_row integer,
  som_col integer,
  som_index integer,
  kmeans_cluster integer,
  status varchar(40) DEFAULT 'idle' NOT NULL,
  agent_pickup_ready boolean DEFAULT false NOT NULL,
  observed_at timestamptz DEFAULT now() NOT NULL,
  valid_from timestamptz DEFAULT now() NOT NULL,
  valid_to timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  deleted boolean DEFAULT false NOT NULL
);

-- Indexes to support common queries
CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_point_kind ON task_semantic_packets (point_kind);
CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_workspace_id ON task_semantic_packets (workspace_id);
CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_workspace_task_id ON task_semantic_packets (workspace_task_id);
CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_feature_id ON task_semantic_packets (feature_id);
CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_feature_id_idx ON task_semantic_packets (feature_id);
CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_feature_label_idx ON task_semantic_packets (feature_label);
CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_qdrant_point_id ON task_semantic_packets (qdrant_point_id);
CREATE INDEX IF NOT EXISTS task_semantic_packets_alias_id_idx ON task_semantic_packets (alias_id);
CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_source_ref ON task_semantic_packets (source_ref);
CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_source_ref_idx ON task_semantic_packets (source_ref);
CREATE INDEX IF NOT EXISTS tsp_source_ref_hash_idx ON task_semantic_packets (source_ref_hash);
CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_cluster_id ON task_semantic_packets (cluster_id);
CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_centroid_id ON task_semantic_packets (centroid_id);
CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_community_id_idx ON task_semantic_packets (community_id);
CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_community_source_idx ON task_semantic_packets (community_source);
CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_community_confidence_idx ON task_semantic_packets (community_confidence);
CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_packet_key_idx ON task_semantic_packets (packet_key);
CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_domain_class_idx ON task_semantic_packets (domain_class);
CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_lineage_version_idx ON task_semantic_packets (lineage_version);
CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_ledger_type_idx ON task_semantic_packets (ledger_type);
CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_metadata_gin ON task_semantic_packets USING gin (metadata);
CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_tags_gin ON task_semantic_packets USING gin (tags);
CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_som_row_idx ON task_semantic_packets (som_row);
CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_som_col_idx ON task_semantic_packets (som_col);
CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_som_index_idx ON task_semantic_packets (som_index);
CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_kmeans_cluster_idx ON task_semantic_packets (kmeans_cluster);
CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_semantic_path_gin ON task_semantic_packets USING gin (semantic_path);
CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_related_feature_ids_gin ON task_semantic_packets USING gin (related_feature_ids);
CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_related_task_ids_gin ON task_semantic_packets USING gin (related_task_ids);
CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_related_file_paths_gin ON task_semantic_packets USING gin (related_file_paths);
CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_status ON task_semantic_packets (status);
CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_agent_pickup_ready ON task_semantic_packets (agent_pickup_ready);
CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_created_at ON task_semantic_packets (created_at);
CREATE INDEX IF NOT EXISTS idx_task_semantic_packets_updated_at ON task_semantic_packets (updated_at);

-- Optional FK: uncomment if workspace_tasks exists and you want referential integrity
-- ALTER TABLE task_semantic_packets
--   ADD CONSTRAINT fk_task_semantic_packets_workspace_tasks
--   FOREIGN KEY (workspace_task_id) REFERENCES workspace_tasks(id) ON DELETE CASCADE;
