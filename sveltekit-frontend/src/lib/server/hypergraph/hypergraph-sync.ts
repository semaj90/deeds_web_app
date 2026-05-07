/**
 * hypergraph-sync.ts
 *
 * Syncs newly written hyperedges to Redis (summary cache) and Neo4j
 * (HYPEREDGE nodes + member relationships).
 * Fire-and-forget — callers do NOT await these.
 */
import type { Hyperedge } from './hypergraph-types.js';

export async function syncEdgeToRedis(edge: Hyperedge, ttlSeconds = 3600): Promise<void> {
  try {
    const { getRedis } = await import('../redis.js');
    const redis = getRedis();
    const key = `hg:edge:${edge.id}`;
    await redis.setex(key, ttlSeconds, JSON.stringify({
      id: edge.id,
      edge_type: edge.edge_type,
      label: edge.label,
      query_hash: edge.query_hash,
      run_id: edge.run_id,
      weight: edge.weight,
      memberCount: edge.members.length,
      created_at: edge.created_at,
    }));
  } catch {
    // non-fatal
  }
}

export async function syncEdgeToNeo4j(edge: Hyperedge): Promise<void> {
  try {
    const { ensureNeo4jDriver } = await import('../connections/connection-pool.js');
    const driver = ensureNeo4jDriver();
    if (!driver) return;
    const session = driver.session();
    try {
      await session.run(
        `MERGE (h:Hyperedge {id: $id})
         SET h.edgeType   = $edgeType,
             h.label      = $label,
             h.queryHash  = $queryHash,
             h.runId      = $runId,
             h.weight     = $weight,
             h.createdAt  = $createdAt`,
        {
          id: edge.id,
          edgeType: edge.edge_type,
          label: edge.label ?? '',
          queryHash: edge.query_hash ?? '',
          runId: edge.run_id ?? '',
          weight: edge.weight,
          createdAt: edge.created_at,
        }
      );

      for (const m of edge.members) {
        await session.run(
          `MERGE (n:HyperedgeMember {key: $key, kind: $kind})
           WITH n
           MATCH (h:Hyperedge {id: $edgeId})
           MERGE (h)-[:HAS_MEMBER {role: $role, score: $score}]->(n)`,
          {
            key: m.member_key,
            kind: m.member_kind,
            edgeId: edge.id,
            role: m.role ?? 'context',
            score: m.score ?? 1.0,
          }
        );
      }
    } finally {
      await session.close();
    }
  } catch {
    // non-fatal
  }
}
