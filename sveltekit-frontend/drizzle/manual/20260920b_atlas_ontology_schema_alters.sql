-- Additive, idempotent, data-free schema changes chosen by SCHEMA_TOURNAMENT_V1 (2026-09-20). DRAFT: NOT APPLIED.
-- No new tables, no row changes, no constraint changes. Every statement is IF NOT EXISTS. Rehearse in BEGIN ... ROLLBACK first.
-- Deliberately NOT here: widening atlas_ontology_linked_tuples.label_kind CHECK (which LangExtract classes to admit is a design
-- decision), atlas_ast_nodes.ast_generation (separate migration 20260920_atlas_ast_nodes_generation.sql), any UPDATE/INSERT.

-- 1. Symbol-registry resolver keys. audit-postgres-index-capability-v1 found atlas_symbol_versions has NO index on
--    source_revision or qualified_name — the keys of the StructuralMatch -> registry EXACT match. (479 rows: cheap.)
CREATE INDEX IF NOT EXISTS idx_asv_source_revision ON atlas_symbol_versions (source_revision);
CREATE INDEX IF NOT EXISTS idx_asv_qualified_name  ON atlas_symbol_versions (qualified_name);

-- 2. Revision-qualified topology projection (KMeans/SOM). som_revision is NULL on all 58,365 SOM-assigned packets and cannot be
--    derived from the July artifacts; this empty table (0 rows) is the projection built for it. Nullable: a revision must be
--    supplied by a real versioned run, never invented.
ALTER TABLE registry_topology_projection ADD COLUMN IF NOT EXISTS som_revision text;
ALTER TABLE registry_topology_projection ADD COLUMN IF NOT EXISTS kmeans_revision text;
ALTER TABLE registry_topology_projection ADD COLUMN IF NOT EXISTS representation_revision text;
ALTER TABLE registry_topology_projection ADD COLUMN IF NOT EXISTS candidate_snapshot_revision text;

-- 3. Revision lineage for token-level grounded evidence. evidence_span/provenance are unconstrained jsonb; revision lineage must be
--    queryable, not buried in JSON. Nullable + partial index; the writer-side GroundedExtractionV1 contract enforces presence.
ALTER TABLE atlas_ontology_linked_tuples ADD COLUMN IF NOT EXISTS source_revision text;
ALTER TABLE atlas_ontology_linked_tuples ADD COLUMN IF NOT EXISTS workspace_revision text;
CREATE INDEX IF NOT EXISTS idx_aolt_source_revision ON atlas_ontology_linked_tuples (source_ref, source_revision) WHERE source_revision IS NOT NULL;
