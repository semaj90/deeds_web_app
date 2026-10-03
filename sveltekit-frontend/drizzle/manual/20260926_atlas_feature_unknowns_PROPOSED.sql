-- SUPERSEDED (2026-09-26): withdrawn in favour of 20260926_unknown_resolution_v2_PROPOSED.sql, which converges on the existing
-- unknown_packets / unknown_resolution_ledger owners instead of adding a competing table. Never applied; kept as history, not deleted.
-- PROPOSED — NOT APPLIED. Requires operator review per the Drizzle Safety Rule (drizzle/manual/*.sql is hand-applied, not journaled).
--
-- atlas_feature_unknowns: one row per (candidate snapshot, packet, feature, unknown kind) recording that a
-- feature value is ABSENT for a candidate that is otherwise exactly identified.
--
-- Deliberately NOT unknown_packets / unknown_resolution_ledger: those model an unpromoted packet IDENTITY lifecycle
-- (OBSERVATION -> PROMOTED). This table models a missing FEATURE VALUE for a known candidate. Layered, not competing.
--
-- Rules encoded here:
--   * Postgres stays truth; this table is a derived worklist (rebuildable from sealed artifacts), never identity.
--   * unknown_key is a deterministic UUIDv5 of the natural key — an idempotent-upsert surrogate, NOT identity.
--   * Everything filtered or joined on is a typed column; jsonb holds evidence only.
--   * No value is ever stored here: null is not zero, and a guessed value is not evidence.
--
-- Rollback: DROP TABLE IF EXISTS public.atlas_feature_unknowns;  (safe: derived worklist, no FKs in or out)

CREATE TABLE IF NOT EXISTS public.atlas_feature_unknowns (
  unknown_key                uuid        PRIMARY KEY,
  candidate_snapshot_revision text       NOT NULL,
  ordinal_map_checksum       text        NOT NULL,
  candidate_ordinal          integer     NOT NULL CHECK (candidate_ordinal >= 0),
  packet_key                 text        NOT NULL,
  source_ref                 text        NOT NULL,
  feature_name               text        NOT NULL,
  unknown_kind               text        NOT NULL DEFAULT 'MISSING_FEATURE_VALUE'
                              CHECK (unknown_kind IN ('MISSING_FEATURE_VALUE')),
  reason_code                text        NOT NULL
                              CHECK (reason_code IN ('NO_PROVEN_CHUNK_LINEAGE', 'CHUNK_WITHOUT_QUALIFIED_SUMMARY')),
  resolver_kind              text        NOT NULL DEFAULT 'UNASSIGNED'
                              CHECK (resolver_kind IN ('LINEAGE_REPAIR', 'SUMMARY_GENERATION', 'WIKI_OR_WEB_LOOKUP', 'HUMAN_LABEL', 'UNASSIGNED')),
  status                     text        NOT NULL DEFAULT 'OPEN'
                              CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'BLOCKED', 'WONT_RESOLVE')),
  producer_revision          text        NOT NULL,
  evidence                   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  resolved_at                timestamptz,
  CONSTRAINT atlas_feature_unknowns_natural_key
    UNIQUE (candidate_snapshot_revision, packet_key, feature_name, unknown_kind),
  CONSTRAINT atlas_feature_unknowns_resolved_consistency
    CHECK ((status = 'RESOLVED') = (resolved_at IS NOT NULL))
);

-- Worklist: only OPEN rows, grouped by what would resolve them.
CREATE INDEX IF NOT EXISTS idx_atlas_feature_unknowns_open
  ON public.atlas_feature_unknowns (feature_name, reason_code, resolver_kind)
  WHERE status = 'OPEN';

-- Snapshot-scoped lookup by execution coordinate (never conflate ordinal with a matrix row index).
CREATE INDEX IF NOT EXISTS idx_atlas_feature_unknowns_snapshot_ordinal
  ON public.atlas_feature_unknowns (candidate_snapshot_revision, candidate_ordinal);

-- Intentionally NO GIN index on evidence: nothing queries inside it yet. Add one only when a real query needs it.

COMMENT ON TABLE public.atlas_feature_unknowns IS
  'Derived worklist of missing feature values for exactly-identified candidates. Not identity, not truth, not a value store. Rebuildable from sealed artifacts.';
