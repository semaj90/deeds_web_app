import type { HyperedgeRowV1 } from './hypergraph-graph-view-v1.js';

/**
 * Read-only loader for the Neo4j HyperedgeMirrorV1 sample. The session is injected so the
 * loader can be tested without a database; the route supplies a READ-mode driver session.
 * It reads only. Mirror rows are canonicalAuthority:false and member ids are provisional
 * (span-based), never tn_v1_ identities.
 */

export interface HypergraphSessionLikeV1 {
  run(cypher: string, params: Record<string, unknown>): Promise<{ records: Array<{ get(key: string): unknown }> }>;
  close(): Promise<void>;
}

export interface HypergraphLoadRequestV1 {
  q?: string;
  limit: number;
}

export const HYPERGRAPH_LOAD_CYPHER = `MATCH (h:HyperedgeMirrorV1)
WHERE $q IS NULL OR h.sourceRef CONTAINS $q OR EXISTS { (h)-[:HAS_PARTICIPANT]->(:HyperedgeMemberV1 {id: $q}) }
WITH h ORDER BY h.key LIMIT toInteger($lim)
MATCH (h)-[x:HAS_PARTICIPANT]->(p:HyperedgeMemberV1)
RETURN h.key AS key, h.relationKind AS relationKind, h.arity AS arity, h.sourceRef AS sourceRef,
       h.sourceRevision AS sourceRevision, collect({memberId: p.id, role: x.role, ordinal: x.ordinal}) AS members`;

/** Each hyperedge expands to ~4 nodes in the view, so the Cypher LIMIT is a quarter of the node budget. */
export const hyperedgeLimitForNodes = (nodeLimit: number): number => Math.max(1, Math.floor(nodeLimit / 4));

const num = (v: unknown): number => {
  const toNumber = (v as { toNumber?: () => number } | null)?.toNumber;
  return typeof toNumber === 'function' ? (v as { toNumber: () => number }).toNumber() : Number(v);
};

export async function loadHypergraphRowsV1(
  req: HypergraphLoadRequestV1,
  openReadSession: () => HypergraphSessionLikeV1,
): Promise<HyperedgeRowV1[]> {
  const session = openReadSession();
  try {
    const res = await session.run(HYPERGRAPH_LOAD_CYPHER, {
      q: req.q && req.q.length > 0 ? req.q : null,
      lim: hyperedgeLimitForNodes(req.limit),
    });
    return res.records.map((r) => {
      const members = (r.get('members') as Array<{ memberId: string; role: string; ordinal: unknown }> | null) ?? [];
      return {
        key: String(r.get('key')),
        relationKind: String(r.get('relationKind')),
        arity: num(r.get('arity')),
        sourceRef: (r.get('sourceRef') as string | null) ?? null,
        sourceRevision: (r.get('sourceRevision') as string | null) ?? null,
        members: members.map((m) => ({ memberId: String(m.memberId), role: String(m.role), ordinal: num(m.ordinal) })),
      };
    });
  } finally {
    await session.close();
  }
}
