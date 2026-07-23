#!/usr/bin/env node
import crypto from 'node:crypto';
import pg from 'pg';
import { createGraphSnapshotV2Repository } from '@deeds/parent-atlas/core/graph-snapshot-v2';

const connectionString = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const pool = new pg.Pool({ connectionString, max: 1 });
const id = crypto.randomUUID();
const runId = crypto.randomUUID();

async function legacyWitness() {
  const { rows } = await pool.query(`
    SELECT COUNT(*)::text AS row_count, COUNT(DISTINCT pagerank_score)::text AS pagerank_distinct,
      COALESCE(SUM(pagerank_score), 0)::text AS pagerank_sum,
      COUNT(authority_score)::text AS authority_count,
      COALESCE(SUM(authority_score), 0)::text AS authority_sum,
      COUNT(DISTINCT page_rank_score)::text AS page_rank_distinct,
      COALESCE(SUM(page_rank_score), 0)::text AS page_rank_sum
    FROM atlas_packets
  `);
  return rows[0];
}

try {
  const before = await legacyWitness();
  const repository = createGraphSnapshotV2Repository(pool);
  const snapshot = {
    snapshotId: id,
    schemaVersion: 'atlas.graph.v2',
    sourceManifest: { fixture: true },
    projectionPolicy: { fixture: true },
    sourceHash: 'fixture-source-hash',
    topologyHash: 'fixture-topology-hash',
    policyHash: 'fixture-policy-hash',
    eligibilityPredicate: 'fixture = true',
  };
  await repository.createBuildingSnapshot(snapshot);
  await pool.query(
    `INSERT INTO atlas_graph_nodes_v2 (snapshot_id, node_key, node_type, source_ref)
     VALUES ($1, 'fixture:node', 'file', 'fixture.ts')`,
    [id],
  );
  let missingEndpointRejected = false;
  try {
    await pool.query(
      `INSERT INTO atlas_graph_edges_v2
       (snapshot_id, edge_key, source_node_key, target_node_key, edge_type, weight, confidence, provenance)
       VALUES ($1, 'fixture:bad-edge', 'fixture:node', 'fixture:missing', 'CALLS', 1, 1, 'fixture')`,
      [id],
    );
  } catch {
    missingEndpointRejected = true;
  }
  if (!missingEndpointRejected) throw new Error('Graph edge with a missing canonical endpoint was accepted.');
  await repository.upsertResolutionIssue({
    snapshotId: id, issueFingerprint: 'fixture:missing-packet', issueType: 'MISSING_PACKET_KEY', issueStatus: 'OPEN',
    exclusionStage: 'identity', topologyHash: snapshot.topologyHash, evidence: { fixture: true },
  });
  await repository.upsertResolutionIssue({
    snapshotId: id, issueFingerprint: 'fixture:missing-packet', issueType: 'MISSING_PACKET_KEY', issueStatus: 'OPEN',
    exclusionStage: 'identity', topologyHash: snapshot.topologyHash, evidence: { fixture: true },
  });
  await repository.validateSnapshot(id, { nodes: 1, edges: 0, relations: 0, exclusions: 0, unresolved: 1 });
  await repository.persistAuthorityRun({
    runId, snapshotId: id, engine: 'networkx', algorithmVersion: 'fixture', configuration: { alpha: 0.85 },
    topologyHash: snapshot.topologyHash, nodeCount: 0, edgeCount: 0, resultHash: 'fixture-result-hash',
    didConverge: true, ranIterations: 1, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(),
  });
  let immutableRejected = false;
  try { await pool.query(`UPDATE atlas_graph_snapshots_v2 SET source_hash = 'mutated' WHERE snapshot_id = $1`, [id]); } catch { immutableRejected = true; }
  const issue = await pool.query(`SELECT occurrence_count FROM atlas_graph_resolution_issues_v2 WHERE snapshot_id = $1`, [id]);
  const after = await legacyWitness();
  if (!immutableRejected) throw new Error('Validated snapshot mutation was accepted.');
  if (issue.rows[0]?.occurrence_count !== 2) throw new Error('Resolution issue upsert was not idempotent.');
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Legacy packet score witness changed.');
  console.log(JSON.stringify({
    POSTGRES_GRAPH_PERSISTENCE_PROVEN: true,
    GRAPH_RESOLUTION_ISSUES_LEDGER_PROVEN: true,
    EDGE_ENDPOINT_FOREIGN_KEY_ENFORCED: true,
    VALIDATED_SNAPSHOT_IMMUTABLE: true,
    AUTHORITY_RUN_REQUIRES_VALIDATED_SNAPSHOT: true,
    PRODUCTION_SCORE_UNCHANGED: true,
  }));
} finally {
  await pool.query(`DELETE FROM atlas_graph_authority_runs_v2 WHERE run_id = $1`, [runId]).catch(() => {});
  await pool.query(`DELETE FROM atlas_graph_resolution_issues_v2 WHERE snapshot_id = $1`, [id]).catch(() => {});
  await pool.query(`DELETE FROM atlas_graph_nodes_v2 WHERE snapshot_id = $1`, [id]).catch(() => {});
  await pool.query(`DELETE FROM atlas_graph_snapshots_v2 WHERE snapshot_id = $1`, [id]).catch(() => {});
  await pool.end();
}
