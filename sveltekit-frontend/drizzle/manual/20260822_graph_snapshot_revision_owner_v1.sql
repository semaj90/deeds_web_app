-- Parent Atlas graph snapshot revision-owner tranche.
--
-- Additive only. Existing graph snapshot/node/edge identity remains unchanged.
-- Snapshot-level workspace/graph revision identity is stored once on
-- atlas_graph_snapshots_v2 and inherited by nodes/edges through snapshot_id.
-- Per-node source_revision is nullable and MUST NOT be fabricated during
-- migration/backfill when no authoritative source revision owner is available.

ALTER TABLE atlas_graph_snapshots_v2
  ADD COLUMN IF NOT EXISTS workspace_revision text,
  ADD COLUMN IF NOT EXISTS source_inventory_revision text,
  ADD COLUMN IF NOT EXISTS graph_revision text,
  ADD COLUMN IF NOT EXISTS identity_contract_version text,
  ADD COLUMN IF NOT EXISTS parser_contract_version text,
  ADD COLUMN IF NOT EXISTS revision_checksum text;

ALTER TABLE atlas_graph_nodes_v2
  ADD COLUMN IF NOT EXISTS source_revision text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'atlas_graph_snapshots_v2_workspace_revision_sha256_v2'
  ) THEN
    ALTER TABLE atlas_graph_snapshots_v2
      ADD CONSTRAINT atlas_graph_snapshots_v2_workspace_revision_sha256_v2
      CHECK (workspace_revision IS NULL OR workspace_revision ~ '^sha256:[a-f0-9]{64}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'atlas_graph_snapshots_v2_source_inventory_revision_sha256_v2'
  ) THEN
    ALTER TABLE atlas_graph_snapshots_v2
      ADD CONSTRAINT atlas_graph_snapshots_v2_source_inventory_revision_sha256_v2
      CHECK (source_inventory_revision IS NULL OR source_inventory_revision ~ '^sha256:[a-f0-9]{64}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'atlas_graph_snapshots_v2_graph_revision_sha256'
  ) THEN
    ALTER TABLE atlas_graph_snapshots_v2
      ADD CONSTRAINT atlas_graph_snapshots_v2_graph_revision_sha256
      CHECK (graph_revision IS NULL OR graph_revision ~ '^[a-f0-9]{64}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'atlas_graph_snapshots_v2_revision_checksum_sha256'
  ) THEN
    ALTER TABLE atlas_graph_snapshots_v2
      ADD CONSTRAINT atlas_graph_snapshots_v2_revision_checksum_sha256
      CHECK (revision_checksum IS NULL OR revision_checksum ~ '^[a-f0-9]{64}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'atlas_graph_nodes_v2_source_revision_nonempty'
  ) THEN
    ALTER TABLE atlas_graph_nodes_v2
      ADD CONSTRAINT atlas_graph_nodes_v2_source_revision_nonempty
      CHECK (source_revision IS NULL OR length(btrim(source_revision)) > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS atlas_graph_snapshots_v2_workspace_revision_idx
  ON atlas_graph_snapshots_v2 (workspace_revision, created_at DESC)
  WHERE workspace_revision IS NOT NULL;

CREATE INDEX IF NOT EXISTS atlas_graph_snapshots_v2_graph_revision_idx
  ON atlas_graph_snapshots_v2 (graph_revision, created_at DESC)
  WHERE graph_revision IS NOT NULL;

CREATE INDEX IF NOT EXISTS atlas_graph_snapshots_v2_source_inventory_revision_idx
  ON atlas_graph_snapshots_v2 (source_inventory_revision, created_at DESC)
  WHERE source_inventory_revision IS NOT NULL;

CREATE INDEX IF NOT EXISTS atlas_graph_nodes_v2_source_revision_idx
  ON atlas_graph_nodes_v2 (snapshot_id, source_revision)
  WHERE source_revision IS NOT NULL;

COMMENT ON COLUMN atlas_graph_snapshots_v2.workspace_revision IS
  'Snapshot-scoped repository/workspace revision authority. Written by the accepted graph snapshot writer; not inferred from downstream projections.';

COMMENT ON COLUMN atlas_graph_snapshots_v2.source_inventory_revision IS
  'Snapshot-scoped source inventory revision (currently the revision-qualified source inventory snapshot identity).';

COMMENT ON COLUMN atlas_graph_snapshots_v2.graph_revision IS
  'Deterministic logical graph revision derived from workspace/source-inventory/contracts/source hash/topology hash/policy hash; distinct from snapshot_id occurrence identity.';

COMMENT ON COLUMN atlas_graph_snapshots_v2.revision_checksum IS
  'Checksum of GraphSnapshotRevisionV1 including snapshot occurrence identity; used for readback/tamper verification.';

COMMENT ON COLUMN atlas_graph_nodes_v2.source_revision IS
  'Optional authoritative per-source revision. NULL means source revision authority is not proven for this node and canonical FANOUT must fail closed.';
