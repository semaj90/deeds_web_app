-- screenshot_artifacts.sql
-- Manual migration — apply with:
--   docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db \
--     < drizzle/manual/screenshot_artifacts.sql
--
-- Or via the helper:
--   npm run db:apply-migration drizzle/manual/screenshot_artifacts.sql
--
-- ⚠️ NOT auto-applied on folder open. Schema changes are deliberate
--    operator actions per config/startup-concurrency-policy.json.
--
-- Stores metadata for UI screenshots / route thumbnails / 16×16 visual
-- fingerprints. Image blobs themselves live in MinIO or filesystem;
-- this table holds only the relational metadata + optional caption embedding.
--
-- Companion: scripts/screenshots/index-screenshots.mjs (dry-run safe)
--            scripts/screenshots/caption-screenshots-gemma4.mjs (manual)
--
-- All CREATE TABLE / INDEX / EXTENSION statements use IF NOT EXISTS so
-- this migration is idempotent and safe to re-run.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS screenshot_artifacts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Provenance
  source_kind     text NOT NULL,                  -- 'route', 'component', 'manual', 'visual-regression'
  source_ref      text,                            -- e.g. test name or capture trigger
  route_path      text,                            -- e.g. '/analysis-center'
  file_path       text,                            -- e.g. 'src/lib/components/AgenticController.svelte'
  component_name  text,                            -- e.g. 'AgenticController'

  -- Image references (blobs live in MinIO / filesystem, NOT here)
  image_uri       text NOT NULL,                   -- s3://, file://, minio://
  thumb_16_uri    text,                            -- 16×16 visual fingerprint
  thumb_64_uri    text,                            -- 64×64 preview thumbnail
  width           integer,
  height          integer,
  bytes           bigint,

  -- Visual fingerprints
  phash           text,                            -- perceptual hash (16-char hex)
  dhash           text,                            -- difference hash
  visual_cluster  integer,                         -- nearest GPU k-means cluster (mirrors codebase_chunk_index)

  -- Content extracted from image
  caption         text,                            -- Gemma4 VLM caption (manual run)
  ocr_text        text,                            -- pytesseract / external OCR

  -- Topology linkage (mirrors codebase_chunks_768 conventions)
  topo_class      text,                            -- 'ui-component', 'api-route', etc.
  cluster_id      text,                            -- e.g. 'gpu:92' (matches Qdrant cluster_key)

  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Lookup indexes
CREATE INDEX IF NOT EXISTS screenshot_artifacts_file_idx
  ON screenshot_artifacts (file_path);
CREATE INDEX IF NOT EXISTS screenshot_artifacts_route_idx
  ON screenshot_artifacts (route_path);
CREATE INDEX IF NOT EXISTS screenshot_artifacts_component_idx
  ON screenshot_artifacts (component_name);
CREATE INDEX IF NOT EXISTS screenshot_artifacts_cluster_idx
  ON screenshot_artifacts (cluster_id);
CREATE INDEX IF NOT EXISTS screenshot_artifacts_phash_idx
  ON screenshot_artifacts (phash);
CREATE INDEX IF NOT EXISTS screenshot_artifacts_created_at_idx
  ON screenshot_artifacts (created_at DESC);

-- pg_trgm fuzzy search on caption + OCR + file_path
CREATE INDEX IF NOT EXISTS screenshot_artifacts_caption_trgm_idx
  ON screenshot_artifacts
  USING gin (caption gin_trgm_ops);
CREATE INDEX IF NOT EXISTS screenshot_artifacts_ocr_trgm_idx
  ON screenshot_artifacts
  USING gin (ocr_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS screenshot_artifacts_file_trgm_idx
  ON screenshot_artifacts
  USING gin (file_path gin_trgm_ops);

-- JSONB metadata GIN
CREATE INDEX IF NOT EXISTS screenshot_artifacts_metadata_gin_idx
  ON screenshot_artifacts
  USING gin (metadata jsonb_path_ops);

-- Optional pgvector column for caption embeddings (768-dim, matches embeddinggemma)
-- Comment out the column + index if you don't want Postgres-side vector storage
-- (Qdrant handles dense vectors as the primary engine).
ALTER TABLE screenshot_artifacts
  ADD COLUMN IF NOT EXISTS caption_embedding vector(768);

CREATE INDEX IF NOT EXISTS screenshot_artifacts_caption_embedding_hnsw_idx
  ON screenshot_artifacts
  USING hnsw (caption_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

COMMENT ON TABLE screenshot_artifacts IS
  'UI screenshot metadata + visual fingerprints. Blobs in MinIO/FS, dense vectors in Qdrant. Created by scripts/screenshots/index-screenshots.mjs.';
COMMENT ON COLUMN screenshot_artifacts.thumb_16_uri IS
  '16×16 perceptual fingerprint — used as compact visual key for layout/duplicate detection, NOT for OCR or detail recognition.';
COMMENT ON COLUMN screenshot_artifacts.cluster_id IS
  'Matches Qdrant codebase_chunks_768.payload.cluster_key (e.g. gpu:92) so visual + code retrieval can join.';

COMMIT;