-- PACKET_WRITE_TRANSACTION_CONTRACT_01 durable outbox + receipt tables.
--
-- atlas_projection_outbox: closes a gap flagged in hyperrag-packet-pipeline.ts's
-- own comment ("Deferred: requires atlas_projection_outbox table (ATLAS-BUILD-002)")
-- -- that table was referenced but never actually created. Holds
-- ProjectionChangeV1 events (schema already exists:
-- src/lib/server/atlas/contracts/projection-change-v1.ts) so downstream
-- Qdrant/Neo4j/Valkey/cuVS projectors can consume committed changes
-- asynchronously, strictly after the canonical Postgres transaction commits
-- -- never inside it.
--
-- atlas_packet_write_receipts: one durable, checksummed row per
-- decidePacketWrite() outcome (scaffolded this session,
-- src/lib/server/atlas/identity/packet-write-decision-v1.ts), including
-- conflict/rejection outcomes, not only successful mutations. PostgreSQL
-- owns this; it is a receipt ledger, not a second source of packet
-- identity -- never join on it to determine current packet state.

CREATE TABLE IF NOT EXISTS atlas_projection_outbox (
  event_id uuid PRIMARY KEY,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  workspace_revision text NOT NULL,
  source_revision text NOT NULL,
  graph_revision text NOT NULL,
  representation_revision text NOT NULL,
  feature_revision text NOT NULL,
  stage_receipt_checksum text NOT NULL CHECK (stage_receipt_checksum ~ '^[a-f0-9]{64}$'),
  changed_packet_keys text[] NOT NULL,
  candidate_ordinals integer[] NOT NULL DEFAULT '{}',
  projections text[] NOT NULL,
  event_checksum text NOT NULL CHECK (event_checksum ~ '^[a-f0-9]{64}$'),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_atlas_projection_outbox_unconsumed
  ON atlas_projection_outbox (created_at)
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_atlas_projection_outbox_aggregate
  ON atlas_projection_outbox (aggregate_type, aggregate_id);

CREATE TABLE IF NOT EXISTS atlas_packet_write_receipts (
  receipt_id uuid PRIMARY KEY,
  packet_key text NOT NULL,
  decision text NOT NULL CHECK (decision IN (
    'INSERT_NEW', 'IDEMPOTENT_REPLAY', 'ADVANCE_SOURCE_REVISION',
    'SOURCE_REVISION_CONFLICT', 'WORKSPACE_REVISION_CONFLICT',
    'CONTENT_CONFLICT', 'IDENTITY_CONFLICT', 'REVISION_UNPROVEN'
  )),
  reason text NOT NULL,
  current_source_revision text,
  requested_source_revision text,
  mutation_applied boolean NOT NULL,
  outbox_event_id uuid REFERENCES atlas_projection_outbox (event_id),
  receipt_checksum text NOT NULL CHECK (receipt_checksum ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_atlas_packet_write_receipts_packet_key
  ON atlas_packet_write_receipts (packet_key, created_at DESC);
