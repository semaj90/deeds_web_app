-- Parent Atlas staged observation feature materialization.
-- PostgreSQL is the exact identity/observation owner; Qdrant/Valkey/HNSW are rebuildable retrieval projections.
--
-- ============================================================================
-- SUPERSEDED — DO NOT APPLY the `atlas_observation_feature_rows` table below.
-- ============================================================================
-- Confirmed via docs/reports/atlas-observation-feature-row-contract-v1.json
-- (BLOCKED_DUPLICATE_INCOMPATIBLE_MIGRATIONS audit) and live schema
-- inspection (2026-08-24): this file's `atlas_observation_feature_rows`
-- (PK candidate_id+workspace_revision, carries semantic_768) collides on
-- table name with `20260819_atlas_observation_feature_rows.sql`'s
-- `atlas_observation_feature_rows` (PK packet_key+feature_revision, no
-- vector — semantic ANN intentionally owned elsewhere). ONLY the sibling
-- file's version matches the live Drizzle schema
-- (src/lib/server/db/schema/atlas-observation-feature-rows.ts),
-- observation-feature-materializer.ts, and export-spectral-fixture-routing-labels.mjs
-- and was applied live 2026-08-24 (table confirmed empty/new at apply time,
-- zero pre-existing data affected).
--
-- This file's `atlas_observation_feature_rows` block was NEVER applied
-- against live Postgres. Because it uses `CREATE TABLE IF NOT EXISTS`, running
-- this file now would silently no-op that block (the table already exists in
-- the OTHER shape) rather than error — do not run this file expecting it to
-- create this shape.
--
-- The `atlas_observation_records` table above this banner is a SEPARATE,
-- non-conflicting table and is not affected by this notice — it was left
-- untouched and unapplied, pending its own review.
--
-- If this candidate_id/semantic_768 shape is still wanted, it needs a new,
-- non-colliding table name and an explicit decision on whether it becomes a
-- second semantic_768 owner (a hard "no" per this repo's runtime-ownership
-- rules unless a documented supersession/migration is written first) — an
-- operator decision, not made by this edit.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS atlas_observation_records (
  observation_id text PRIMARY KEY,
  candidate_id text NOT NULL,
  family text NOT NULL CHECK (family IN ('AST','LANGEXTRACT','ONTOLOGY','GRAPH','CLUSTER','CONTEXT')),
  source_ref text NOT NULL,
  source_revision text NOT NULL,
  workspace_revision text NOT NULL,
  observation_revision text NOT NULL,
  start_offset bigint,
  end_offset bigint,
  offset_unit text CHECK (offset_unit IS NULL OR offset_unit IN ('BYTE','CHAR')),
  evidence_refs text[] NOT NULL DEFAULT ARRAY[]::text[],
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  canonical_authority boolean NOT NULL DEFAULT false CHECK (canonical_authority = false),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((start_offset IS NULL) = (end_offset IS NULL)),
  CHECK (start_offset IS NULL OR end_offset > start_offset)
);
CREATE INDEX IF NOT EXISTS atlas_observation_records_candidate_idx
  ON atlas_observation_records(candidate_id, workspace_revision, family);
CREATE INDEX IF NOT EXISTS atlas_observation_records_source_idx
  ON atlas_observation_records(source_ref, source_revision, family);
CREATE INDEX IF NOT EXISTS atlas_observation_records_evidence_gin_idx
  ON atlas_observation_records USING gin(evidence_refs);
CREATE INDEX IF NOT EXISTS atlas_observation_records_payload_gin_idx
  ON atlas_observation_records USING gin(payload jsonb_path_ops);

CREATE TABLE IF NOT EXISTS atlas_observation_feature_rows (
  candidate_id text NOT NULL,
  workspace_revision text NOT NULL,
  source_ref text NOT NULL,
  source_revision text NOT NULL,
  row_ordinal bigint NOT NULL CHECK (row_ordinal >= 0),
  row_identity_checksum text NOT NULL CHECK (row_identity_checksum ~ '^[a-f0-9]{64}$'),
  registry_revision text NOT NULL,
  feature_row_checksum text NOT NULL CHECK (feature_row_checksum ~ '^[a-f0-9]{64}$'),

  -- Exact/grounded categorical projection columns. Arrays are intentionally narrow
  -- enough for GIN/bitmap-combinable filtering; the full row remains in feature_payload.
  ontology_classes text[] NOT NULL DEFAULT ARRAY[]::text[],
  ast_observation_kinds text[] NOT NULL DEFAULT ARRAY[]::text[],
  langextract_classes text[] NOT NULL DEFAULT ARRAY[]::text[],
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],

  -- Derived graph/cluster/context signals.
  pagerank real,
  ppr real,
  graph_degree real,
  kmeans_cluster integer CHECK (kmeans_cluster IS NULL OR kmeans_cluster >= 0),
  som_cell text,
  community_id text,
  authority_weight real,
  recency real,
  validation_passed boolean,

  -- Exact semantic mirror for relational filtering + bounded exact/ANN comparison.
  semantic_768 vector(768),
  embedding_revision text,

  observation_refs text[] NOT NULL,
  feature_payload jsonb NOT NULL,
  canonical_authority boolean NOT NULL DEFAULT false CHECK (canonical_authority = false),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (candidate_id, workspace_revision),
  UNIQUE (workspace_revision, row_ordinal),
  CHECK (cardinality(observation_refs) > 0),
  CHECK ((semantic_768 IS NULL) = (embedding_revision IS NULL))
);

CREATE INDEX IF NOT EXISTS atlas_observation_feature_rows_source_idx
  ON atlas_observation_feature_rows(source_ref, source_revision, workspace_revision);
CREATE INDEX IF NOT EXISTS atlas_observation_feature_rows_kmeans_idx
  ON atlas_observation_feature_rows(kmeans_cluster, workspace_revision)
  WHERE kmeans_cluster IS NOT NULL;
CREATE INDEX IF NOT EXISTS atlas_observation_feature_rows_som_idx
  ON atlas_observation_feature_rows(som_cell, workspace_revision)
  WHERE som_cell IS NOT NULL;
CREATE INDEX IF NOT EXISTS atlas_observation_feature_rows_ontology_gin_idx
  ON atlas_observation_feature_rows USING gin(ontology_classes);
CREATE INDEX IF NOT EXISTS atlas_observation_feature_rows_ast_gin_idx
  ON atlas_observation_feature_rows USING gin(ast_observation_kinds);
CREATE INDEX IF NOT EXISTS atlas_observation_feature_rows_langextract_gin_idx
  ON atlas_observation_feature_rows USING gin(langextract_classes);
CREATE INDEX IF NOT EXISTS atlas_observation_feature_rows_tags_gin_idx
  ON atlas_observation_feature_rows USING gin(tags);
CREATE INDEX IF NOT EXISTS atlas_observation_feature_rows_observation_refs_gin_idx
  ON atlas_observation_feature_rows USING gin(observation_refs);
CREATE INDEX IF NOT EXISTS atlas_observation_feature_rows_payload_gin_idx
  ON atlas_observation_feature_rows USING gin(feature_payload jsonb_path_ops);

-- HNSW is a fallback/challenger executor. Exact ORDER BY <=> remains available and
-- should be preferred after selective relational filtering when the candidate set is bounded.
CREATE INDEX IF NOT EXISTS atlas_observation_feature_rows_semantic_hnsw_idx
  ON atlas_observation_feature_rows USING hnsw (semantic_768 vector_cosine_ops)
  WHERE semantic_768 IS NOT NULL;

CREATE OR REPLACE VIEW atlas_observation_feature_rows_current AS
SELECT DISTINCT ON (candidate_id) *
FROM atlas_observation_feature_rows
ORDER BY candidate_id, workspace_revision DESC, updated_at DESC;
