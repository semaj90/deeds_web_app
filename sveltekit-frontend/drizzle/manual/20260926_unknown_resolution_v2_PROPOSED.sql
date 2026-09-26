-- WITHDRAWN (2026-09-26): do NOT apply. Generalizing unknown_packets into a universal unknown store was rejected: that table is a packet-identity
-- promotion lifecycle (OBSERVATION -> PROMOTED); a known candidate missing a feature is not eligible for it, and nullable subject columns would not
-- remove those semantics. Replaced by the UnknownResolutionV1 logical contract + adapters (sveltekit-frontend/src/lib/server/atlas/contracts/
-- unknown-resolution-v1.ts); feature gaps stay a checksummed artifact. Kept as history, not deleted.
-- PROPOSED — NOT APPLIED. Requires operator review per the Drizzle Safety Rule (drizzle/manual/*.sql is hand-applied, not journaled).
-- SUPERSEDES 20260926_atlas_feature_unknowns_PROPOSED.sql (v1, a competing sibling table — withdrawn).
--
-- UNKNOWN-RESOLUTION v2: converge missing-evidence tracking onto the EXISTING owners instead of adding a second unknown table.
--   unknown_packets            -> generalized with a subject (UnknownResolutionV1 shape); existing packet-identity rows are unchanged
--   unknown_resolution_ledger  -> stage vocabulary extended (superset) so gap resolution history lands in the same ledger
--
-- Layering preserved:
--   * A row with subject_kind = 'PACKET_IDENTITY' is exactly today's unpromoted-packet lifecycle (OBSERVATION..PROMOTED).
--   * A row with subject_kind = 'CANDIDATE_FEATURE' (later CONCEPT / DOCUMENT_SOURCE) is a typed missing-evidence requirement
--     for an already-identified subject. It never carries a value, and never enters the promotion pipeline.
--   * unknown_id for gap rows is a deterministic UUIDv5 of the natural key — an idempotent-upsert surrogate, NOT identity.
--   * Postgres stays truth; gap rows are a derived, rebuildable worklist. Null is not zero; a guessed value is not evidence.
--
-- REQUIRED FOLLOW-UP (not in this SQL): src/lib/server/unknown/{observation-ingester,candidate-scorer,evidence-validator,promotion-executor}.ts
-- must select only subject_kind = 'PACKET_IDENTITY' so gap rows can never be scored or promoted as packets. Also update the Drizzle
-- `unknownPackets` definition in src/lib/server/db/schema-postgres.ts. Audit at proposal time: table has 0 rows; the only ON CONFLICT in that
-- code targets atlas_packets(packet_key), not this table.
--
-- Rollback (table has no gap rows until backfilled; run in this order):
--   DROP INDEX IF EXISTS idx_unknown_gap_natural_key; DROP INDEX IF EXISTS idx_unknown_gap_open;
--   DROP INDEX IF EXISTS idx_unknown_identity_unique;
--   CREATE UNIQUE INDEX idx_unknown_identity_unique ON public.unknown_packets (workspace_id, potential_source_ref);
--   ALTER TABLE public.unknown_packets DROP CONSTRAINT IF EXISTS unknown_packets_gap_typed_check, DROP CONSTRAINT IF EXISTS unknown_packets_subject_kind_check,
--     DROP COLUMN IF EXISTS resolution_revision, DROP COLUMN IF EXISTS resolver_kind, DROP COLUMN IF EXISTS required_evidence_kind, DROP COLUMN IF EXISTS reason_code,
--     DROP COLUMN IF EXISTS feature_name, DROP COLUMN IF EXISTS unknown_kind, DROP COLUMN IF EXISTS snapshot_revision, DROP COLUMN IF EXISTS subject_id, DROP COLUMN IF EXISTS subject_kind;
--   (and restore ledger_stage_valid to the five original stages)

BEGIN;

ALTER TABLE public.unknown_packets
  ADD COLUMN IF NOT EXISTS subject_kind          text NOT NULL DEFAULT 'PACKET_IDENTITY',
  ADD COLUMN IF NOT EXISTS subject_id            text,
  ADD COLUMN IF NOT EXISTS snapshot_revision     text,
  ADD COLUMN IF NOT EXISTS unknown_kind          text,
  ADD COLUMN IF NOT EXISTS feature_name          text,
  ADD COLUMN IF NOT EXISTS reason_code           text,
  ADD COLUMN IF NOT EXISTS required_evidence_kind text,
  ADD COLUMN IF NOT EXISTS resolver_kind         text,
  ADD COLUMN IF NOT EXISTS resolution_revision   text;

ALTER TABLE public.unknown_packets DROP CONSTRAINT IF EXISTS unknown_packets_subject_kind_check;
ALTER TABLE public.unknown_packets ADD CONSTRAINT unknown_packets_subject_kind_check
  CHECK (subject_kind IN ('PACKET_IDENTITY', 'CANDIDATE_FEATURE', 'CONCEPT', 'DOCUMENT_SOURCE'));

-- Gap rows must be fully typed; packet-identity rows stay exactly as before.
ALTER TABLE public.unknown_packets DROP CONSTRAINT IF EXISTS unknown_packets_gap_typed_check;
ALTER TABLE public.unknown_packets ADD CONSTRAINT unknown_packets_gap_typed_check
  CHECK (
    subject_kind = 'PACKET_IDENTITY'
    OR (subject_id IS NOT NULL AND snapshot_revision IS NOT NULL AND unknown_kind IS NOT NULL
        AND reason_code IS NOT NULL AND required_evidence_kind IS NOT NULL AND resolver_kind IS NOT NULL
        AND status IN ('OPEN', 'RESOLVING', 'RESOLVED', 'BLOCKED', 'SUPERSEDED'))
  );

-- The old unique (workspace_id, potential_source_ref) is correct ONLY for packet identities: a source_ref can legitimately
-- carry many gaps (one per feature per snapshot). Scope it to packet-identity rows; the table currently holds 0 rows.
DROP INDEX IF EXISTS public.idx_unknown_identity_unique;
CREATE UNIQUE INDEX idx_unknown_identity_unique
  ON public.unknown_packets (workspace_id, potential_source_ref)
  WHERE subject_kind = 'PACKET_IDENTITY';

CREATE UNIQUE INDEX IF NOT EXISTS idx_unknown_gap_natural_key
  ON public.unknown_packets (workspace_id, snapshot_revision, subject_kind, subject_id, feature_name, unknown_kind)
  WHERE subject_kind <> 'PACKET_IDENTITY';

-- Worklist: OPEN gaps grouped by what would resolve them.
CREATE INDEX IF NOT EXISTS idx_unknown_gap_open
  ON public.unknown_packets (feature_name, reason_code, resolver_kind)
  WHERE subject_kind <> 'PACKET_IDENTITY' AND status = 'OPEN';

-- Ledger: superset of stages so gap-resolution history shares one ledger (existing stages unchanged).
ALTER TABLE public.unknown_resolution_ledger DROP CONSTRAINT IF EXISTS ledger_stage_valid;
ALTER TABLE public.unknown_resolution_ledger ADD CONSTRAINT ledger_stage_valid
  CHECK (stage::text = ANY (ARRAY[
    'OBSERVATION', 'CANDIDATE', 'VALIDATED', 'PROMOTED', 'REJECTED',
    'OPEN', 'RESOLVING', 'RESOLVED', 'BLOCKED', 'SUPERSEDED'
  ]::text[]));

COMMENT ON COLUMN public.unknown_packets.subject_kind IS
  'PACKET_IDENTITY = unpromoted packet lifecycle (legacy behaviour). CANDIDATE_FEATURE/CONCEPT/DOCUMENT_SOURCE = typed missing-evidence requirement for an identified subject; carries no value.';

COMMIT;
