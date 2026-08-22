import pg from 'pg';
import { randomUUID } from 'node:crypto';
import {
  buildGraphSnapshotRevisionV1,
  verifyGraphSnapshotRevisionV1,
} from '../../src/lib/server/atlas/graph/graph-snapshot-revision-v1.js';

if (process.env.NODE_ENV === 'production') {
  console.error(JSON.stringify({
    schema: 'atlas.graph-snapshot-revision-writer-canary.v1',
    status: 'REFUSED_PRODUCTION',
    durableWriteAttempted: false,
  }, null, 2));
  process.exit(2);
}

const apply = process.env.ATLAS_GRAPH_REVISION_CANARY === '1';
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
  max: 1,
});

const REQUIRED_COLUMNS = [
  'workspace_revision',
  'source_inventory_revision',
  'graph_revision',
  'identity_contract_version',
  'parser_contract_version',
  'revision_checksum',
];

async function main() {
  const client = await pool.connect();
  try {
    const columns = await client.query<{ column_name: string }>(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'atlas_graph_snapshots_v2'
          AND column_name = ANY($1::text[])`,
      [REQUIRED_COLUMNS],
    );
    const found = new Set(columns.rows.map((row) => row.column_name));
    const missing = REQUIRED_COLUMNS.filter((column) => !found.has(column));
    if (missing.length > 0) {
      console.log(JSON.stringify({
        schema: 'atlas.graph-snapshot-revision-writer-canary.v1',
        migrationReady: false,
        missingColumns: missing,
        durableWriteAttempted: false,
        status: 'GRAPH_SNAPSHOT_REVISION_MIGRATION_REQUIRED',
      }, null, 2));
      process.exitCode = 1;
      return;
    }

    if (!apply) {
      console.log(JSON.stringify({
        schema: 'atlas.graph-snapshot-revision-writer-canary.v1',
        migrationReady: true,
        durableWriteAttempted: false,
        status: 'READY_CANARY_DISABLED',
        enableWith: 'ATLAS_GRAPH_REVISION_CANARY=1',
      }, null, 2));
      return;
    }

    const snapshotId = randomUUID();
    const revision = buildGraphSnapshotRevisionV1({
      snapshotId,
      workspaceRevision: 'canary:workspace:revision',
      sourceInventoryRevision: 'canary:source-inventory:revision',
      identityContractVersion: 'identity-contract-v1',
      parserContractVersion: 'tree-sitter-typescript-v1',
      sourceInventoryHash: '1'.repeat(64),
      topologyHash: '2'.repeat(64),
      policyHash: '3'.repeat(64),
      producerRevision: 'graph-snapshot-revision-writer-canary-v1',
    });

    await client.query('BEGIN');
    await client.query(
      `INSERT INTO atlas_graph_snapshots_v2 (
        snapshot_id, schema_version, status, source_manifest, projection_policy,
        node_count, edge_count, relation_event_count, excluded_count, unresolved_count,
        source_hash, topology_hash, policy_hash, eligibility_predicate,
        workspace_revision, source_inventory_revision, graph_revision,
        identity_contract_version, parser_contract_version, revision_checksum
      ) VALUES (
        $1,$2,'BUILDING',$3::jsonb,$4::jsonb,
        0,0,0,0,0,
        $5,$6,$7,$8,
        $9,$10,$11,$12,$13,$14
      )`,
      [
        revision.snapshotId,
        revision.identityContractVersion,
        JSON.stringify({
          workspaceRevision: revision.workspaceRevision,
          sourceInventoryRevision: revision.sourceInventoryRevision,
          identityContractVersion: revision.identityContractVersion,
          parserContractVersion: revision.parserContractVersion,
          sourceInventoryHash: revision.sourceInventoryHash,
          revisionProducer: revision.producerRevision,
        }),
        JSON.stringify({ canary: true }),
        revision.sourceInventoryHash,
        revision.topologyHash,
        revision.policyHash,
        JSON.stringify({ canary: true, default: 'reject' }),
        revision.workspaceRevision,
        revision.sourceInventoryRevision,
        revision.graphRevision,
        revision.identityContractVersion,
        revision.parserContractVersion,
        revision.revisionChecksum,
      ],
    );

    const readback = await client.query(
      `SELECT snapshot_id, source_hash, topology_hash, policy_hash,
              workspace_revision, source_inventory_revision, graph_revision,
              identity_contract_version, parser_contract_version, revision_checksum,
              source_manifest
         FROM atlas_graph_snapshots_v2
        WHERE snapshot_id = $1`,
      [snapshotId],
    );
    if (readback.rowCount !== 1) throw new Error('GRAPH_SNAPSHOT_REVISION_CANARY_READBACK_MISSING');
    const row = readback.rows[0] as any;
    const parsed = verifyGraphSnapshotRevisionV1({
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
      producerRevision: row.source_manifest.revisionProducer,
      revisionChecksum: row.revision_checksum,
    });

    await client.query('ROLLBACK');
    console.log(JSON.stringify({
      schema: 'atlas.graph-snapshot-revision-writer-canary.v1',
      migrationReady: true,
      writeAttemptedInsideRollbackTransaction: true,
      durableWriteAttempted: false,
      snapshotId: parsed.snapshotId,
      graphRevision: parsed.graphRevision,
      revisionChecksum: parsed.revisionChecksum,
      readbackVerified: true,
      rolledBack: true,
      status: 'GRAPH_SNAPSHOT_REVISION_WRITE_READBACK_PROVEN_ROLLED_BACK',
    }, null, 2));
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
