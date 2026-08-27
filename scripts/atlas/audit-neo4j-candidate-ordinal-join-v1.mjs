#!/usr/bin/env node

/**
 * @file scripts/atlas/audit-neo4j-candidate-ordinal-join-v1.mjs
 *
 * GRAPH-ORDINAL-01/02: Neo4j Candidate Ordinal Join Audit
 *
 * Joins Neo4j graph nodes and edges against the production CandidateOrdinalMapV1.
 * Strong identifiers: canonicalId, packetKey, symbolVersionId, treeNodeId.
 * Fallback: unique sourceRef.
 * Rejection: conflicting/ambiguous identifiers.
 *
 * Outputs:
 *   docs/reports/neo4j-candidate-ordinal-join-v1.json
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import neo4j from 'neo4j-driver';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const reportPath = path.join(ROOT, 'docs', 'reports', 'neo4j-candidate-ordinal-join-v1.json');

function getArg(name, fallback = null) {
  const inline = process.argv.slice(2).find((v) => v.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

const candidateMapPath = path.resolve(ROOT, getArg('candidate-map', 'docs/reports/candidate-ordinal-corpus-v1.json'));
const maxNodes = Math.max(1, Math.min(100_000, Number(getArg('max-nodes', process.env.NEO4J_JOIN_LIMIT ?? '25000'))));
const maxEdges = Math.max(1, Math.min(200_000, Number(getArg('max-edges', '100000'))));

const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const neo4jUri = process.env.NEO4J_URI ?? 'bolt://127.0.0.1:7687';
const neo4jUser = process.env.NEO4J_USER ?? 'neo4j';
const neo4jPassword = process.env.NEO4J_PASSWORD ?? 'neo4j123';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const text = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;
const values = (value) => Array.isArray(value) ? value.map(text).filter(Boolean) : [text(value)].filter(Boolean);

function first(row, names) {
  for (const name of names) {
    const value = text(row[name]);
    if (value) return value;
  }
  return null;
}

function normalizeNode(node) {
  const props = node.properties ?? {};
  return {
    elementId: node.elementId,
    labels: node.labels,
    canonicalIds: values([props.canonical_id, props.canonicalId, props.packet_id, props.packetId]),
    packetKeys: values(props.packet_key ?? props.packetKey),
    symbolVersionIds: values(props.symbol_version_id ?? props.symbolVersionId),
    treeNodeIds: values(props.tree_node_id ?? props.treeNodeId),
    sourceRefs: values([props.source_ref, props.sourceRef, props.filePath, props.file_path, props.path, props.canonical_source_ref]),
    workspaceRevision: first(props, ['workspace_revision', 'workspaceRevision']),
    sourceRevision: first(props, ['source_revision', 'sourceRevision', 'content_hash', 'sha256']),
  };
}

function classify(node, indexes) {
  const strong = new Set();
  for (const key of node.canonicalIds) for (const ordinal of indexes.canonicalIds.get(key) ?? []) strong.add(ordinal);
  for (const key of node.packetKeys) for (const ordinal of indexes.packetKeys.get(key) ?? []) strong.add(ordinal);
  for (const key of node.symbolVersionIds) for (const ordinal of indexes.symbolVersionIds.get(key) ?? []) strong.add(ordinal);
  for (const key of node.treeNodeIds) for (const ordinal of indexes.treeNodeIds.get(key) ?? []) strong.add(ordinal);

  if (strong.size > 1) return { status: 'CONFLICTING_STRONG_IDENTIFIERS', ordinals: [...strong] };
  if (strong.size === 1) return { status: 'STRONG_IDENTITY_RESOLVED', ordinals: [...strong] };

  const source = new Set();
  for (const key of node.sourceRefs) for (const ordinal of indexes.sourceRefs.get(key) ?? []) source.add(ordinal);
  if (source.size === 1) return { status: 'EXACT_UNIQUE_SOURCE_REF', ordinals: [...source] };
  if (source.size > 1) return { status: 'SOURCE_REF_AMBIGUOUS', ordinals: [...source] };
  return { status: 'SOURCE_REF_NOT_FOUND', ordinals: [] };
}

async function loadCandidates() {
  try {
    const raw = await fs.readFile(candidateMapPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.candidates)) {
      console.log(`Loaded candidate map from: ${candidateMapPath} (${parsed.candidates.length} candidates)`);
      return parsed.candidates.map((c) => ({
        ordinal: c.candidateOrdinal,
        canonicalId: c.canonicalId,
        packetKey: c.packetKey,
        symbolVersionId: c.symbolVersionId,
        treeNodeId: c.treeNodeId,
        sourceRef: c.sourceRef,
      }));
    }
  } catch (err) {
    console.warn(`Could not load candidate map from ${candidateMapPath}: ${err.message}. Falling back to DB query.`);
  }

  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 5000, statement_timeout: 30_000 });
  try {
    const result = await pool.query('SELECT packet_id AS id, packet_key, source_ref, canonical_source_ref, tree_node_id, metadata FROM public.atlas_packets ORDER BY packet_id LIMIT $1', [maxNodes]);
    return result.rows.map((row, ordinal) => ({
      ordinal,
      canonicalId: row.id,
      packetKey: row.packet_key,
      symbolVersionId: row.metadata?.symbol_version_id ?? null,
      treeNodeId: row.tree_node_id ?? row.metadata?.tree_node_id ?? null,
      sourceRef: row.canonical_source_ref || row.source_ref,
    }));
  } finally {
    await pool.end().catch(() => {});
  }
}

async function main() {
  const driver = neo4j.driver(neo4jUri, neo4j.auth.basic(neo4jUser, neo4jPassword));
  const report = {
    schema: 'Neo4jCandidateOrdinalJoinReceiptV1',
    generatedAt: new Date().toISOString(),
    writes: false,
    candidateMapSource: candidateMapPath,
    maxNodes,
    maxEdges,
    candidatesCount: 0,
    neo4j: { nodes: 0, edges: 0, error: null },
    classifications: {},
    identityQuality: { strongIdentityResolved: 0, sourceRefOnlyResolved: 0, unresolved: 0, rejected: 0 },
    neo4jIdentityFieldCoverage: {
      canonicalId: 0,
      packetKey: 0,
      symbolVersionId: 0,
      treeNodeId: 0,
      sourceRef: 0,
      workspaceRevision: 0,
      sourceRevision: 0,
    },
    edgeQuality: { scanned: 0, admitted: 0, rejected: 0, rejectionReasons: {} },
    deterministicProjectionChecksum: null,
  };

  try {
    const candidates = await loadCandidates();
    report.candidatesCount = candidates.length;

    const indexes = Object.fromEntries(
      ['canonicalIds', 'packetKeys', 'symbolVersionIds', 'treeNodeIds', 'sourceRefs'].map((field) => [field, new Map()])
    );

    for (const candidate of candidates) {
      for (const [field, value] of [
        ['canonicalIds', candidate.canonicalId],
        ['packetKeys', candidate.packetKey],
        ['symbolVersionIds', candidate.symbolVersionId],
        ['treeNodeIds', candidate.treeNodeId],
        ['sourceRefs', candidate.sourceRef],
      ]) {
        if (!value) continue;
        if (!indexes[field].has(value)) indexes[field].set(value, []);
        indexes[field].get(value).push(candidate.ordinal);
      }
    }

    const session = driver.session();
    try {
      // Node and edge reads intentionally share one read transaction. Neo4j
      // elementId values are only temporary join keys within this transaction.
      const projection = await session.executeRead(async (tx) => {
        const nodesResult = await tx.run(
          `MATCH (n) WHERE any(label IN labels(n) WHERE label IN ['Packet','TreeNode','CodebaseFile','Function','AST','Symbol']) RETURN n LIMIT $maxNodes`,
          { maxNodes: neo4j.int(maxNodes) }
        );

        const resolved = [];
        const byElementId = new Map();
        for (const record of nodesResult.records) {
          const normalized = normalizeNode(record.get('n'));
          if (normalized.canonicalIds.length) report.neo4jIdentityFieldCoverage.canonicalId++;
          if (normalized.packetKeys.length) report.neo4jIdentityFieldCoverage.packetKey++;
          if (normalized.symbolVersionIds.length) report.neo4jIdentityFieldCoverage.symbolVersionId++;
          if (normalized.treeNodeIds.length) report.neo4jIdentityFieldCoverage.treeNodeId++;
          if (normalized.sourceRefs.length) report.neo4jIdentityFieldCoverage.sourceRef++;
          if (normalized.workspaceRevision) report.neo4jIdentityFieldCoverage.workspaceRevision++;
          if (normalized.sourceRevision) report.neo4jIdentityFieldCoverage.sourceRevision++;
          const classification = classify(normalized, indexes);
          report.classifications[classification.status] = (report.classifications[classification.status] ?? 0) + 1;

          if (classification.status === 'STRONG_IDENTITY_RESOLVED') report.identityQuality.strongIdentityResolved++;
          else if (classification.status === 'EXACT_UNIQUE_SOURCE_REF') report.identityQuality.sourceRefOnlyResolved++;
          else if (classification.status === 'SOURCE_REF_NOT_FOUND') report.identityQuality.unresolved++;
          else report.identityQuality.rejected++;

          const entry = { elementId: normalized.elementId, labels: normalized.labels, classification };
          resolved.push(entry);
          byElementId.set(normalized.elementId, entry);
        }

        const edgesResult = await tx.run(
          `MATCH (a)-[r]->(b)
           RETURN elementId(a) AS sourceElementId, elementId(b) AS targetElementId,
                  type(r) AS relationType
           LIMIT $maxEdges`,
          { maxEdges: neo4j.int(maxEdges) }
        );

        const admittedEdges = [];
        for (const record of edgesResult.records) {
          report.edgeQuality.scanned++;
          const source = byElementId.get(record.get('sourceElementId'));
          const target = byElementId.get(record.get('targetElementId'));
          const sourceOrdinal = source?.classification?.ordinals?.length === 1
            ? source.classification.ordinals[0]
            : null;
          const targetOrdinal = target?.classification?.ordinals?.length === 1
            ? target.classification.ordinals[0]
            : null;
          if (sourceOrdinal === null || targetOrdinal === null) {
            report.edgeQuality.rejected++;
            const reason = !source || !target ? 'ENDPOINT_OUTSIDE_NODE_CENSUS' : 'ENDPOINT_NOT_UNIQUELY_RESOLVED';
            report.edgeQuality.rejectionReasons[reason] = (report.edgeQuality.rejectionReasons[reason] ?? 0) + 1;
            continue;
          }
          report.edgeQuality.admitted++;
          admittedEdges.push({ sourceOrdinal, targetOrdinal, relationType: record.get('relationType') });
        }

        return { resolved, admittedEdges };
      });

      report.neo4j.nodes = projection.resolved.length;
      report.neo4j.edges = report.edgeQuality.scanned;
      report.resolvedNodes = projection.resolved.sort((a, b) => a.elementId.localeCompare(b.elementId));
      report.admittedEdges = projection.admittedEdges.sort((a, b) =>
        a.sourceOrdinal - b.sourceOrdinal || a.targetOrdinal - b.targetOrdinal || a.relationType.localeCompare(b.relationType)
      );
      // Exclude Neo4j elementIds and runtime metadata from the deterministic
      // projection checksum; only canonical ordinals and relation types count.
      report.deterministicProjectionChecksum = sha256(JSON.stringify(report.admittedEdges));

    } finally {
      await session.close();
    }
  } catch (error) {
    report.neo4j.error = String(error?.message ?? error);
  } finally {
    await driver.close().catch(() => {});
  }

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    schema: report.schema,
    candidatesCount: report.candidatesCount,
    neo4jNodes: report.neo4j.nodes,
    classifications: report.classifications,
    identityQuality: report.identityQuality,
    deterministicProjectionChecksum: report.deterministicProjectionChecksum,
    reportPath,
  }, null, 2));
}

main().catch((error) => {
  console.error('[audit-neo4j-candidate-ordinal-join] Fatal:', error);
  process.exit(1);
});
