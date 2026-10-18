#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import type { Pool } from 'pg';
import { collectBatchANativeCohortV1, selectBatchASourcesV1, type BatchAIndexedNodeV1, type BatchAIndexedEdgeV1 } from './lib/batch-a-native-source-v1.mjs';
import { checksumBatchASnapshotV1, validateBatchASnapshotV1 } from './lib/batch-a-validation-v1.mjs';

type TreeNode = BatchAIndexedNodeV1;
type TreeEdge = BatchAIndexedEdgeV1;

const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');

function log(message: string) {
  console.log(`[Batch A] ${message}`);
}

async function writeNodesToDatabase(pool: Pool, nodes: TreeNode[]) {
  const batchSize = 500;
  let written = 0;

  for (let i = 0; i < nodes.length; i += batchSize) {
    const batch = nodes.slice(i, i + batchSize);

    const query = `
      INSERT INTO atlas_tree_nodes (
        node_id, root_id, parent_id, packet_key, feature_id, feature_label,
        source_ref, file_path, node_type, tree_depth, metadata, lineage_version, ledger_type
      ) VALUES ${batch
        .map(
          (_, idx) =>
            `($${idx * 13 + 1}, $${idx * 13 + 2}, $${idx * 13 + 3}, $${idx * 13 + 4}, $${idx * 13 + 5}, ` +
            `$${idx * 13 + 6}, $${idx * 13 + 7}, $${idx * 13 + 8}, $${idx * 13 + 9}, ` +
            `$${idx * 13 + 10}, $${idx * 13 + 11}, $${idx * 13 + 12}, $${idx * 13 + 13})`
        )
        .join(', ')}
      ON CONFLICT (node_id) DO NOTHING;
    `;

    const values = batch.flatMap(node => [
      node.node_id,
      node.root_id,
      node.parent_id,
      node.packet_key,
      node.feature_id,
      node.feature_label,
      node.source_ref,
      node.file_path,
      node.node_type,
      node.tree_depth,
      JSON.stringify(node.metadata),
      node.lineage_version,
      node.ledger_type,
    ]);

    if (!DRY_RUN) {
      await pool.query(query, values);
      written += batch.length;
    }
  }

  return written;
}

async function writeEdgesToDatabase(pool: Pool, edges: TreeEdge[]) {
  const batchSize = 2000;
  let written = 0;

  for (let i = 0; i < edges.length; i += batchSize) {
    const batch = edges.slice(i, i + batchSize);

    const query = `
      INSERT INTO atlas_tree_edges (
        parent_tree_node_id, child_tree_node_id, edge_kind, workspace_revision
      ) VALUES ${batch
        .map((_, idx) => `($${idx * 4 + 1}, $${idx * 4 + 2}, $${idx * 4 + 3}, $${idx * 4 + 4})`)
        .join(', ')}
      ON CONFLICT DO NOTHING;
    `;

    const values = batch.flatMap(edge => [
      edge.parent_tree_node_id,
      edge.child_tree_node_id,
      edge.edge_kind,
      edge.workspace_revision,
    ]);

    if (!DRY_RUN) {
      await pool.query(query, values);
      written += batch.length;
    }
  }

  return written;
}

async function main() {
  const startTime = Date.now();
  let databasePool: Pool | undefined;
  try {
    const args = process.argv.slice(2);
    if (args.some(arg => !['--dry-run', '--apply', '--verbose'].includes(arg) && !arg.startsWith('--file=') && !arg.startsWith('--limit='))) {
      throw new Error('BATCH_A_UNKNOWN_ARGUMENT');
    }
    const limit = Number(args.find(arg => arg.startsWith('--limit='))?.slice('--limit='.length) ?? 20);
    const explicit = args.filter(arg => arg.startsWith('--file=')).map(arg => arg.slice('--file='.length));
    const workspaceRoot = path.resolve(process.cwd(), '..');
    const sources = await selectBatchASourcesV1(workspaceRoot, limit, explicit);
    const first = await collectBatchANativeCohortV1(workspaceRoot, sources);
    const replay = await collectBatchANativeCohortV1(workspaceRoot, sources);
    const gates = validateBatchASnapshotV1(first.snapshot, replay.snapshot);
    const allPass = gates.every(gate => gate.pass);
    const applyAdmitted = allPass && first.nodes.length > 0 && first.nodes.every(node => node.metadata.canonicalAuthority === true);
    let exitCode = allPass ? 0 : 1;

    if (APPLY && !DRY_RUN && !applyAdmitted) {
      log('Database writes skipped: CANONICAL_WRITER_ADMISSION_REQUIRED');
      exitCode = 2;
    } else if (APPLY && !DRY_RUN && applyAdmitted) {
      databasePool = (await import('$lib/server/db/client.js')).pool;
      await writeNodesToDatabase(databasePool, first.nodes);
      await writeEdgesToDatabase(databasePool, first.edges);
    } else {
      log(`Database writes skipped: ${allPass ? 'INDEX_ONLY_NO_APPLY' : 'VALIDATION_NOT_PASSED'}`);
    }

    const runId = crypto.randomUUID();
    const output = path.join(process.cwd(), 'reports', 'batch-a');
    fs.mkdirSync(output, { recursive: true });
    const firstPath = path.join(output, `batch-a-snapshot-${runId}-first.json`);
    const replayPath = path.join(output, `batch-a-snapshot-${runId}-replay.json`);
    const reportPath = path.join(output, `batch-a-structural-audit-${runId}.json`);
    fs.writeFileSync(firstPath, JSON.stringify(first.snapshot), { flag: 'wx' });
    fs.writeFileSync(replayPath, JSON.stringify(replay.snapshot), { flag: 'wx' });
    const report = {
      schema: 'atlas.batch-a.native-index-audit.v1',
      mode: DRY_RUN ? 'DRY_RUN' : 'INDEX_ONLY',
      canonicalAuthority: false,
      writesPerformed: databasePool !== undefined,
      databaseInitialized: databasePool !== undefined,
      sourceRevisionDeferred: true,
      selectionScope: explicit.length ? 'EXPLICIT_FILES' : 'TRACKED_SUPPORTED_SOURCE',
      selectionLimit: limit,
      nodeScope: 'NATIVE_NAMED_OR_RANGED_SYNTAX_NODES',
      exit_code: exitCode,
      total_files: sources.length,
      total_nodes_extracted: first.nodes.length,
      total_edges_extracted: first.edges.length,
      counts: first.counts,
      replayCounts: replay.counts,
      outcomes: first.outcomes,
      replayOutcomes: replay.outcomes,
      gates,
      snapshotPath: firstPath,
      replaySnapshotPath: replayPath,
      snapshotChecksum: checksumBatchASnapshotV1(first.snapshot),
      replaySnapshotChecksum: checksumBatchASnapshotV1(replay.snapshot),
      timestamp: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
    };
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), { flag: 'wx' });
    console.log(JSON.stringify(report, null, 2));
    log(`Audit report written to: ${reportPath}`);
    process.exitCode = exitCode;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  } finally {
    await databasePool?.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  void main();
}
