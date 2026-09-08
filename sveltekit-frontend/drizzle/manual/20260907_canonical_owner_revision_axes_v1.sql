-- Canonical owner revision-axis fields (additive, unapplied sidecar migration).
-- Repository/compiler lineage and exact source-content lineage are distinct
-- axes; existing rows remain untouched until reviewed backfill/readback.

ALTER TABLE atlas_packets
  ADD COLUMN IF NOT EXISTS source_revision TEXT;

ALTER TABLE atlas_ontology_concepts
  ADD COLUMN IF NOT EXISTS definition_revision TEXT;

COMMENT ON COLUMN atlas_packets.source_revision IS
  'Exact source-content revision when proven; distinct from repository/compiler revisions.';

COMMENT ON COLUMN atlas_ontology_concepts.definition_revision IS
  'Revision of the canonical concept definition; observations do not populate this field.';

CREATE INDEX IF NOT EXISTS idx_atlas_packets_source_revision
  ON atlas_packets (source_revision)
  WHERE source_revision IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_atlas_ontology_concepts_definition_revision
  ON atlas_ontology_concepts (definition_revision)
  WHERE definition_revision IS NOT NULL;
