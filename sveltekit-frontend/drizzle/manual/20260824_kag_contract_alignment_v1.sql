-- KAG contract alignment v1
-- Additive only. Extends the existing atlas_hyperedges and
-- atlas_ontology_tuples owners so they can persist the current typed
-- HyperedgeV1 and OntologyLinkedTupleV1 lineage without replacing rows.

BEGIN;

ALTER TABLE atlas_schema_registry
  DROP CONSTRAINT IF EXISTS atlas_schema_registry_schema_kind_check;

ALTER TABLE atlas_schema_registry
  ADD CONSTRAINT atlas_schema_registry_schema_kind_check
  CHECK (schema_kind = ANY (ARRAY[
    'packet', 'feature_envelope', 'graph_fact', 'embedding_contract',
    'qdrant_projection', 'workflow_state', 'source_ref_contract',
    'ast_node_contract', 'ontology_concept_contract',
    'hyperedge_contract', 'ontology_tuple_contract'
  ]));

INSERT INTO atlas_schema_registry (
  schema_id, schema_version, schema_kind, status, okf_source,
  json_schema, schema_hash, activated_at
)
VALUES
  (
    'atlas.hyperedge', 1, 'hyperedge_contract', 'ACTIVE',
    'schemas/atlas/hyperedge/atlas-hyperedge.v1.okf', '{}',
    md5('atlas-hyperedge-v1'), now()
  ),
  (
    'atlas.ontology-linked-tuple', 1, 'ontology_tuple_contract', 'ACTIVE',
    'schemas/atlas/ontology/ontology-linked-tuple.v1.okf', '{}',
    md5('atlas-ontology-linked-tuple-v1'), now()
  )
ON CONFLICT (schema_id, schema_version) DO NOTHING;

ALTER TABLE atlas_hyperedges
  ADD COLUMN IF NOT EXISTS contract_hyperedge_id text,
  ADD COLUMN IF NOT EXISTS packet_key text,
  ADD COLUMN IF NOT EXISTS workspace_revision text,
  ADD COLUMN IF NOT EXISTS source_revision text,
  ADD COLUMN IF NOT EXISTS graph_revision text,
  ADD COLUMN IF NOT EXISTS producer_revision text,
  ADD COLUMN IF NOT EXISTS evidence_refs text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS checksum text,
  ADD COLUMN IF NOT EXISTS lifecycle text NOT NULL DEFAULT 'OBSERVED',
  ADD COLUMN IF NOT EXISTS provenance jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS atlas_hyperedges_contract_id_uidx
  ON atlas_hyperedges (contract_hyperedge_id)
  WHERE contract_hyperedge_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS atlas_hyperedges_packet_revision_idx
  ON atlas_hyperedges (packet_key, source_revision);
CREATE INDEX IF NOT EXISTS atlas_hyperedges_provenance_gin_idx
  ON atlas_hyperedges USING gin (provenance jsonb_path_ops);

ALTER TABLE atlas_ontology_tuples
  ADD COLUMN IF NOT EXISTS tuple_id text,
  ADD COLUMN IF NOT EXISTS schema_id text NOT NULL DEFAULT 'atlas.ontology-linked-tuple',
  ADD COLUMN IF NOT EXISTS packet_key text,
  ADD COLUMN IF NOT EXISTS surface_text text,
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS label_kind text,
  ADD COLUMN IF NOT EXISTS label_source text,
  ADD COLUMN IF NOT EXISTS ontology_ids text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS concept_ids text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS participants jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS evidence_refs text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS evidence_state text NOT NULL DEFAULT 'ACTIVE_DEGRADED',
  ADD COLUMN IF NOT EXISTS lifecycle text NOT NULL DEFAULT 'OBSERVED',
  ADD COLUMN IF NOT EXISTS source_revision text,
  ADD COLUMN IF NOT EXISTS workspace_revision text,
  ADD COLUMN IF NOT EXISTS feature_revision text,
  ADD COLUMN IF NOT EXISTS graph_revision text,
  ADD COLUMN IF NOT EXISTS ontology_revision text,
  ADD COLUMN IF NOT EXISTS provenance jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS atlas_ontology_tuples_contract_id_uidx
  ON atlas_ontology_tuples (tuple_id)
  WHERE tuple_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS atlas_ontology_tuples_packet_revision_idx
  ON atlas_ontology_tuples (packet_key, source_revision);
CREATE INDEX IF NOT EXISTS atlas_ontology_tuples_concepts_gin_idx
  ON atlas_ontology_tuples USING gin (concept_ids);
CREATE INDEX IF NOT EXISTS atlas_ontology_tuples_ontology_ids_gin_idx
  ON atlas_ontology_tuples USING gin (ontology_ids);
CREATE INDEX IF NOT EXISTS atlas_ontology_tuples_provenance_gin_idx
  ON atlas_ontology_tuples USING gin (provenance jsonb_path_ops);

COMMIT;
