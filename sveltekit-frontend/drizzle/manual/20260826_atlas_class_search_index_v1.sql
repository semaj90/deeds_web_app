-- PostgreSQL 18 class-level search projection, sourced from AST-grep
-- extraction (atlas_ast_nodes WHERE node_kind = 'class', 3,675 live rows as
-- of 2026-08-26). Mirrors the already-designed (but never-applied) file-level
-- pattern in 20260824_graphify_file_search_bitmap_v1.sql: an explicit,
-- rebuildable candidate ordinal + bitmap column for fast filtering, a GIN
-- full-text index, and a partial pgvector HNSW index for semantic class
-- search once real class-level embeddings exist.
--
-- PostgreSQL bitmap heap scans are planner behavior over any index (B-tree,
-- GIN, HNSW) — this table does not implement its own bitmap scan, it stores
-- an explicit `class_bitmap bit(16)` column (reserved for future
-- caller-defined flags; no meaning assigned yet) plus the array/JSON inputs
-- a bitmap-heap-scan-eligible query would filter on.
--
-- Manual sidecar (IF NOT EXISTS, additive-only) per the Drizzle Safety Rule
-- — no ALTER/DROP on any existing table, no destructive migration.
--
-- NOTE: array_to_string(anyarray, text) is marked STABLE (not IMMUTABLE) in
-- pg_proc, so it cannot appear directly inside a `GENERATED ALWAYS AS ...
-- STORED` expression ("generation expression is not immutable" — confirmed
-- live against PostgreSQL 18.4). The sibling file-level scaffold
-- (20260824_graphify_file_search_bitmap_v1.sql) has this exact same latent
-- bug in its `search_vector` column and would fail identically if applied
-- — plausibly why it was never applied. Standard fix: a thin IMMUTABLE SQL
-- wrapper (deterministic and side-effect-free for text[] in practice; the
-- STABLE marking is a conservative default for the general anyarray case).

CREATE OR REPLACE FUNCTION atlas_immutable_array_to_string(text[], text) RETURNS text AS
$$ SELECT array_to_string($1, $2) $$ LANGUAGE sql IMMUTABLE PARALLEL SAFE;

CREATE TABLE IF NOT EXISTS atlas_class_search_index_v1 (
  candidate_ordinal bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tree_node_id text NOT NULL UNIQUE REFERENCES atlas_ast_nodes(tree_node_id) ON DELETE CASCADE,
  node_kind text NOT NULL DEFAULT 'class' CHECK (node_kind = 'class'),
  qualified_symbol text NOT NULL,
  relative_path text NOT NULL,
  packet_key text,
  feature_id text,
  feature_label text,
  source_ref text,
  source_ref_hash char(64),
  source_revision text,
  parser_language text NOT NULL DEFAULT 'typescript',
  normalized_signature text NOT NULL DEFAULT '',
  line_start integer,
  line_end integer,
  embedding_digest text,
  embedding_dimension integer,
  embedding vector(768),
  class_bitmap bit(16) NOT NULL DEFAULT B'0000000000000000',
  tokens text[] NOT NULL DEFAULT '{}',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(qualified_symbol, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(relative_path, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(normalized_signature, '')), 'B') ||
    setweight(to_tsvector('simple', atlas_immutable_array_to_string(tokens, ' ')), 'C')
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS atlas_class_search_index_v1_search_gin ON atlas_class_search_index_v1 USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS atlas_class_search_index_v1_metadata_gin ON atlas_class_search_index_v1 USING GIN (metadata jsonb_path_ops);
CREATE INDEX IF NOT EXISTS atlas_class_search_index_v1_ordinal_btree ON atlas_class_search_index_v1 (candidate_ordinal);
CREATE INDEX IF NOT EXISTS atlas_class_search_index_v1_path_btree ON atlas_class_search_index_v1 (relative_path);
CREATE INDEX IF NOT EXISTS atlas_class_search_index_v1_packet_btree ON atlas_class_search_index_v1 (packet_key);
CREATE INDEX IF NOT EXISTS atlas_class_search_index_v1_embedding_hnsw ON atlas_class_search_index_v1 USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64) WHERE embedding IS NOT NULL;
