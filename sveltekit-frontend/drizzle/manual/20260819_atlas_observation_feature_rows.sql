-- Parent Atlas ORF-2: exact observation feature materialization.
-- Manual/isolated migration by design; no pgvector ANN index is created here.
-- Apply only after schema pre-apply checks and capture an operator receipt.

BEGIN;

CREATE TABLE IF NOT EXISTS atlas_observation_feature_rows (
  packet_key text NOT NULL,
  feature_revision text NOT NULL,
  source_ref text NOT NULL,
  source_version_receipt_id text,
  workspace_revision integer,
  representation_id text,
  representation_revision text,
  tree_node_id text,

  ontology_classes text[] NOT NULL DEFAULT '{}'::text[],
  ast_observation_kinds text[] NOT NULL DEFAULT '{}'::text[],
  langextract_classes text[] NOT NULL DEFAULT '{}'::text[],
  flattened_tags text[] NOT NULL DEFAULT '{}'::text[],

  ontology_mask jsonb NOT NULL,
  ast_pattern_mask jsonb NOT NULL,
  structural_flags jsonb NOT NULL,
  evidence_refs text[] NOT NULL DEFAULT '{}'::text[],

  kmeans_cluster_id integer,
  som_row integer,
  som_col integer,
  community_id text,
  pagerank real,
  personalized_pagerank real,

  producer_revision text NOT NULL,
  input_digest text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT atlas_observation_feature_rows_pk
    PRIMARY KEY (packet_key, feature_revision),
  CONSTRAINT atlas_observation_feature_rows_input_digest_len
    CHECK (length(input_digest) = 64)
);

CREATE INDEX IF NOT EXISTS atlas_observation_feature_rows_source_ref_idx
  ON atlas_observation_feature_rows (source_ref);
CREATE INDEX IF NOT EXISTS atlas_observation_feature_rows_workspace_feature_idx
  ON atlas_observation_feature_rows (workspace_revision, feature_revision);
CREATE INDEX IF NOT EXISTS atlas_observation_feature_rows_representation_idx
  ON atlas_observation_feature_rows (representation_id, representation_revision);
CREATE INDEX IF NOT EXISTS atlas_observation_feature_rows_tree_node_idx
  ON atlas_observation_feature_rows (tree_node_id);
CREATE INDEX IF NOT EXISTS atlas_observation_feature_rows_kmeans_idx
  ON atlas_observation_feature_rows (kmeans_cluster_id);
CREATE INDEX IF NOT EXISTS atlas_observation_feature_rows_som_idx
  ON atlas_observation_feature_rows (som_row, som_col);
CREATE INDEX IF NOT EXISTS atlas_observation_feature_rows_community_idx
  ON atlas_observation_feature_rows (community_id);

CREATE INDEX IF NOT EXISTS atlas_observation_feature_rows_ontology_gin
  ON atlas_observation_feature_rows USING gin (ontology_classes);
CREATE INDEX IF NOT EXISTS atlas_observation_feature_rows_ast_gin
  ON atlas_observation_feature_rows USING gin (ast_observation_kinds);
CREATE INDEX IF NOT EXISTS atlas_observation_feature_rows_extract_gin
  ON atlas_observation_feature_rows USING gin (langextract_classes);
CREATE INDEX IF NOT EXISTS atlas_observation_feature_rows_tags_gin
  ON atlas_observation_feature_rows USING gin (flattened_tags);

COMMENT ON TABLE atlas_observation_feature_rows IS
  'ORF-2 deterministic metadata/filter materialization; semantic ANN is intentionally owned elsewhere.';
COMMENT ON COLUMN atlas_observation_feature_rows.source_version_receipt_id IS
  'Source freshness/version evidence reference; do not replace with fabricated source_revision.';
COMMENT ON COLUMN atlas_observation_feature_rows.kmeans_cluster_id IS
  'Derived routing hint only; never packet identity or evidence authority.';

COMMIT;
