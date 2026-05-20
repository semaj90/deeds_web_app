import { createHash } from 'node:crypto';
import pg from 'pg';
import { ENV } from '$lib/server/env.server.js';
import type {
  HyperedgeInput,
  HyperedgeTopology,
  Hyperedge,
} from './hypergraph-types.js';

const DB_URL = ENV.DATABASE_URL;

let _pool: pg.Pool | null = null;
function getPool(): pg.Pool {
  if (!_pool) _pool = new pg.Pool({ connectionString: DB_URL, max: 3 });
  return _pool;
}

// ── Deterministic ID helpers ──────────────────────────────────────────────────
// IDs are content-addressed so the same logical edge can be upserted safely.

export function hashQuery(query: string): string {
  return createHash('sha256').update(query.trim().toLowerCase()).digest('hex').slice(0, 16);
}

function stableId(...parts: (string | undefined | null)[]): string {
  return createHash('sha256')
    .update(parts.filter(Boolean).join(':'))
    .digest('hex')
    .slice(0, 32);
}

export function retrievalEdgeId(queryHash: string, runId?: string): string {
  return `hedge:retrieval:${queryHash}${runId ? ':' + runId : ''}`;
}
export function agentsContextEdgeId(fileKey: string, agentsKey: string): string {
  return `hedge:agents_context:${stableId(fileKey, agentsKey)}`;
}
export function clusterContextEdgeId(clusterId: string): string {
  return `hedge:cluster_context:${stableId(clusterId)}`;
}
export function testCoverageEdgeId(testFileHash: string): string {
  return `hedge:test_coverage:${stableId(testFileHash)}`;
}
export function fixAttemptEdgeId(attemptId: string): string {
  return `hedge:fix_attempt:${stableId(attemptId)}`;
}

// ── DB write ──────────────────────────────────────────────────────────────────

export async function insertHyperedge(input: HyperedgeInput): Promise<Hyperedge> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [edge] } = await client.query<{
      id: string; edge_type: string; label: string | null;
      query_hash: string | null; run_id: string | null;
      weight: number; topology: HyperedgeTopology | null;
      metadata: Record<string, unknown> | null; created_at: Date;
    }>(
      `INSERT INTO hypergraph_edges (edge_type, label, query_hash, run_id, weight, topology, metadata)
       VALUES ($1, $2, $3, $4::uuid, $5, $6::jsonb, $7::jsonb)
       RETURNING *`,
      [
        input.edge_type,
        input.label ?? null,
        input.query_hash ?? null,
        input.run_id ?? null,
        input.weight ?? 1.0,
        input.topology ? JSON.stringify(input.topology) : null,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ]
    );

    if (input.members.length > 0) {
      const values = input.members.map((_, i) => {
        const base = i * 6;
        return `($${base + 1}::uuid, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}::real, $${base + 6}::jsonb)`;
      }).join(', ');

      const flat = input.members.flatMap(m => [
        edge.id,
        m.member_kind,
        m.member_key,
        m.role ?? null,
        m.score ?? null,
        m.payload ? JSON.stringify(m.payload) : null,
      ]);

      await client.query(
        `INSERT INTO hypergraph_edge_members (edge_id, member_kind, member_key, role, score, payload)
         VALUES ${values}`,
        flat
      );
    }

    await client.query('COMMIT');

    return {
      id: edge.id,
      edge_type: edge.edge_type as Hyperedge['edge_type'],
      label: edge.label,
      query_hash: edge.query_hash,
      run_id: edge.run_id,
      weight: edge.weight,
      topology: edge.topology,
      metadata: edge.metadata,
      created_at: edge.created_at.toISOString(),
      members: input.members,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Convenience builders ──────────────────────────────────────────────────────

export function buildRetrievalEdge(
  query: string,
  chunkIds: string[],
  agentsMdKeys: string[],
  clusterIds: string[],
  runId?: string,
  topology?: HyperedgeTopology,
): HyperedgeInput {
  const queryHash = hashQuery(query);
  return {
    edge_type: 'retrieval',
    label: query.slice(0, 120),
    query_hash: queryHash,
    run_id: runId,
    weight: 1.0,
    topology,
    metadata: { chunkCount: chunkIds.length, agentsMdCount: agentsMdKeys.length },
    members: [
      { member_kind: 'query', member_key: queryHash, role: 'source' },
      ...chunkIds.map(k => ({ member_kind: 'chunk' as const, member_key: k, role: 'result' as const })),
      ...agentsMdKeys.map(k => ({ member_kind: 'agents_md' as const, member_key: k, role: 'context' as const })),
      ...clusterIds.map(k => ({ member_kind: 'cluster' as const, member_key: k, role: 'context' as const })),
    ],
  };
}

export function buildAgentsContextEdge(
  fileKey: string,
  agentsMdKey: string,
  topology?: HyperedgeTopology,
): HyperedgeInput {
  return {
    edge_type: 'agents_context',
    label: `agents: ${agentsMdKey}`,
    weight: 0.8,
    topology,
    metadata: { fileKey, agentsMdKey },
    members: [
      { member_kind: 'file', member_key: fileKey, role: 'source' },
      { member_kind: 'agents_md', member_key: agentsMdKey, role: 'context' },
    ],
  };
}

export function buildClusterContextEdge(
  clusterId: string,
  fileKeys: string[],
  topology?: HyperedgeTopology,
): HyperedgeInput {
  return {
    edge_type: 'cluster_context',
    label: `cluster: ${clusterId}`,
    weight: 0.7,
    topology,
    metadata: { clusterId, fileCount: fileKeys.length },
    members: [
      { member_kind: 'cluster', member_key: clusterId, role: 'source' },
      ...fileKeys.map(k => ({ member_kind: 'file' as const, member_key: k, role: 'context' as const })),
    ],
  };
}

export function buildTestCoverageEdge(
  testFile: string,
  sourceFiles: string[],
): HyperedgeInput {
  return {
    edge_type: 'test_coverage',
    label: `tests: ${testFile.split('/').pop()}`,
    weight: 0.9,
    metadata: { testFile, sourceCount: sourceFiles.length },
    members: [
      { member_kind: 'test', member_key: testFile, role: 'source' },
      ...sourceFiles.map(k => ({ member_kind: 'file' as const, member_key: k, role: 'evidence' as const })),
    ],
  };
}

export function buildFixAttemptEdge(
  filePath: string,
  testFile: string | null,
  tokenHash: string,
  priorAnswerKey: string | null,
  runId?: string,
): HyperedgeInput {
  return {
    edge_type: 'fix_attempt',
    label: `fix: ${filePath.split('/').pop()}`,
    run_id: runId,
    weight: 1.0,
    metadata: { filePath, testFile, tokenHash },
    members: [
      { member_kind: 'file', member_key: filePath, role: 'source' },
      ...(testFile ? [{ member_kind: 'test' as const, member_key: testFile, role: 'constraint' as const }] : []),
      { member_kind: 'query', member_key: tokenHash, role: 'constraint' },
      ...(priorAnswerKey ? [{ member_kind: 'prior_answer' as const, member_key: priorAnswerKey, role: 'context' as const }] : []),
    ],
  };
}
