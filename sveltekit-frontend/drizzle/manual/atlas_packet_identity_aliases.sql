-- PACKET_IDENTITY_ALIAS_AND_WRITER_CONVERGENCE (P0-3)
--
-- Read-compatibility layer for packet_key format divergence found during the
-- P0 canonical identity audit. Never mutates atlas_packets primary keys or any
-- of the 12 dependent tables' foreign keys. Purely additive.
--
-- Known alias source: register-orphaned-chunks.mjs previously emitted
-- 'ace:packet:<12hex>' instead of the dominant 'packet:<12hex>' scheme (same
-- sha256(source_ref) hash, wrong prefix only). 3,294 rows affected as of the
-- 2026-08-11 audit. The writer is fixed going forward; historical rows are
-- resolved via this table, not PK-mutated.
CREATE TABLE IF NOT EXISTS atlas_packet_identity_aliases (
  alias_key TEXT PRIMARY KEY,
  canonical_packet_key TEXT NOT NULL REFERENCES atlas_packets(packet_key) ON DELETE RESTRICT,
  alias_kind TEXT NOT NULL,
  producer_id TEXT,
  producer_revision TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_atlas_packet_identity_aliases_canonical
  ON atlas_packet_identity_aliases (canonical_packet_key);
