-- OUTBOX-IDENTITY-CONTRACT-01: add a real text aggregate_key column instead
-- of overloading the UUID-typed aggregate_id column to mean "packet
-- identity, hashed into UUID shape". Per operator review: "If packet_id is
-- not suitable as stable aggregate identity, add/use a text aggregate_key
-- rather than misusing the UUID." atlas_packets has no UUID identity column
-- at all (packet_id/packet_key are both text), so aggregate_id remains
-- what it honestly is for this single-packet-per-event scaffold: redundant
-- with event_id (option A in the operator's three-way classification).
-- aggregate_key now carries the real, unambiguous canonical identity
-- (packet_key) as plain text, queryable/indexable directly.

ALTER TABLE atlas_projection_outbox ADD COLUMN IF NOT EXISTS aggregate_key text;

CREATE INDEX IF NOT EXISTS idx_atlas_projection_outbox_aggregate_key
  ON atlas_projection_outbox (aggregate_key);
