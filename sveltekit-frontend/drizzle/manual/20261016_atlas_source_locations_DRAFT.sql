-- DRAFT — NOT APPLIED. For review only.
-- Purpose: canonical SOURCE-LOCATION table for production hardening of source_ref identity
-- (openspec/changes/parent-atlas-graphify-recovery-proof-ladder, SRCREF-UNIQUE-01 / SRCREF-NS-01).
--
-- Why a new table and not UNIQUE (source_ref) on atlas_packets:
--   * A source file may legitimately yield several packets (function, AST node, chunk, card), so
--     source_ref is a LOCATION; packet_key (already UNIQUE) stays the packet identity.
--   * Live probe 2026-10-16 (PostgreSQL 18.4): 0 duplicate source_ref, 0 duplicate lower(source_ref),
--     but 263 duplicate canonical_source_ref groups, so canonical_source_ref can never be a key.
--
-- Contract:
--   * source_ref is the normalized repository-root-relative POSIX path, CASE-PRESERVING. No case
--     folding is applied here; whether case-only differences are one source is an owner decision
--     per namespace and is NOT encoded in this DDL.
--   * Uniqueness is (source_namespace, source_ref). Namespaces are lowercase slugs, not an enum, so
--     new namespaces (repo, frontend, rpc, cluster, ...) need no DDL change.
--   * The file-path safety rule (no leading slash, backslash, "..", "./", "//", scheme-like prefix)
--     applies ONLY to namespace 'repo'. Non-path identifiers (proto:*, cluster:*) use other namespaces.
--   * source_revision is sha256:<64 lowercase hex> of the exact source bytes, or NULL until verified.
--     A revision conflict is never overwritten: it is recorded in atlas_source_location_conflicts.
--   * Surrogate ids use uuidv7() (time-ordered, PostgreSQL 18) and never replace packet_key/source_ref.
--
-- Deliberately NOT included: any change to atlas_packets (a source_location_id link needs a short
-- ACCESS EXCLUSIVE lock on a live table; do it in a separate reviewed sidecar with NOT VALID + VALIDATE).
-- All statements are additive and idempotent. No data is written.

BEGIN;

CREATE TABLE IF NOT EXISTS public.atlas_source_locations (
  source_location_id uuid PRIMARY KEY DEFAULT uuidv7(),
  source_namespace text NOT NULL,
  source_ref text NOT NULL,
  source_revision text,
  normalizer_revision text NOT NULL,
  producer_id text NOT NULL,
  producer_revision text,
  first_seen_run_id text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT atlas_source_locations_ns_ref_key UNIQUE (source_namespace, source_ref),
  CONSTRAINT atlas_source_locations_ns_shape CHECK (source_namespace ~ '^[a-z][a-z0-9_-]{0,31}$'),
  CONSTRAINT atlas_source_locations_ref_nonblank CHECK (btrim(source_ref) <> '' AND source_ref = btrim(source_ref)),
  CONSTRAINT atlas_source_locations_revision_shape CHECK (source_revision IS NULL OR source_revision ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT atlas_source_locations_repo_path_safe CHECK (
    source_namespace <> 'repo' OR (
      source_ref NOT LIKE '/%'
      AND position(chr(92) in source_ref) = 0
      AND source_ref !~ '(^|/)[.][.](/|$)'
      AND source_ref NOT LIKE './%'
      AND source_ref NOT LIKE '%//%'
      AND source_ref !~ '^[A-Za-z][A-Za-z0-9+.-]*:'
    )
  )
);

COMMENT ON TABLE public.atlas_source_locations IS
  'Canonical source LOCATIONS (namespace + case-preserving normalized path). Identity of a location only; packet identity stays atlas_packets.packet_key. canonicalAuthority:false for any projection derived from it.';

-- Append-only record of revision conflicts. A conflict is never resolved by overwriting the location row.
CREATE TABLE IF NOT EXISTS public.atlas_source_location_conflicts (
  conflict_id uuid PRIMARY KEY DEFAULT uuidv7(),
  source_namespace text NOT NULL,
  source_ref text NOT NULL,
  existing_source_revision text,
  observed_source_revision text,
  producer_id text NOT NULL,
  producer_revision text,
  run_id text,
  observed_at timestamptz NOT NULL DEFAULT now(),
  resolution text NOT NULL DEFAULT 'OPEN',
  CONSTRAINT atlas_source_location_conflicts_resolution_chk
    CHECK (resolution IN ('OPEN', 'ACCEPTED_NEW_REVISION', 'REJECTED')),
  CONSTRAINT atlas_source_location_conflicts_revisions_chk
    CHECK (existing_source_revision IS DISTINCT FROM observed_source_revision)
);

CREATE INDEX IF NOT EXISTS atlas_source_location_conflicts_ref_idx
  ON public.atlas_source_location_conflicts (source_namespace, source_ref, observed_at DESC);

COMMENT ON TABLE public.atlas_source_location_conflicts IS
  'Revision conflicts observed by the idempotent source-location reconcile; rows are appended, never used to overwrite atlas_source_locations.';

COMMIT;
