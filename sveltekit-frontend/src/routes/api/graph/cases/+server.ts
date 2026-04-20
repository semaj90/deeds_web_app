/**
 * GET /api/graph/cases — Neo4j case relationship graph data
 * Query: ?limit=500&types=Case,Evidence,Person,GlossaryTerm
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { cacheControl } from '$lib/server/middleware/cache-headers.js';

const NODE_TYPES = ['Case', 'Evidence', 'Person', 'GlossaryTerm', 'Statute'] as const;

const querySchema = z.object({
  limit: z.coerce.number().int().min(10).max(2000).default(500),
  types: z
    .string()
    .optional()
    .transform((v) =>
      v
        ? v
            .split(',')
            .map((t) => t.trim())
            .filter((t): t is (typeof NODE_TYPES)[number] =>
              (NODE_TYPES as readonly string[]).includes(t)
            )
        : [...NODE_TYPES]
    ),
});

export interface GraphNode {
  id: string;
  label: string; // Neo4j node label (Case/Evidence/etc.)
  title: string;
  properties: Record<string, unknown>;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
}

export interface CaseGraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: { nodeCount: number; edgeCount: number; byLabel: Record<string, number> };
}

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user?.id) return json({ nodes: [], edges: [], stats: { nodeCount: 0, edgeCount: 0, byLabel: {} } }, { status: 401 });

  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return json({ nodes: [], edges: [], stats: { nodeCount: 0, edgeCount: 0, byLabel: {} } }, { status: 400 });
  }
  const { limit, types } = parsed.data;

  try {
    const { getNeo4jDriver } = await import('$lib/server/neo4j-driver.js');
    const driver = getNeo4jDriver();
    const session = driver.session({ database: 'neo4j' });

    try {
      // Build label filter
      const labelFilter = types.length > 0
        ? types.map((t) => `n:${t}`).join(' OR ')
        : 'true';

      // Fetch nodes
      const nodeResult = await session.run(
        `MATCH (n) WHERE ${labelFilter}
         RETURN elementId(n) AS eid, labels(n)[0] AS lbl, n.id AS id, n.title AS title, n.name AS name,
                n.caseNumber AS caseNumber, n.status AS status, n.evidenceType AS evidenceType
         LIMIT toInteger($limit)`,
        { limit }
      );

      const nodeMap = new Map<string, GraphNode>();
      const byLabel: Record<string, number> = {};

      for (const rec of nodeResult.records) {
        const eid: string = rec.get('eid') as string;
        const lbl: string = (rec.get('lbl') as string) || 'Unknown';
        const nid: string = (rec.get('id') as string) || eid;
        const title: string =
          (rec.get('title') as string) ||
          (rec.get('name') as string) ||
          (rec.get('caseNumber') as string) ||
          nid.slice(0, 40);

        nodeMap.set(eid, {
          id: eid,
          label: lbl,
          title,
          properties: {
            pgId: nid,
            status: rec.get('status'),
            evidenceType: rec.get('evidenceType'),
            caseNumber: rec.get('caseNumber'),
          },
        });
        byLabel[lbl] = (byLabel[lbl] ?? 0) + 1;
      }

      // Fetch edges between those nodes
      const nodeEids = [...nodeMap.keys()];
      let edges: GraphEdge[] = [];

      if (nodeEids.length > 1) {
        const edgeResult = await session.run(
          `MATCH (a)-[r]->(b)
           WHERE elementId(a) IN $eids AND elementId(b) IN $eids
           RETURN elementId(a) AS src, elementId(b) AS tgt, type(r) AS relType
           LIMIT 5000`,
          { eids: nodeEids }
        );
        edges = edgeResult.records.map((rec) => ({
          source: rec.get('src') as string,
          target: rec.get('tgt') as string,
          type: rec.get('relType') as string,
        }));
      }

      const nodes = [...nodeMap.values()];
      return json(
        {
          nodes,
          edges,
          stats: { nodeCount: nodes.length, edgeCount: edges.length, byLabel },
        },
        { headers: cacheControl.medium }
      );
    } finally {
      await session.close();
    }
  } catch (err) {
    console.error('[api/graph/cases] Neo4j error:', err);
    return json(
      { nodes: [], edges: [], stats: { nodeCount: 0, edgeCount: 0, byLabel: {} } },
      { headers: cacheControl.medium }
    );
  }
};
