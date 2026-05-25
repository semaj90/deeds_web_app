CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;

-- Standard Phase 9 Indexes
CREATE INDEX IF NOT EXISTS documents_atlas_som_bmu_idx
ON documents_atlas_entries (som_bmu_row, som_bmu_col);

CREATE INDEX IF NOT EXISTS documents_atlas_audit_score_idx
ON documents_atlas_entries (audit_score);

CREATE INDEX IF NOT EXISTS documents_atlas_dominant_tags_gin_idx
ON documents_atlas_entries
USING gin (dominant_tags);

CREATE INDEX IF NOT EXISTS documents_atlas_summary_trgm_idx
ON documents_atlas_entries
USING gin (summary gin_trgm_ops);

-- User-requested explicit JSONB GIN indexes for rapid topology traversals
-- Indexing toon
CREATE INDEX IF NOT EXISTS documents_atlas_toon_gin_idx_legacy
ON documents_atlas_entries
USING gin ((metadata->'toon'));

-- Indexing sub summaries (assuming they live in metadata or a top-level jsonb)
CREATE INDEX IF NOT EXISTS documents_atlas_sub_summaries_gin_idx
ON documents_atlas_entries
USING gin ((metadata->'sub_summaries'));

-- Indexing chunk_id
CREATE INDEX IF NOT EXISTS documents_atlas_chunk_id_gin_idx_legacy
ON documents_atlas_entries
USING gin ((metadata->'chunk_id'));

-- --- User Additions for Phase 9 SQL ---

-- 1. Add missing columns safely
ALTER TABLE documents_atlas_entries ADD COLUMN IF NOT EXISTS toon jsonb DEFAULT '{}'::jsonb;
ALTER TABLE documents_atlas_entries ADD COLUMN IF NOT EXISTS source_refs jsonb DEFAULT '[]'::jsonb;
ALTER TABLE documents_atlas_entries ADD COLUMN IF NOT EXISTS chunk_ids jsonb DEFAULT '[]'::jsonb;
ALTER TABLE documents_atlas_entries ADD COLUMN IF NOT EXISTS cluster_tags jsonb DEFAULT '[]'::jsonb;
ALTER TABLE documents_atlas_entries ADD COLUMN IF NOT EXISTS parent_id uuid;
ALTER TABLE documents_atlas_entries ADD COLUMN IF NOT EXISTS feature_family text;

-- 2. Add requested JSONB GIN Indexes
CREATE INDEX IF NOT EXISTS documents_atlas_metadata_gin_idx
ON documents_atlas_entries USING gin (metadata);
CREATE INDEX IF NOT EXISTS documents_atlas_toon_gin_idx
ON documents_atlas_entries USING gin (toon);
CREATE INDEX IF NOT EXISTS documents_atlas_source_refs_gin_idx
ON documents_atlas_entries USING gin (source_refs);
CREATE INDEX IF NOT EXISTS documents_atlas_chunk_ids_gin_idx
ON documents_atlas_entries USING gin (chunk_ids);
CREATE INDEX IF NOT EXISTS documents_atlas_cluster_tags_gin_idx
ON documents_atlas_entries USING gin (cluster_tags);

-- 3. Add fast parent traversal indexes
CREATE INDEX IF NOT EXISTS documents_atlas_parent_idx
ON documents_atlas_entries (parent_id);
CREATE INDEX IF NOT EXISTS documents_atlas_feature_family_idx
ON documents_atlas_entries (feature_family);
