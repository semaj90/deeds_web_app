-- Adds ast_generation to atlas_ast_nodes (2026-09-20). Additive, nullable, idempotent.
--
-- Why: live rows mix hash grains. 11,223 legacy rows have UNKNOWN source_content_hash grain (1,708
-- of 2,200 legacy files carry several different hashes for one file) while the 2026-09 regenerated
-- candidates carry a whole-file raw SHA-256. A generation tag lets readers and the writer separate
-- them without a second table (5 tables reference atlas_ast_nodes by FK) and without touching rows.
--
-- Contract for ast_generation = 'sept_v2' (frozen 2026-09-20):
--   source_content_hash  = SHA-256 of complete RAW source-file bytes (RAW_FILE_BYTES_SHA256)
--   normalized_node_hash = node-local hash (NORMALIZED_NODE_V1)
--   start_byte/end_byte  = UTF-8 offsets into the normalized parser buffer (UTF8_PARSER_BUFFER_V1)
--   line_start/line_end  = ONE_BASED_STORAGE
--   source_revision/workspace_id populated; parser ast-grep-napi
-- NULL = legacy / untagged / grain UNKNOWN. This migration does NOT backfill legacy rows: labelling
-- them is a separate, explicitly approved UPDATE, and NULL must never be read as 'sept_v2'.

ALTER TABLE atlas_ast_nodes ADD COLUMN IF NOT EXISTS ast_generation text;

COMMENT ON COLUMN atlas_ast_nodes.ast_generation IS
  'NULL = legacy/untagged (source_content_hash grain UNKNOWN). sept_v2 = whole-file raw source_content_hash, UTF8_PARSER_BUFFER_V1 offsets, ONE_BASED_STORAGE lines, revision-qualified. See drizzle/manual/20260920_atlas_ast_nodes_generation.sql.';

CREATE INDEX IF NOT EXISTS idx_atlas_ast_nodes_generation
  ON atlas_ast_nodes (ast_generation) WHERE ast_generation IS NOT NULL;
