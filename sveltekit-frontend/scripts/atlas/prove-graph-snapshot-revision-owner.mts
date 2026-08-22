import pg from 'pg';
import {
  verifyGraphSnapshotRevisionV1,
} from '../../src/lib/server/atlas/graph/graph-snapshot-revision-v1.js';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
  max: 2,
});

const requestedSnapshot = process.argv.find((arg) => arg.startsWith('--snapshot='))?.slice('--snapshot='.length) ?? null;
const sampleLimit = Math.max(1, Math.min(100, Number(process.argv.find((arg) => arg.startsWith('--sample='))?.slice('--sample='.length) ?? 20)));

const REQUIRED_SNAPSHOT_COLUMNS = [
  'workspace_revision',
  'source_inventory_revision',
  'graph_revision',
  'identity_contract_version',
  'parser_contract_version',
  'revision_checksum',
];

async function main() {
  const client = await pool.connect();
  let receipt: Record<string, unknown>;
  try {
    await client.query('BEGIN READ ONLY');

    const columnRows = await client.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND (
            (table_name = 'atlas_graph_snapshots_v2' AND column_name = ANY($1::text[]))
            OR (table_name = 'atlas_graph_nodes_v2' AND column_name = 'source_revision')
          )`,
      [REQUIRED_SNAPSHOT_COLUMNS],
    );
    const snapshotColumns = new Set(
      columnRows.rows.filter((row) => row.table_name === 'atlas_graph_snapshots_v2').map((row) => row.column_name),
    );
    const nodeSourceRevisionColumn = columnRows.rows.some(
      (row) => row.table_name === 'atlas_graph_nodes_v2' && row.column_name === 'source_revision',
    );
    const missingSnapshotColumns = REQUIRED_SNAPSHOT_COLUMNS.filter((column) => !snapshotColumns.has(column));

    if (missingSnapshotColumns.length > 0 || !nodeSourceRevisionColumn) {
      receipt = {
        schema: 'atlas.graph-snapshot-revision-owner-proof.v1',
        readOnly: true,
        canonicalWriteAttempted: false,
        migrationReady: false,
        missingSnapshotColumns,
        nodeSourceRevisionColumn,
        status: 'GRAPH_SNAPSHOT_REVISION_MIGRATION_REQUIRED',
      };
      console.log(JSON.stringify(receipt, null, 2));
      process.exitCode = 1;
      return;
    }

    const snapshotResult = requestedSnapshot
      ? await client.query(
          `SELECT snapshot_id, source_manifest, source_hash, topology_hash, policy_hash,
                  workspace_revision, source_inventory_revision, graph_revision,
                  identity_contract_version, parser_contract_version, revision_checksum
             FROM atlas_graph_snapshots_v2
            WHERE snapshot_id = $1
              AND status = 'VALIDATED'`,
          [requestedSnapshot],
        )
      : await client.query(
          `SELECT snapshot_id, source_manifest, source_hash, topology_hash, policy_hash,
                  workspace_revision, source_inventory_revision, graph_revision,
                  identity_contract_version, parser_contract_version, revision_checksum
             FROM atlas_graph_snapshots_v2
            WHERE status = 'VALIDATED'
            ORDER BY created_at DESC
            LIMIT 1`,
        );

    if (snapshotResult.rowCount !== 1) {
      receipt = {
        schema: 'atlas.graph-snapshot-revision-owner-proof.v1',
        readOnly: true,
        canonicalWriteAttempted: false,
        migrationReady: true,
        requestedSnapshot,
        status: 'NO_VALIDATED_GRAPH_SNAPSHOT',
      };
      console.log(JSON.stringify(receipt, null, 2));
      process.exitCode = 1;
      return;
    }

    const row = snapshotResult.rows[0] as any;
    const manifest = row.source_manifest ?? {};
    const candidate = {
      schema: 'atlas.graph-snapshot-revision.v1',
      snapshotId: row.snapshot_id,
      workspaceRevision: row.workspace_revision,
      sourceInventoryRevision: row.source_inventory_revision,
      graphRevision: row.graph_revision,
      identityContractVersion: row.identity_contract_version,
      parserContractVersion: row.parser_contract_version,
      sourceInventoryHash: row.source_hash,
      topologyHash: row.topology_hash,
      policyHash: row.policy_hash,
      producerRevision: String(manifest.revisionProducer ?? manifest.materializer ?? 'unknown'),
      revisionChecksum: row.revision_checksum,
    };

    let revisionVerified = false;
    let revisionError: string | null = null;
    try {
      verifyGraphSnapshotRevisionV1(candidate);
      revisionVerified = true;
    } catch (error) {
      revisionError = error instanceof Error ? error.message : String(error);
    }

    const nodeResult = await client.query<{
      node_key: string;
      packet_key: string | null;
      tree_node_id: string | null;
      source_ref: string | null;
      source_revision: string | null;
    }>(
      `SELECT node_key, packet_key, tree_node_id, source_ref, source_revision
         FROM atlas_graph_nodes_v2
        WHERE snapshot_id = $1
          AND source_ref IS NOT NULL
        ORDER BY node_key
        LIMIT $2`,
      [row.snapshot_id, sampleLimit],
    );

    const sourceRevisionProvenRows = nodeResult.rows.filter(
      (node) => typeof node.source_revision === 'string' && node.source_revision.trim().length > 0,
    ).length;
    const sourceRevisionMissingRows = nodeResult.rows.length - sourceRevisionProvenRows;
    const snapshotRevisionFieldsPresent = [
      row.workspace_revision,
      row.source_inventory_revision,
      row.graph_revision,
      row.identity_contract_version,
      row.parser_contract_version,
      row.revision_checksum,
    ].every((value) => typeof value === 'string' && value.trim().length > 0);

    const snapshotRevisionProven = snapshotRevisionFieldsPresent && revisionVerified;
    const nodeSourceRevisionProven = nodeResult.rows.length > 0 && sourceRevisionMissingRows === 0;
    const status = !snapshotRevisionProven
      ? 'GRAPH_SNAPSHOT_REVISION_OWNER_NOT_PROVEN'
      : nodeSourceRevisionProven
        ? 'GRAPH_FANOUT_REVISION_OWNER_PROVEN'
        : 'GRAPH_SNAPSHOT_REVISION_OWNER_PROVEN_SOURCE_REVISION_BLOCKED';

    receipt = {
      schema: 'atlas.graph-snapshot-revision-owner-proof.v1',
      readOnly: true,
      canonicalWriteAttempted: false,
      migrationReady: true,
      snapshotId: row.snapshot_id,
      snapshotRevisionProven,
      revisionVerified,
      revisionError,
      workspaceRevision: row.workspace_revision,
      sourceInventoryRevision: row.source_inventory_revision,
      graphRevision: row.graph_revision,
      topologyHash: row.topology_hash,
      policyHash: row.policy_hash,
      revisionChecksum: row.revision_checksum,
      sampledNodeCount: nodeResult.rows.length,
      sourceRevisionProvenRows,
      sourceRevisionMissingRows,
      nodeSourceRevisionProven,
      fanoutAllowed: snapshotRevisionProven && nodeSourceRevisionProven,
      status,
    };

    console.log(JSON.stringify(receipt, null, 2));
    if (status !== 'GRAPH_FANOUT_REVISION_OWNER_PROVEN') process.exitCode = 1;
  } finally {
    try {
      await client.query('ROLLBACK');
    } finally {
      client.release();
      await pool.end();
    }
  }
}

main().catch(async (error) => {
  console.error(error);
  try { await pool.end(); } catch {}
  process.exitCode = 1;
});
