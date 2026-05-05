/**
 * GET /api/graph/traverse — Multi-hop graph traversal from a start node
 *
 * Query params:
 *   nodeId     (required)  file path, e.g. src/lib/server/ace/context-assembler.ts
 *   hops       (default 2, max 4)
 *   mode       bfs | ego | cluster  (default bfs)
 *   limit      (default 50, max 200)
 *   direction  imports | importedBy | both  (default both)
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';

const querySchema = z.object({
  nodeId: z.string().min(1, 'nodeId is required').max(500),
  hops: z.coerce.number().int().min(1).max(4).default(2),
  mode: z.enum(['bfs', 'ego', 'cluster']).default('bfs'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  direction: z.enum(['imports', 'importedBy', 'both']).default('both'),
});

const EMPTY = (error: string, status = 200) =>
  json(
    { nodes: [], edges: [], total: 0, truncated: false, meta: { error } },
    { status }
  );

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) return EMPTY('Unauthorized', 401);

  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return EMPTY(parsed.error.issues[0]?.message ?? 'Invalid parameters', 400);
  }

  const { nodeId, hops, mode, limit, direction } = parsed.data;
  const startMs = Date.now();

  // Normalise to a stable Neo4j id (same convention as graph_neighbors in MCP)
  const fileId = (nodeId.startsWith('src/') ? nodeId : `src/${nodeId}`).replace(
    /[^a-zA-Z0-9/_.-]/g,
    '_'
  );

  try {
    const { getNeo4jDriver } = await import('$lib/server/neo4j-driver.js');
    const driver = getNeo4jDriver();
    const session = driver.session({ database: 'neo4j' });

    // Collect raw node/edge sets
    const nodeMap = new Map<string, { id: string; filePath: string; type: string; cluster: number }>();
    const edgeSet = new Set<string>();
    const edges: Array<{ source: string; target: string }> = [];

    const addEdge = (src: string, tgt: string) => {
      const key = `${src}→${tgt}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        edges.push({ source: src, target: tgt });
      }
    };

    try {
      if (mode === 'ego') {
        // 1-hop both directions regardless of `direction` param
        const [rOut, rIn] = await Promise.all([
          session.run(
            `MATCH (a:CodebaseFile {id: $id})-[:IMPORTS]->(b:CodebaseFile)
             RETURN b.id AS id, b.filePath AS fp, b.type AS type, b.cluster AS cluster
             LIMIT $limit`,
            { id: fileId, limit }
          ),
          session.run(
            `MATCH (a:CodebaseFile)-[:IMPORTS]->(b:CodebaseFile {id: $id})
             RETURN a.id AS id, a.filePath AS fp, a.type AS type, a.cluster AS cluster
             LIMIT $limit`,
            { id: fileId, limit }
          ),
        ]);

        for (const rec of rOut.records) {
          const id = rec.get('id') as string;
          if (id) {
            nodeMap.set(id, { id, filePath: rec.get('fp') ?? id, type: rec.get('type') ?? '', cluster: rec.get('cluster')?.toNumber?.() ?? rec.get('cluster') ?? 0 });
            addEdge(fileId, id);
          }
        }
        for (const rec of rIn.records) {
          const id = rec.get('id') as string;
          if (id) {
            nodeMap.set(id, { id, filePath: rec.get('fp') ?? id, type: rec.get('type') ?? '', cluster: rec.get('cluster')?.toNumber?.() ?? rec.get('cluster') ?? 0 });
            addEdge(id, fileId);
          }
        }

      } else if (mode === 'cluster') {
        // All nodes in the same GPU cluster as the start node
        const r = await session.run(
          `MATCH (a:CodebaseFile {id: $id})
           MATCH (b:CodebaseFile) WHERE b.cluster = a.cluster AND b.id <> $id
           RETURN b.id AS id, b.filePath AS fp, b.type AS type, b.cluster AS cluster
           LIMIT $limit`,
          { id: fileId, limit }
        );
        for (const rec of r.records) {
          const id = rec.get('id') as string;
          if (id) {
            nodeMap.set(id, { id, filePath: rec.get('fp') ?? id, type: rec.get('type') ?? '', cluster: rec.get('cluster')?.toNumber?.() ?? rec.get('cluster') ?? 0 });
          }
        }

      } else {
        // bfs — variable-length path up to `hops`
        const hopStr = `1..${hops}`;
        const queries: Promise<unknown>[] = [];

        if (direction === 'imports' || direction === 'both') {
          queries.push(
            session.run(
              `MATCH (a:CodebaseFile {id: $id})-[:IMPORTS*${hopStr}]->(b:CodebaseFile)
               WITH a, b
               MATCH path=(a)-[:IMPORTS*${hopStr}]->(b)
               UNWIND relationships(path) AS rel
               WITH startNode(rel) AS src, endNode(rel) AS tgt, b
               RETURN DISTINCT
                 src.id AS srcId, src.filePath AS srcFp, src.type AS srcType, src.cluster AS srcCluster,
                 tgt.id AS tgtId, tgt.filePath AS tgtFp, tgt.type AS tgtType, tgt.cluster AS tgtCluster
               LIMIT $limit`,
              { id: fileId, limit }
            )
          );
        }

        if (direction === 'importedBy' || direction === 'both') {
          queries.push(
            session.run(
              `MATCH (b:CodebaseFile)-[:IMPORTS*${hopStr}]->(a:CodebaseFile {id: $id})
               WITH a, b
               MATCH path=(b)-[:IMPORTS*${hopStr}]->(a)
               UNWIND relationships(path) AS rel
               WITH startNode(rel) AS src, endNode(rel) AS tgt, b
               RETURN DISTINCT
                 src.id AS srcId, src.filePath AS srcFp, src.type AS srcType, src.cluster AS srcCluster,
                 tgt.id AS tgtId, tgt.filePath AS tgtFp, tgt.type AS tgtType, tgt.cluster AS tgtCluster
               LIMIT $limit`,
              { id: fileId, limit }
            )
          );
        }

        const results = await Promise.all(queries);
        for (const r of results) {
          for (const rec of (r as { records: unknown[] }).records) {
            const srcId = (rec as { get: (k: string) => unknown }).get('srcId') as string;
            const tgtId = (rec as { get: (k: string) => unknown }).get('tgtId') as string;
            if (!srcId || !tgtId) continue;

            const toNum = (v: unknown) =>
              v != null && typeof (v as { toNumber?: () => number }).toNumber === 'function'
                ? (v as { toNumber: () => number }).toNumber()
                : (v as number) ?? 0;

            if (!nodeMap.has(srcId)) {
              nodeMap.set(srcId, {
                id: srcId,
                filePath: (rec as { get: (k: string) => unknown }).get('srcFp') as string ?? srcId,
                type: (rec as { get: (k: string) => unknown }).get('srcType') as string ?? '',
                cluster: toNum((rec as { get: (k: string) => unknown }).get('srcCluster')),
              });
            }
            if (!nodeMap.has(tgtId)) {
              nodeMap.set(tgtId, {
                id: tgtId,
                filePath: (rec as { get: (k: string) => unknown }).get('tgtFp') as string ?? tgtId,
                type: (rec as { get: (k: string) => unknown }).get('tgtType') as string ?? '',
                cluster: toNum((rec as { get: (k: string) => unknown }).get('tgtCluster')),
              });
            }
            addEdge(srcId, tgtId);
          }
        }
      }
    } finally {
      await session.close();
    }

    // Always include the start node itself
    if (!nodeMap.has(fileId)) {
      nodeMap.set(fileId, { id: fileId, filePath: nodeId, type: '', cluster: 0 });
    }

    const rawNodes = Array.from(nodeMap.values());
    const truncated = rawNodes.length >= limit;

    // --- PageRank scoring ---
    const n = rawNodes.length;
    const nodeIndex = new Map(rawNodes.map((nd, i) => [nd.id, i]));
    const pageRankScores: number[] = new Array(n).fill(1 / n);

    if (n >= 2 && edges.length > 0) {
      try {
        const { pageRankGPU } = await import('$lib/server/gpu/pytorch-graph.js');
        const adj = new Float32Array(n * n); // row-major [from][to]
        for (const e of edges) {
          const src = nodeIndex.get(e.source);
          const tgt = nodeIndex.get(e.target);
          if (src !== undefined && tgt !== undefined) {
            adj[src * n + tgt] = 1;
          }
        }
        const { scores } = pageRankGPU(adj, n);
        for (let i = 0; i < n; i++) pageRankScores[i] = scores[i];
      } catch {
        // addon not loaded or OOM — leave uniform scores
      }
    }

    const nodes = rawNodes.map((nd, i) => ({
      ...nd,
      label: nd.filePath || nd.id,
      isCenter: nd.id === fileId,
      pageRankScore: pageRankScores[i],
    }));

    // For cluster mode, try to fetch the Gemma4 wiki summary from Redis
    let gemma4Summary: string | undefined;
    if (mode === 'cluster' && nodes[0]?.cluster !== undefined) {
      try {
        const { getRedis } = await import('$lib/server/redis.js');
        const redis = getRedis();
        const clId = nodes[0].cluster;
        const keys = await redis.keys(`wiki:note:dir:*`).catch(() => [] as string[]);
        for (const k of keys.slice(0, 100)) {
          const raw = await redis.get(k).catch(() => null);
          if (!raw) continue;
          try {
            const note = JSON.parse(raw) as { clusterId?: number; gemma4Summary?: string };
            if (note.clusterId === clId && note.gemma4Summary) {
              gemma4Summary = note.gemma4Summary;
              break;
            }
          } catch { /* skip */ }
        }
      } catch { /* non-fatal */ }
    }

    return json({
      nodes,
      edges,
      total: nodes.length,
      truncated,
      meta: {
        hops,
        mode,
        startNode: nodeId,
        durationMs: Date.now() - startMs,
        ...(gemma4Summary ? { gemma4Summary } : {}),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({
      nodes: [],
      edges: [],
      total: 0,
      truncated: false,
      meta: { error: msg },
    });
  }
};
