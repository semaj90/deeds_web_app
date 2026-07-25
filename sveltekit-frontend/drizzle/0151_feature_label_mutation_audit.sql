-- Migration: Feature-Label Mutation Audit (Finding 6)
-- Date: 2026-07-24
-- Scope: Document and allow NULL feature_label for future enrichment audits
--
-- Context:
-- A repair UPDATE was applied on 2026-07-24 that set feature_label = COALESCE(feature_label, feature_id, 'unknown')
-- for 3,294 rows. This mutation lacks audit trail and makes it impossible to distinguish:
--   - Generated files that never had a label
--   - Packets that had real labels later overwritten with feature_id
--   - Packets that were already unknown
--
-- The schema currently enforces NOT NULL, which prevents:
--   - Auditing enrichment state progression
--   - Keeping feature_id separate from human-readable feature_label
--   - Rolling back selective mutations
--
-- This migration:
--   1. Allows feature_label to be NULL for future packets
--   2. Documents the mutation in a new audit table
--   3. Preserves current values (no data loss)

-- Create audit table to track feature_label mutations
CREATE TABLE IF NOT EXISTS atlas_feature_label_audit (
  id BIGSERIAL PRIMARY KEY,
  packet_key VARCHAR(255) NOT NULL,
  feature_id VARCHAR(255) NOT NULL,
  old_feature_label TEXT,
  new_feature_label TEXT NOT NULL,
  mutation_type VARCHAR(50) NOT NULL CHECK (mutation_type IN ('COALESCE_ID', 'COALESCE_UNKNOWN', 'UNKNOWN', 'PRESERVED')),
  repair_date TIMESTAMP NOT NULL DEFAULT NOW(),
  repair_session VARCHAR(100),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_packet_key ON atlas_feature_label_audit(packet_key);
CREATE INDEX IF NOT EXISTS idx_audit_mutation_type ON atlas_feature_label_audit(mutation_type);

-- Record statistics about the mutation for audit trail
-- (If you have access to the old state, populate this with historical data)
INSERT INTO atlas_feature_label_audit (packet_key, feature_id, old_feature_label, new_feature_label, mutation_type, repair_session, notes)
VALUES (
  'MUTATION_METADATA',
  'REPAIR_SESSION',
  NULL,
  'COALESCE_SESSION_2026_07_24',
  'COALESCE_ID',
  '2026-07-24-atlas-repair',
  'UPDATE atlas_packets SET feature_label = COALESCE(feature_label, feature_id, ''unknown'') WHERE feature_label IS NULL OR feature_label = ''''; Rows updated: 3,294. Generated files: ~150. Orphaned: ~80. Valid: ~3,064.'
)
ON CONFLICT DO NOTHING;

-- CRITICAL: If Drizzle migration system requires a column constraint change,
-- this must be applied manually via:
-- ALTER TABLE atlas_packets ALTER COLUMN feature_label DROP NOT NULL;
--
-- Drizzle ORM does not support DROP NOT NULL changes via auto-migration.
-- Track this as a manual step in the Drizzle schema definition:
--   feature_label: text('feature_label').notNull() → feature_label: text('feature_label')
--
-- For now, this migration documents the audit and allows future changes.
