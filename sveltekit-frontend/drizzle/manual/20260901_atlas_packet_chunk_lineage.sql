-- PACKET-CHUNK-LINEAGE-CONTRACT-01 / MIGRATION-01
-- Normalized 1:N packet<->chunk membership relation. atlas_packets stays
-- FILE-granularity; this table records proven membership of individual
-- codebase_chunk_index chunks under a file packet. Never an array column
-- on atlas_packets -- Postgres constrains and joins individual memberships.
--
-- Hard invariant (enforced structurally + by the writer contract in
-- src/lib/server/atlas/lineage/packet-chunk-membership-v1.ts, not just this
-- migration): canonical_chunk_id MUST originate from an existing
-- codebase_chunk_index.chunk_id value read at write time. Never randomUUID(),
-- a hash of source_ref, tree_node_id, a Qdrant point id, or nearest-match
-- inference -- see canonical-id-hierarchy.ts / backfill-unified-id-hierarchy.mjs
-- for the exact anti-pattern this exists to prevent repeating.

CREATE TABLE IF NOT EXISTS atlas_packet_chunk_lineage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_key text NOT NULL,
  canonical_chunk_id text NOT NULL,
  chunk_row_id uuid NOT NULL,
  source_ref text NOT NULL,
  source_namespace text NOT NULL,
  source_revision text,
  membership_status text NOT NULL,
  revision_status text NOT NULL,
  chunk_ordinal integer NOT NULL,
  lineage_producer_revision text NOT NULL,
  evidence_refs text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT atlas_pcl_membership_status_check
    CHECK (membership_status IN ('EXACT_SINGLE_MEMBER', 'EXACT_MULTI_MEMBER')),
  CONSTRAINT atlas_pcl_revision_status_check
    CHECK (revision_status IN ('PROVEN', 'UNPROVEN')),
  -- Mirrors PacketChunkMembershipV1Schema's .refine(): revisionStatus PROVEN
  -- iff source_revision is present. Never a synthesized revision.
  CONSTRAINT atlas_pcl_revision_consistency_check
    CHECK (
      (revision_status = 'PROVEN' AND source_revision IS NOT NULL) OR
      (revision_status = 'UNPROVEN' AND source_revision IS NULL)
    ),
  -- Uniqueness is on (packet_key, canonical_chunk_id) ONLY -- lineage_producer_revision
  -- and evidence_refs are PROVENANCE on the one canonical membership row, not
  -- part of membership identity. Deliberately corrected from an earlier draft
  -- that included lineage_producer_revision in the key: that would have let a
  -- second producer re-observing the exact same (packet, chunk) relationship
  -- insert a SECOND canonical row for it, inflating downstream vote/cardinality
  -- counts (e.g. "how many chunks does this packet have" would double-count a
  -- re-observed member). A producer re-observing an existing membership must
  -- UPSERT (ON CONFLICT (packet_key, canonical_chunk_id) DO UPDATE SET
  -- lineage_producer_revision = ..., evidence_refs = ..., ...) against the
  -- existing row, never insert a new one. If append-only observation HISTORY
  -- is ever needed, that belongs in a separate execution-evidence table, not
  -- conflated with this canonical membership relation.
  --
  -- source_revision is also excluded from the key -- per
  -- PACKET-CHUNK-LINEAGE-BACKFILL-SCOPE-01, it is absent (UNPROVEN) for the
  -- dominant historical case (60,882/61,660 rows), and a nullable column
  -- cannot usefully participate in a uniqueness constraint anyway (NULL never
  -- equals NULL in Postgres).
  --
  -- source_namespace is plain text, NOT FK'd to atlas_packets.repository_id:
  -- that column is confirmed corrupted (58,365/58,365 populated values are
  -- all distinct -- a synthetic randomUUID()-per-row, the same pattern found
  -- in backfill-unified-id-hierarchy.mjs). The only real namespace authority
  -- found so far is graphify_files.workspace_id.
  CONSTRAINT atlas_pcl_membership_unique
    UNIQUE (packet_key, canonical_chunk_id)
);

CREATE INDEX IF NOT EXISTS idx_atlas_pcl_packet_key ON atlas_packet_chunk_lineage (packet_key);
CREATE INDEX IF NOT EXISTS idx_atlas_pcl_canonical_chunk_id ON atlas_packet_chunk_lineage (canonical_chunk_id);
CREATE INDEX IF NOT EXISTS idx_atlas_pcl_source_ref ON atlas_packet_chunk_lineage (source_ref);
CREATE INDEX IF NOT EXISTS idx_atlas_pcl_revision_status ON atlas_packet_chunk_lineage (revision_status);
