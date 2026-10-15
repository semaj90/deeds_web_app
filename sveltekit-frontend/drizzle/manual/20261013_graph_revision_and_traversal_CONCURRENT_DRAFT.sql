-- DRAFT — NOT APPLIED. Requires operator approval and a rehearsal receipt before any execution.
--
-- Purpose: additive, low-lock replacement for the two graph migrations
--   drizzle/manual/20260822_graph_snapshot_revision_owner_v1.sql
--   drizzle/20260819_atlas_graph_traversal_indexes.sql
-- Nothing here drops, renames, or rewrites data. No row data is written.
--
-- Transaction boundaries (read before running):
--   Section A runs inside one transaction. It is metadata-only ADD COLUMN plus constraints
--     added NOT VALID, so the transaction holds only short locks.
--   Section B: VALIDATE CONSTRAINT takes SHARE UPDATE EXCLUSIVE. It permits normal reads and DML,
--     but can conflict with maintenance/schema operations and may scan the table; run and monitor
--     each validation separately outside a transaction block.
--   Section C: CREATE INDEX CONCURRENTLY cannot run inside a transaction block. Run each statement
--     on its own. It does not lock out concurrent INSERT/UPDATE/DELETE, but performs two scans,
--     waits for relevant transactions, adds I/O/CPU load, and may leave an INVALID index on failure.
--
-- Lock facts (checked against PostgreSQL semantics, not measured here):
--   ADD COLUMN without default/NOT NULL on PG18: metadata-only, brief ACCESS EXCLUSIVE.
--   ADD CONSTRAINT ... CHECK without NOT VALID: full-table scan under ACCESS EXCLUSIVE (blocks reads).
--   CREATE INDEX (no CONCURRENTLY): SHARE lock (blocks writes, not reads).
--   CREATE INDEX CONCURRENTLY: SHARE UPDATE EXCLUSIVE; can leave an INVALID index on failure.
--
-- Pre-flight (read-only, run through an approved read path before executing anything here):
--   1. Row counts on atlas_graph_nodes_v2 and atlas_graph_edges_v2 (review figures are unverified).
--   2. SELECT indexrelid::regclass, indisready, indisvalid, pg_get_indexdef(indexrelid)
--        FROM pg_index WHERE indrelid IN
--        ('atlas_graph_nodes_v2'::regclass, 'atlas_graph_edges_v2'::regclass,
--         'atlas_graph_relation_participants_v2'::regclass);
--      Review invalid indexes and same-name indexes with definitions that differ from this draft;
--      IF NOT EXISTS checks the name, not semantic equivalence.
--   3. Refresh the read-only schema check for atlas_graph_snapshots_v2 revision columns and inspect
--      the exact current snapshot rows before any operator approval.

-- ===========================================================================
-- Section A — additive revision columns (one transaction, short locks only)
-- ===========================================================================
BEGIN;

ALTER TABLE atlas_graph_snapshots_v2
  ADD COLUMN IF NOT EXISTS workspace_revision text,
  ADD COLUMN IF NOT EXISTS source_inventory_revision text,
  ADD COLUMN IF NOT EXISTS graph_revision text,
  ADD COLUMN IF NOT EXISTS identity_contract_version text,
  ADD COLUMN IF NOT EXISTS parser_contract_version text,
  ADD COLUMN IF NOT EXISTS revision_checksum text;

ALTER TABLE atlas_graph_nodes_v2
  ADD COLUMN IF NOT EXISTS source_revision text;

-- NOT VALID: checks new rows immediately, validates existing rows in Section B.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'atlas_graph_snapshots_v2'::regclass AND conname = 'atlas_graph_snapshots_v2_workspace_revision_sha256_v2') THEN
    ALTER TABLE atlas_graph_snapshots_v2
      ADD CONSTRAINT atlas_graph_snapshots_v2_workspace_revision_sha256_v2
      CHECK (workspace_revision IS NULL OR workspace_revision ~ '^sha256:[a-f0-9]{64}$') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'atlas_graph_snapshots_v2'::regclass AND conname = 'atlas_graph_snapshots_v2_source_inventory_revision_sha256_v2') THEN
    ALTER TABLE atlas_graph_snapshots_v2
      ADD CONSTRAINT atlas_graph_snapshots_v2_source_inventory_revision_sha256_v2
      CHECK (source_inventory_revision IS NULL OR source_inventory_revision ~ '^sha256:[a-f0-9]{64}$') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'atlas_graph_snapshots_v2'::regclass AND conname = 'atlas_graph_snapshots_v2_graph_revision_sha256') THEN
    ALTER TABLE atlas_graph_snapshots_v2
      ADD CONSTRAINT atlas_graph_snapshots_v2_graph_revision_sha256
      CHECK (graph_revision IS NULL OR graph_revision ~ '^[a-f0-9]{64}$') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'atlas_graph_snapshots_v2'::regclass AND conname = 'atlas_graph_snapshots_v2_revision_checksum_sha256') THEN
    ALTER TABLE atlas_graph_snapshots_v2
      ADD CONSTRAINT atlas_graph_snapshots_v2_revision_checksum_sha256
      CHECK (revision_checksum IS NULL OR revision_checksum ~ '^[a-f0-9]{64}$') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'atlas_graph_nodes_v2'::regclass AND conname = 'atlas_graph_nodes_v2_source_revision_nonempty') THEN
    ALTER TABLE atlas_graph_nodes_v2
      ADD CONSTRAINT atlas_graph_nodes_v2_source_revision_nonempty
      CHECK (source_revision IS NULL OR length(btrim(source_revision)) > 0) NOT VALID;
  END IF;
END $$;

COMMIT;

-- ===========================================================================
-- Section B — validate existing rows (outside a transaction; no read/write block)
-- ===========================================================================
ALTER TABLE atlas_graph_snapshots_v2 VALIDATE CONSTRAINT atlas_graph_snapshots_v2_workspace_revision_sha256_v2;
ALTER TABLE atlas_graph_snapshots_v2 VALIDATE CONSTRAINT atlas_graph_snapshots_v2_source_inventory_revision_sha256_v2;
ALTER TABLE atlas_graph_snapshots_v2 VALIDATE CONSTRAINT atlas_graph_snapshots_v2_graph_revision_sha256;
ALTER TABLE atlas_graph_snapshots_v2 VALIDATE CONSTRAINT atlas_graph_snapshots_v2_revision_checksum_sha256;
ALTER TABLE atlas_graph_nodes_v2 VALIDATE CONSTRAINT atlas_graph_nodes_v2_source_revision_nonempty;

-- ===========================================================================
-- Section C — concurrent indexes (one statement each, outside any transaction)
-- If a statement fails it can leave an INVALID index: check pg_index.indisvalid before retrying.
-- ===========================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS atlas_graph_edges_v2_forward_typed_idx
  ON atlas_graph_edges_v2 (snapshot_id, source_node_key, edge_type, target_node_key);

CREATE INDEX CONCURRENTLY IF NOT EXISTS atlas_graph_edges_v2_reverse_typed_idx
  ON atlas_graph_edges_v2 (snapshot_id, target_node_key, edge_type, source_node_key);

CREATE INDEX CONCURRENTLY IF NOT EXISTS atlas_graph_nodes_v2_snapshot_type_node_idx
  ON atlas_graph_nodes_v2 (snapshot_id, node_type, node_key);

CREATE INDEX CONCURRENTLY IF NOT EXISTS atlas_graph_nodes_v2_snapshot_source_ref_idx
  ON atlas_graph_nodes_v2 (snapshot_id, source_ref)
  WHERE source_ref IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS atlas_graph_relation_participants_v2_node_role_idx
  ON atlas_graph_relation_participants_v2 (snapshot_id, node_key, role, relation_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS atlas_graph_snapshots_v2_workspace_revision_idx
  ON atlas_graph_snapshots_v2 (workspace_revision, created_at DESC)
  WHERE workspace_revision IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS atlas_graph_snapshots_v2_graph_revision_idx
  ON atlas_graph_snapshots_v2 (graph_revision, created_at DESC)
  WHERE graph_revision IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS atlas_graph_snapshots_v2_source_inventory_revision_idx
  ON atlas_graph_snapshots_v2 (source_inventory_revision, created_at DESC)
  WHERE source_inventory_revision IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS atlas_graph_nodes_v2_source_revision_idx
  ON atlas_graph_nodes_v2 (snapshot_id, source_revision)
  WHERE source_revision IS NOT NULL;

-- ===========================================================================
-- Section D — comments (metadata only; no lock beyond a brief catalog update)
-- ===========================================================================
COMMENT ON COLUMN atlas_graph_snapshots_v2.workspace_revision IS
  'Snapshot-scoped repository/workspace revision authority. Written by the accepted graph snapshot writer; not inferred from downstream projections.';
COMMENT ON COLUMN atlas_graph_snapshots_v2.source_inventory_revision IS
  'Snapshot-scoped source inventory revision (revision-qualified source inventory snapshot identity).';
COMMENT ON COLUMN atlas_graph_snapshots_v2.graph_revision IS
  'Deterministic logical graph revision; distinct from snapshot_id occurrence identity.';
COMMENT ON COLUMN atlas_graph_snapshots_v2.revision_checksum IS
  'Checksum of GraphSnapshotRevisionV1 including snapshot occurrence identity; used for readback/tamper verification.';
COMMENT ON COLUMN atlas_graph_nodes_v2.source_revision IS
  'Optional authoritative per-source revision. NULL means source revision authority is not proven; canonical FANOUT must fail closed.';

-- Rollback (owner decision only; drops data written after this runs):
--   DROP INDEX CONCURRENTLY IF EXISTS <each index above>;
--   ALTER TABLE atlas_graph_nodes_v2 DROP COLUMN IF EXISTS source_revision;
--   ALTER TABLE atlas_graph_snapshots_v2 DROP COLUMN IF EXISTS workspace_revision, ...;
