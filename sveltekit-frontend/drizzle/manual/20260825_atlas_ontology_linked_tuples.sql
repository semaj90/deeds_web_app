-- KAG-01/02 persistence (openspec/changes/parent-atlas-ace-rlm-bitfrost-integration).
-- Durable Postgres store for OntologyLinkedTupleV1
-- (sveltekit-frontend/src/lib/server/atlas/contracts/ontology-linked-tuple-v1.ts).
--
-- Real live producer confirmed before writing this migration:
-- taxonomy-topology-packet.ts::buildTaxonomyTopologyPacket() (called from a
-- registered MCP tool in src/mcp/trace-mcp-server.ts) already constructs real
-- OntologyLinkedTupleV1 rows and currently writes them ONLY to Redis/Valkey
-- (ontology-linked-tuple-cache.ts, 6h TTL) -- violating this repo's own
-- "Postgres is truth, write there first" rule. This table is the missing
-- truth layer; the Redis cache stays as a fast-path mirror, unchanged.
--
-- NOT a duplicate of the existing `ontology_edges` table (252,102 rows) --
-- checked first: every row in that table has edge_type='similar_to' and a
-- flat confidence=0.8, i.e. it is a bulk similarity graph, not genuine
-- POS/tag/ontology-labeled tuples with grounded evidence spans and
-- provenance. Different capability despite the confusing shared name.
-- `ontology_edges` also has zero writers anywhere in the current working
-- tree (same class of finding as atlas_ast_nodes earlier this session) --
-- flagged here for the record, not touched.

CREATE TABLE IF NOT EXISTS atlas_ontology_linked_tuples (
  tuple_id            text PRIMARY KEY,
  schema_version      text NOT NULL DEFAULT 'ontology-linked-tuple.v1',
  packet_key          text REFERENCES atlas_packets(packet_key) ON DELETE CASCADE,
  source_ref          text NOT NULL,
  tree_node_id        text,
  document_id         text,
  title_id            text,
  surface_text        text NOT NULL,
  token_index         integer,
  part_of_speech      text,
  label                text NOT NULL,
  label_kind          text NOT NULL,
  label_source        text NOT NULL,
  ontology_ids        text[] NOT NULL DEFAULT '{}',
  concept_ids         text[] NOT NULL DEFAULT '{}',
  participants        jsonb NOT NULL DEFAULT '[]',
  evidence_refs        text[] NOT NULL DEFAULT '{}',
  relation_revision    text,
  evidence_span        jsonb,
  confidence           real NOT NULL,
  evidence_state       text NOT NULL,
  lifecycle            text NOT NULL DEFAULT 'OBSERVED',
  provenance           jsonb NOT NULL,
  producer_revision    text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT atlas_ontology_linked_tuples_confidence_check CHECK (confidence >= 0 AND confidence <= 1),
  CONSTRAINT atlas_ontology_linked_tuples_label_kind_check CHECK (label_kind IN ('pos', 'tag', 'ontology')),
  CONSTRAINT atlas_ontology_linked_tuples_lifecycle_check CHECK (lifecycle IN ('OBSERVED', 'DERIVED', 'SUPERSEDED'))
);

CREATE INDEX IF NOT EXISTS idx_atlas_ontology_linked_tuples_packet_key
  ON atlas_ontology_linked_tuples (packet_key);
CREATE INDEX IF NOT EXISTS idx_atlas_ontology_linked_tuples_source_ref
  ON atlas_ontology_linked_tuples (source_ref);
CREATE INDEX IF NOT EXISTS idx_atlas_ontology_linked_tuples_label_kind
  ON atlas_ontology_linked_tuples (label_kind);
CREATE INDEX IF NOT EXISTS idx_atlas_ontology_linked_tuples_lifecycle
  ON atlas_ontology_linked_tuples (lifecycle);
CREATE INDEX IF NOT EXISTS idx_atlas_ontology_linked_tuples_ontology_ids_gin
  ON atlas_ontology_linked_tuples USING gin (ontology_ids);
CREATE INDEX IF NOT EXISTS idx_atlas_ontology_linked_tuples_concept_ids_gin
  ON atlas_ontology_linked_tuples USING gin (concept_ids);
