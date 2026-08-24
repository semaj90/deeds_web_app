-- Reconciles atlas_packet_features with the columns
-- scripts/atlas/phase1-ast-grep-extraction.mjs has always written toward but
-- that were never actually migrated onto the live table (its own
-- `CREATE TABLE IF NOT EXISTS` schema-init block was a no-op against the
-- already-existing table from drizzle/0043_atlas_packet_features_schema.sql
-- + drizzle/0020_fix_packet_feature_metrics_schema.sql, so the mismatch was
-- never caught). Confirmed live via `\d atlas_packet_features` before this
-- migration: only id, packet_key, used_concepts, concept_coverage,
-- lexical_features, ast_symbols, created_at, updated_at, entities,
-- tree_node_ids, imports, exports existed.
--
-- Purely additive. All columns nullable or defaulted — zero risk to the
-- existing 61,657 rows, no data loss, no rewrite of existing ast_symbols.
--
-- Deliberately NOT added: a `packet_id` column. The script's own schema-init
-- intended `packet_id INTEGER NOT NULL REFERENCES atlas_packets(id)`, but
-- atlas_packets has no `id` column at all (its own identity column,
-- `packet_id`, is `text`, not an auto-increment integer) — that FK could
-- never have been satisfiable. `atlas_packet_features.packet_key` (already
-- the table's real unique constraint, `atlas_packet_features_packet_key_key`)
-- is the canonical identity join key per the Parent Atlas frozen identity
-- contract; adding a second, meaningless `packet_id` column would just
-- reintroduce the feature_id-only-style join risk that contract forbids.
-- The corresponding script code is fixed alongside this migration to stop
-- referencing packet_id.

ALTER TABLE atlas_packet_features
  ADD COLUMN IF NOT EXISTS source_ref text;

ALTER TABLE atlas_packet_features
  ADD COLUMN IF NOT EXISTS ast_coverage real DEFAULT 0;

ALTER TABLE atlas_packet_features
  ADD COLUMN IF NOT EXISTS ast_language varchar(50);

ALTER TABLE atlas_packet_features
  ADD COLUMN IF NOT EXISTS ast_extraction_method varchar(50);

ALTER TABLE atlas_packet_features
  ADD COLUMN IF NOT EXISTS ast_hash varchar(64);

-- Validation gate (idempotent, matches the style of drizzle/0043's own gate)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'atlas_packet_features' AND column_name = 'ast_extraction_method'
  ) THEN
    RAISE EXCEPTION 'atlas_packet_features.ast_extraction_method column missing after migration';
  END IF;
END $$;
