import { z } from 'zod';
import type { Pool, PoolClient } from 'pg';

export const GraphSnapshotV2StatusSchema = z.enum(['BUILDING', 'VALIDATED', 'SUPERSEDED', 'FAILED']);
export const GraphResolutionIssueStatusSchema = z.enum(['OPEN', 'RETRYABLE', 'QUARANTINED', 'IGNORED_BY_POLICY', 'RESOLVED', 'SUPERSEDED']);

export const GraphSnapshotV2Schema = z.object({
  snapshotId: z.string().uuid(),
  schemaVersion: z.string().min(1),
  sourceManifest: z.record(z.string(), z.unknown()),
  projectionPolicy: z.record(z.string(), z.unknown()),
  sourceHash: z.string().min(1),
  topologyHash: z.string().min(1),
  policyHash: z.string().min(1),
  eligibilityPredicate: z.string().min(1),
}).strict();

export const GraphResolutionIssueV2Schema = z.object({
  snapshotId: z.string().uuid(),
  issueFingerprint: z.string().min(1),
  issueType: z.string().min(1),
  issueStatus: GraphResolutionIssueStatusSchema,
  exclusionStage: z.string().min(1),
  topologyHash: z.string().min(1),
  packetKey: z.string().min(1).nullable().optional(),
  nodeKey: z.string().min(1).nullable().optional(),
  treeNodeId: z.string().uuid().nullable().optional(),
  sourceRef: z.string().min(1).nullable().optional(),
  candidateMatches: z.array(z.unknown()).default([]),
  evidence: z.record(z.string(), z.unknown()).default({}),
}).strict();

export const GraphAuthorityRunV2Schema = z.object({
  runId: z.string().uuid(),
  snapshotId: z.string().uuid(),
  engine: z.enum(['networkx', 'neo4j_gds']),
  algorithmVersion: z.string().min(1),
  configuration: z.record(z.string(), z.unknown()),
  topologyHash: z.string().min(1),
  nodeCount: z.number().int().nonnegative(),
  edgeCount: z.number().int().nonnegative(),
  resultHash: z.string().min(1),
  didConverge: z.boolean(),
  ranIterations: z.number().int().nonnegative(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable().optional(),
}).strict();

export type GraphSnapshotV2 = z.infer<typeof GraphSnapshotV2Schema>;
export type GraphResolutionIssueV2 = z.infer<typeof GraphResolutionIssueV2Schema>;
export type GraphAuthorityRunV2 = z.infer<typeof GraphAuthorityRunV2Schema>;

export function assertAuthorityRunCanPersist(snapshot: { status: z.infer<typeof GraphSnapshotV2StatusSchema>; topologyHash: string }, run: GraphAuthorityRunV2): void {
  if (snapshot.status !== 'VALIDATED') throw new Error('Authority runs require a VALIDATED graph snapshot.');
  if (snapshot.topologyHash !== run.topologyHash) throw new Error('Authority run topology hash does not match its graph snapshot.');
}

export function createGraphSnapshotV2Repository(pool: Pool) {
  async function createBuildingSnapshot(input: GraphSnapshotV2): Promise<void> {
    const snapshot = GraphSnapshotV2Schema.parse(input);
    await pool.query(
      `INSERT INTO atlas_graph_snapshots_v2 (snapshot_id, schema_version, status, source_manifest, projection_policy, source_hash, topology_hash, policy_hash, eligibility_predicate)
       VALUES ($1, $2, 'BUILDING', $3::jsonb, $4::jsonb, $5, $6, $7, $8)`,
      [snapshot.snapshotId, snapshot.schemaVersion, JSON.stringify(snapshot.sourceManifest), JSON.stringify(snapshot.projectionPolicy), snapshot.sourceHash, snapshot.topologyHash, snapshot.policyHash, snapshot.eligibilityPredicate],
    );
  }

  async function upsertResolutionIssue(input: GraphResolutionIssueV2): Promise<void> {
    const issue = GraphResolutionIssueV2Schema.parse(input);
    await pool.query(
      `INSERT INTO atlas_graph_resolution_issues_v2
        (snapshot_id, issue_fingerprint, packet_key, node_key, tree_node_id, source_ref, issue_type, issue_status, exclusion_stage, candidate_matches, evidence, topology_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12)
       ON CONFLICT (snapshot_id, issue_fingerprint) DO UPDATE SET
         occurrence_count = atlas_graph_resolution_issues_v2.occurrence_count + 1,
         last_seen_at = now(), candidate_matches = EXCLUDED.candidate_matches, evidence = EXCLUDED.evidence`,
      [issue.snapshotId, issue.issueFingerprint, issue.packetKey ?? null, issue.nodeKey ?? null, issue.treeNodeId ?? null, issue.sourceRef ?? null, issue.issueType, issue.issueStatus, issue.exclusionStage, JSON.stringify(issue.candidateMatches), JSON.stringify(issue.evidence), issue.topologyHash],
    );
  }

  async function validateSnapshot(snapshotId: string, counts: { nodes: number; edges: number; relations: number; exclusions: number; unresolved: number }): Promise<void> {
    const result = await pool.query(
      `UPDATE atlas_graph_snapshots_v2 SET status = 'VALIDATED', node_count = $2, edge_count = $3, relation_event_count = $4, excluded_count = $5, unresolved_count = $6, finalized_at = now()
       WHERE snapshot_id = $1 AND status = 'BUILDING'`,
      [snapshotId, counts.nodes, counts.edges, counts.relations, counts.exclusions, counts.unresolved],
    );
    if (result.rowCount !== 1) throw new Error('Only a BUILDING graph snapshot can be validated.');
  }

  async function persistAuthorityRun(input: GraphAuthorityRunV2): Promise<void> {
    const run = GraphAuthorityRunV2Schema.parse(input);
    const snapshotResult = await pool.query<{ status: z.infer<typeof GraphSnapshotV2StatusSchema>; topology_hash: string }>(
      `SELECT status, topology_hash FROM atlas_graph_snapshots_v2 WHERE snapshot_id = $1`, [run.snapshotId],
    );
    const snapshot = snapshotResult.rows[0];
    if (!snapshot) throw new Error('Authority run references an unknown graph snapshot.');
    assertAuthorityRunCanPersist({ status: GraphSnapshotV2StatusSchema.parse(snapshot.status), topologyHash: snapshot.topology_hash }, run);
    if (!run.didConverge) throw new Error('Authority runs must converge before they can persist as PASSED.');
    await pool.query(
      `INSERT INTO atlas_graph_authority_runs_v2
        (run_id, snapshot_id, engine, algorithm, algorithm_version, configuration, topology_hash, node_count, edge_count, result_hash, status, did_converge, ran_iterations, started_at, completed_at)
       VALUES ($1,$2,$3,'pagerank',$4,$5::jsonb,$6,$7,$8,$9,'PASSED',$10,$11,$12,$13)`,
      [run.runId, run.snapshotId, run.engine, run.algorithmVersion, JSON.stringify(run.configuration), run.topologyHash, run.nodeCount, run.edgeCount, run.resultHash, run.didConverge, run.ranIterations, run.startedAt, run.completedAt ?? null],
    );
  }

  return { createBuildingSnapshot, upsertResolutionIssue, validateSnapshot, persistAuthorityRun };
}

export async function withGraphSnapshotV2Transaction<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
