/**
 * PARENT_ATLAS_GRAPH_RETRIEVAL_PROOF — item 1: materialize the full-corpus
 * immutable graph snapshot (FULL_CORPUS_GRAPH_SNAPSHOT: NOT_RUN -> RUN).
 *
 * Reads all atlas_tree_nodes + atlas_packets from Postgres, calls the
 * already fixture-proven pure materializeGraphSnapshot(), persists the
 * result to atlas_graph_snapshots_v2 / atlas_graph_nodes_v2 /
 * atlas_graph_edges_v2 / atlas_graph_snapshot_exclusions_v2, and re-runs the
 * materializer a second time on the same input to prove topology hash
 * stability (--verify mode compares two independent runs, no DB writes).
 *
 * Usage:
 *   npx tsx scripts/atlas/materialize-full-corpus-graph-snapshot.mts --dry-run
 *   npx tsx scripts/atlas/materialize-full-corpus-graph-snapshot.mts --apply
 *   npx tsx scripts/atlas/materialize-full-corpus-graph-snapshot.mts --verify
 */
import pg from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { materializeGraphSnapshot } from '../../src/lib/server/atlas/graph/graph-snapshot-materializer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');
const REPORT_DIR = resolve(REPO_ROOT, '.tmp', 'graph-snapshot');

const args = process.argv.slice(2);
const mode = args.includes('--apply') ? 'apply' : args.includes('--verify') ? 'verify' : 'dry-run';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
  max: 4,
});

const TREE_NODE_REQUIRED_COLUMNS = [
  'node_id',
  'parent_id',
  'root_id',
  'page_index_path',
  'node_type',
  'tree_depth',
  'source_ref',
  'file_path',
  'packet_key',
  'feature_id',
  'title',
  'summary',
  'som_cluster',
  'community_id',
  'metadata',
  'ledger_type',
  'lineage_version'
];

const TREE_NODE_OPTIONAL_COLUMNS = ['content_preview', 'domain'];

const PACKET_REQUIRED_COLUMNS = [
  'packet_key',
  'source_ref',
  'directory_path',
  'feature_id',
  'feature_label',
  'topology',
  'vectors',
  'metadata',
  'tags',
  'tree_node_id'
];

const PACKET_OPTIONAL_COLUMNS = [
  'canonical_source_ref',
  'file_path',
  'function_symbol',
  'title_id',
  'community_id',
  'cluster_id',
  'sha256',
  'source_kind',
  'source_path',
  'domain_class',
  'lineage_version',
  'ledger_type',
  'canonical',
  'qdrant_collection',
  'qdrant_vector_dim'
];

function ensureReportDir() {
  mkdirSync(REPORT_DIR, { recursive: true });
}

function sha256(text) {
  return createHash('sha256').update(String(text)).digest('hex');
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map((item) => stableJson(item));
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        const normalized = stableJson(value[key]);
        if (normalized !== undefined) acc[key] = normalized;
        return acc;
      }, {});
  }
  return value;
}

function countByReason(exclusions) {
  return exclusions.reduce((acc, row) => {
    acc[row.exclusionReason] = (acc[row.exclusionReason] ?? 0) + 1;
    return acc;
  }, {});
}

function quoteIdentifier(identifier) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function buildProjectedSelect(tableName, requiredColumns, optionalColumns, existingColumns) {
  const selectList = [
    ...requiredColumns.map((column) => quoteIdentifier(column)),
    ...optionalColumns.map((column) => (
      existingColumns.has(column)
        ? quoteIdentifier(column)
        : `NULL AS ${quoteIdentifier(column)}`
    ))
  ];
  return `SELECT ${selectList.join(', ')} FROM ${quoteIdentifier(tableName)} ORDER BY ${quoteIdentifier(requiredColumns[0])}`;
}

async function getExistingColumns(tableName) {
  const { rows } = await pool.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
    `,
    [tableName]
  );
  return new Set(rows.map((row) => row.column_name));
}

function getWorkspaceRevision() {
  try {
    return execSync('git rev-parse HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return String(process.env.WORKSPACE_REVISION || process.env.REPOSITORY_REVISION || 'unknown').trim() || 'unknown';
  }
}

function getSourceQueryHash(workspaceRevision) {
  return sha256(
    JSON.stringify(stableJson({
      workspaceRevision,
      treeNodes: {
        table: 'atlas_tree_nodes',
        requiredColumns: TREE_NODE_REQUIRED_COLUMNS,
        optionalColumns: TREE_NODE_OPTIONAL_COLUMNS,
        orderBy: 'node_id'
      },
      packets: {
        table: 'atlas_packets',
        requiredColumns: PACKET_REQUIRED_COLUMNS,
        optionalColumns: PACKET_OPTIONAL_COLUMNS,
        orderBy: 'packet_key'
      },
      materializer: 'graph-snapshot-materializer-v1',
      mode: 'full-corpus',
      canonicalNodeTypes: ['document', 'page', 'section', 'subsection', 'chunk', 'repository', 'package', 'directory', 'file', 'symbol']
    }))
  );
}

async function loadTreeNodes() {
  const existingColumns = await getExistingColumns('atlas_tree_nodes');
  const select = buildProjectedSelect('atlas_tree_nodes', TREE_NODE_REQUIRED_COLUMNS, TREE_NODE_OPTIONAL_COLUMNS, existingColumns);
  const { rows } = await pool.query(select);
  return rows.map((r) => ({
    nodeId: r.node_id,
    parentId: r.parent_id,
    rootId: r.root_id ?? r.node_id,
    pageIndexPath: r.page_index_path ?? `node:${r.node_id}`,
    nodeType: r.node_type,
    treeDepth: r.tree_depth,
    sourceRef: r.source_ref ?? '',
    filePath: r.file_path ?? r.source_ref ?? '',
    packetKey: r.packet_key,
    featureId: r.feature_id,
    title: r.title,
    summary: r.summary,
    contentPreview: r.content_preview ?? r.summary ?? null,
    domain: r.domain ?? null,
    somCluster: r.som_cluster,
    communityId: r.community_id,
    metadata: r.metadata ?? {},
    ledgerType: r.ledger_type,
    lineageVersion: r.lineage_version,
  }));
}

async function loadPackets() {
  const existingColumns = await getExistingColumns('atlas_packets');
  const select = buildProjectedSelect('atlas_packets', PACKET_REQUIRED_COLUMNS, PACKET_OPTIONAL_COLUMNS, existingColumns);
  const { rows } = await pool.query(select);
  return rows.map((r) => ({
    packetKey: r.packet_key,
    sourceRef: r.source_ref ?? '',
    canonicalSourceRef: r.canonical_source_ref,
    directoryPath: r.directory_path ?? '',
    filePath: r.file_path,
    functionSymbol: r.function_symbol,
    featureId: r.feature_id ?? '',
    featureLabel: r.feature_label ?? '',
    titleId: r.title_id,
    communityId: r.community_id,
    clusterId: r.cluster_id,
    sha256: r.sha256,
    sourceKind: r.source_kind,
    sourcePath: r.source_path,
    topology: r.topology ?? {},
    vectors: r.vectors ?? {},
    metadata: r.metadata ?? {},
    domainClass: r.domain_class,
    tags: r.tags ?? [],
    lineageVersion: r.lineage_version,
    ledgerType: r.ledger_type,
    canonical: r.canonical,
    treeNodeId: r.tree_node_id,
    qdrantCollection: r.qdrant_collection,
    qdrantVectorDim: r.qdrant_vector_dim,
  }));
}

function buildReport({
  modeName,
  workspaceRevision,
  sourceQueryHash,
  input,
  result,
  verifyResult,
  persistedCounts,
}) {
  return {
    mode: modeName,
    snapshotId: result.graphSnapshot.snapshotId,
    workspaceRevision,
    sourceQueryHash,
    replayMatches: result.graphSnapshotProof.replayMatches,
    nodeCount: result.graphSnapshotManifest.nodeCount,
    relationshipCount: result.graphSnapshotManifest.edgeCount,
    excludedCount: result.graphSnapshot.excludedCount,
    exclusionsByReason: countByReason(result.graphSnapshotExclusions),
    topologyHash: result.graphSnapshotManifest.topologyHash,
    sourceInventoryHash: result.graphSnapshotProof.sourceInventoryHash,
    policyHash: result.graphSnapshotProof.policyHash,
    materializedAt: input.generatedAt,
    verifyTopologyHash: verifyResult?.graphSnapshotManifest?.topologyHash ?? null,
    verifyReplayMatches: verifyResult?.graphSnapshotProof?.replayMatches ?? null,
    persistedCounts: persistedCounts ?? null,
    manifest: result.graphSnapshotManifest,
    proof: result.graphSnapshotProof,
  };
}

async function writeReport(modeName, report) {
  ensureReportDir();
  const reportPath = resolve(REPORT_DIR, `full-corpus-graph-snapshot-${modeName}.json`);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return reportPath;
}

async function main() {
  const workspaceRevision = getWorkspaceRevision();
  const sourceQueryHash = getSourceQueryHash(workspaceRevision);
  const t0 = Date.now();
  const [treeNodes, packets] = await Promise.all([loadTreeNodes(), loadPackets()]);
  console.log(`Loaded ${treeNodes.length} tree nodes, ${packets.length} packets in ${Date.now() - t0}ms`);

  const buildInput = () => {
    const generatedAt = new Date().toISOString();
    const snapshotId = randomUUID();
    return {
      snapshotId,
      workspaceId: 'workspace:parent-atlas',
      sourceInventorySnapshotId: `inventory:${workspaceRevision}:${sourceQueryHash.slice(0, 16)}`,
      identityContractVersion: 'identity-contract-v1',
      parserContractVersion: 'tree-sitter-typescript-v1',
      generatedAt,
      treeNodes,
      packets,
    };
  };

  const input1 = buildInput();
  const run1 = materializeGraphSnapshot(input1);
  console.log('--- Run 1 manifest ---');
  console.log(JSON.stringify(run1.graphSnapshotManifest, null, 2));
  console.log('--- Run 1 proof ---');
  console.log(JSON.stringify(run1.graphSnapshotProof, null, 2));

  let run2 = null;
  if (mode === 'verify' || mode === 'apply') {
    const input2 = buildInput();
    run2 = materializeGraphSnapshot(input2);
    const stable = run1.graphSnapshotManifest.topologyHash === run2.graphSnapshotManifest.topologyHash;
    console.log(`\nHash stability across two independent materializations: ${stable ? 'PASS' : 'FAIL'}`);
    console.log(`  run1 snapshotId: ${run1.graphSnapshotManifest.snapshotId}`);
    console.log(`  run2 snapshotId: ${run2.graphSnapshotManifest.snapshotId}`);
    console.log(`  run1 topologyHash: ${run1.graphSnapshotManifest.topologyHash}`);
    console.log(`  run2 topologyHash: ${run2.graphSnapshotManifest.topologyHash}`);
    if (!stable) {
      console.error('ABORT: hash instability detected, not persisting.');
      process.exitCode = 1;
      await pool.end();
      return;
    }
  }

  let persistedCounts = null;
  if (mode === 'apply') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO atlas_graph_snapshots_v2
           (snapshot_id, schema_version, status, source_manifest, projection_policy,
            node_count, edge_count, relation_event_count, excluded_count, unresolved_count,
            source_hash, topology_hash, policy_hash, eligibility_predicate)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          run1.graphSnapshot.snapshotId,
          run1.graphSnapshot.schemaVersion,
          'VALIDATED',
          JSON.stringify(run1.graphSnapshot.sourceManifest),
          JSON.stringify(run1.graphSnapshot.projectionPolicy),
          run1.graphSnapshot.nodeCount,
          run1.graphSnapshot.edgeCount,
          run1.graphSnapshot.relationEventCount,
          run1.graphSnapshot.excludedCount,
          run1.graphSnapshot.unresolvedCount,
          run1.graphSnapshot.sourceHash,
          run1.graphSnapshot.topologyHash,
          run1.graphSnapshot.policyHash,
          run1.graphSnapshot.eligibilityPredicate,
        ],
      );

      const BATCH = 1000;
      for (let i = 0; i < run1.graphSnapshotNodes.length; i += BATCH) {
        const batch = run1.graphSnapshotNodes.slice(i, i + BATCH);
        const values: unknown[] = [];
        const placeholders = batch
          .map((n, idx) => {
            const o = idx * 8;
            const persistedTreeNodeId = n.nodeType === 'packet' ? null : n.treeNodeId;
            values.push(n.snapshotId, n.nodeKey, n.nodeType, n.packetKey, persistedTreeNodeId, n.sourceRef, n.contentHash, JSON.stringify(n.properties));
            return `($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6},$${o + 7},$${o + 8})`;
          })
          .join(',');
        await client.query(
          `INSERT INTO atlas_graph_nodes_v2 (snapshot_id, node_key, node_type, packet_key, tree_node_id, source_ref, content_hash, properties) VALUES ${placeholders}`,
          values,
        );
      }

      for (let i = 0; i < run1.graphSnapshotEdges.length; i += BATCH) {
        const batch = run1.graphSnapshotEdges.slice(i, i + BATCH);
        const values: unknown[] = [];
        const placeholders = batch
          .map((e, idx) => {
            const o = idx * 9;
            values.push(e.snapshotId, e.edgeKey, e.sourceNodeKey, e.targetNodeKey, e.edgeType, e.weight, e.confidence, e.provenance, JSON.stringify(e.properties));
            return `($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6},$${o + 7},$${o + 8},$${o + 9})`;
          })
          .join(',');
        await client.query(
          `INSERT INTO atlas_graph_edges_v2 (snapshot_id, edge_key, source_node_key, target_node_key, edge_type, weight, confidence, provenance, properties) VALUES ${placeholders}`,
          values,
        );
      }

      for (let i = 0; i < run1.graphSnapshotExclusions.length; i += BATCH) {
        const batch = run1.graphSnapshotExclusions.slice(i, i + BATCH);
        const values: unknown[] = [];
        const placeholders = batch
          .map((x, idx) => {
            const o = idx * 7;
            values.push(x.snapshotId, x.candidateKey, x.packetKey, x.sourceRef, x.exclusionStage, x.exclusionReason, JSON.stringify(x.evidence ?? {}));
            return `($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6},$${o + 7})`;
          })
          .join(',');
        await client.query(
          `INSERT INTO atlas_graph_snapshot_exclusions_v2 (snapshot_id, candidate_key, packet_key, source_ref, exclusion_stage, exclusion_reason, evidence) VALUES ${placeholders}`,
          values,
        );
      }

      await client.query('COMMIT');
      const counts = await client.query(
        `
          SELECT
            (SELECT COUNT(*)::int FROM atlas_graph_snapshots_v2 WHERE snapshot_id = $1) AS snapshot_rows,
            (SELECT COUNT(*)::int FROM atlas_graph_nodes_v2 WHERE snapshot_id = $1) AS node_rows,
            (SELECT COUNT(*)::int FROM atlas_graph_edges_v2 WHERE snapshot_id = $1) AS edge_rows,
            (SELECT COUNT(*)::int FROM atlas_graph_snapshot_exclusions_v2 WHERE snapshot_id = $1) AS exclusion_rows
        `,
        [run1.graphSnapshot.snapshotId],
      );
      persistedCounts = counts.rows[0];
      console.log(`\nPersisted snapshot ${run1.graphSnapshot.snapshotId}: ${persistedCounts.node_rows} nodes, ${persistedCounts.edge_rows} edges, ${persistedCounts.exclusion_rows} exclusions.`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } else {
    console.log(`\n(${mode} mode — nothing persisted. Re-run with --apply to write.)`);
  }

  const report = buildReport({
    modeName: mode,
    workspaceRevision,
    sourceQueryHash,
    input: input1,
    result: run1,
    verifyResult: run2,
    persistedCounts,
  });
  const reportPath = await writeReport(mode, report);
  console.log(`\nReport written: ${reportPath}`);
  console.log(JSON.stringify(report, null, 2));

  await pool.end();
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exitCode = 1;
});
