-- Fixes real schema drift found live 2026-08-22 while proving ACE end-to-end:
-- fetchCodebaseContext() (features/ai/ace/context-assembler.ts) selects these
-- columns from codebase_chunk_index; they exist in Drizzle's schema-postgres.ts
-- (lines ~4454-4458) but were never applied to the live table, so every real
-- chat request through ACE 500s with "column reconstruction_error does not
-- exist" before ever reaching the model.
--
-- Idempotent (IF NOT EXISTS) per this repo's Drizzle Safety Rule — safe to
-- run against a table with live rows (52,417 rows as of 2026-08-22).

ALTER TABLE codebase_chunk_index
  ADD COLUMN IF NOT EXISTS centroid_id uuid,
  ADD COLUMN IF NOT EXISTS reconstruction_error real,
  ADD COLUMN IF NOT EXISTS routing_tier varchar(10) DEFAULT 'cold';

CREATE INDEX IF NOT EXISTS codebase_chunk_index_centroid_idx
  ON codebase_chunk_index (centroid_id);

CREATE INDEX IF NOT EXISTS codebase_chunk_index_routing_tier_idx
  ON codebase_chunk_index (routing_tier);
