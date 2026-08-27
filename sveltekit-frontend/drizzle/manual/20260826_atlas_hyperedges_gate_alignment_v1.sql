-- Gate alignment: atlas_hyperedges had two application-layer (Zod) invariants
-- with no matching Postgres CHECK, unlike its sibling atlas_ontology_linked_tuples
-- (which already has atlas_ontology_linked_tuples_lifecycle_check). A raw SQL
-- insert, or any future second producer that bypasses HyperedgeV1Schema, could
-- write a malformed checksum or an out-of-enum lifecycle straight into the
-- canonical table with nothing at the DB layer to catch it.
--
-- Additive only. Table had 0 rows at authoring time (verified), so no backfill
-- or NOT VALID/VALIDATE staging is required.

BEGIN;

-- Mirrors HyperedgeV1Schema's `checksum: z.string().regex(/^[0-9a-f]{64}$/)`.
-- Nullable is intentional: checksum is only populated for contract-shaped rows
-- (contract_hyperedge_id IS NOT NULL); pre-contract rows leave it NULL.
DO $$ BEGIN
  ALTER TABLE atlas_hyperedges ADD CONSTRAINT atlas_hyperedges_checksum_format_check
    CHECK (checksum IS NULL OR checksum ~ '^[0-9a-f]{64}$');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Mirrors OntologyLinkedTupleLifecycleSchema / the same enum already enforced
-- on atlas_ontology_linked_tuples.lifecycle.
DO $$ BEGIN
  ALTER TABLE atlas_hyperedges ADD CONSTRAINT atlas_hyperedges_lifecycle_check
    CHECK (lifecycle IN ('OBSERVED', 'DERIVED', 'SUPERSEDED'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
