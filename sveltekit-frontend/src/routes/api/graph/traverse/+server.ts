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
import { LLM_MODEL_ID } from '$lib/server/llm/runtime-contract.js';

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

  const { nodeId, hops, mode, direction } = parsed.data;
  // Neo4j LIMIT requires a strict integer; coerce here to avoid "50.0 is not valid" error
  const limit = Math.trunc(parsed.data.limit);
  const startMs = Date.now();

  // Normalise to the real, live CodebaseFile.path convention. Found 2026-09-08: this route
  // previously matched on a `CodebaseFile.id` property that has ZERO occurrences anywhere in
  // Neo4j (confirmed directly) — `id` belongs to Packet/InteractiveSession/Outcome/SOMCluster
  // nodes, never CodebaseFile. The real, populated identity property on CodebaseFile is `path`,
  // a frontend-relative path (e.g. "src/lib/server/db/client.ts", no "sveltekit-frontend/"
  // prefix) — matches this repo's known root-prefix-alias convention (see
  // openspec/changes/parent-atlas-graph-retrieval-proof/tasks.md for the full diagnosis).
  const filePath = nodeId
    .replace(/^file:/, '')
    .replace(/^sveltekit-frontend\//, '');

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

    // CodebaseFile has no `type` property live; kept as an always-empty display field for
    // response-shape compatibility with existing consumers, not a real filter/return value.
    // `cluster` is mapped to `louvainCommunity` — chosen over the other two coexisting community
    // properties (communityId, leidenCommunity) after comparing their live size distributions
    // (2026-09-08): `communityId` is heavily degenerate (98.97% singleton communities, max size
    // 381 across 69,009 nodes — essentially a near-noop clustering), while `leidenCommunity` and
    // `louvainCommunity` are comparable to each other (max size 2,397, ~90% singletons — plausible
    // for a directed IMPORTS graph with many leaf/entry files) and `louvainCommunity` matches the
    // NetworkX/cuGraph Louvain pipeline this repo's CLAUDE.md documents as independently validated
    // (ARI/NMI agreement 1.0 against the NetworkX oracle, see the "Correction (2026-08-26)" note
    // in project-root CLAUDE.md's GPU/CPU boundary section).
    try {
      if (mode === 'ego') {
        // 1-hop both directions — run sequentially to avoid Neo4j session conflicts
        // (concurrent session.run() on the same session causes "open transaction" errors)
        const rOut = await session.run(
          `MATCH (a:CodebaseFile {path: $path})-[:IMPORTS]->(b:CodebaseFile)
           RETURN b.path AS path, b.louvainCommunity AS cluster
           LIMIT toInteger($limit)`,
          { path: filePath, limit }
        );
        const rIn = await session.run(
          `MATCH (a:CodebaseFile)-[:IMPORTS]->(b:CodebaseFile {path: $path})
           RETURN a.path AS path, a.louvainCommunity AS cluster
           LIMIT toInteger($limit)`,
          { path: filePath, limit }
        );

        for (const rec of rOut.records) {
          const p = rec.get('path') as string;
          if (p) {
            nodeMap.set(p, { id: p, filePath: p, type: '', cluster: rec.get('cluster')?.toNumber?.() ?? rec.get('cluster') ?? 0 });
            addEdge(filePath, p);
          }
        }
        for (const rec of rIn.records) {
          const p = rec.get('path') as string;
          if (p) {
            nodeMap.set(p, { id: p, filePath: p, type: '', cluster: rec.get('cluster')?.toNumber?.() ?? rec.get('cluster') ?? 0 });
            addEdge(p, filePath);
          }
        }

      } else if (mode === 'cluster') {
        // All nodes in the same community as the start node
        const r = await session.run(
          `MATCH (a:CodebaseFile {path: $path})
           MATCH (b:CodebaseFile) WHERE b.louvainCommunity = a.louvainCommunity AND b.path <> $path
           RETURN b.path AS path, b.louvainCommunity AS cluster
           LIMIT toInteger($limit)`,
          { path: filePath, limit }
        );
        for (const rec of r.records) {
          const p = rec.get('path') as string;
          if (p) {
            nodeMap.set(p, { id: p, filePath: p, type: '', cluster: rec.get('cluster')?.toNumber?.() ?? rec.get('cluster') ?? 0 });
          }
        }

      } else {
        // bfs — variable-length path up to `hops`
        // Run sequentially to avoid Neo4j session conflicts from concurrent session.run()
        const hopStr = `1..${hops}`;
        const results: unknown[] = [];

        if (direction === 'imports' || direction === 'both') {
          results.push(await session.run(
            `MATCH (a:CodebaseFile {path: $path})-[:IMPORTS*${hopStr}]->(b:CodebaseFile)
             WITH a, b
             MATCH p=(a)-[:IMPORTS*${hopStr}]->(b)
             UNWIND relationships(p) AS rel
             WITH startNode(rel) AS src, endNode(rel) AS tgt
             RETURN DISTINCT
               src.path AS srcPath, src.louvainCommunity AS srcCluster,
               tgt.path AS tgtPath, tgt.louvainCommunity AS tgtCluster
             LIMIT toInteger($limit)`,
            { path: filePath, limit }
          ));
        }

        if (direction === 'importedBy' || direction === 'both') {
          results.push(await session.run(
            `MATCH (b:CodebaseFile)-[:IMPORTS*${hopStr}]->(a:CodebaseFile {path: $path})
             WITH a, b
             MATCH p=(b)-[:IMPORTS*${hopStr}]->(a)
             UNWIND relationships(p) AS rel
             WITH startNode(rel) AS src, endNode(rel) AS tgt
             RETURN DISTINCT
               src.path AS srcPath, src.louvainCommunity AS srcCluster,
               tgt.path AS tgtPath, tgt.louvainCommunity AS tgtCluster
             LIMIT toInteger($limit)`,
            { path: filePath, limit }
          ));
        }
        for (const r of results) {
          for (const rec of (r as { records: unknown[] }).records) {
            const srcPath = (rec as { get: (k: string) => unknown }).get('srcPath') as string;
            const tgtPath = (rec as { get: (k: string) => unknown }).get('tgtPath') as string;
            if (!srcPath || !tgtPath) continue;

            const toNum = (v: unknown) =>
              v != null && typeof (v as { toNumber?: () => number }).toNumber === 'function'
                ? (v as { toNumber: () => number }).toNumber()
                : (v as number) ?? 0;

            if (!nodeMap.has(srcPath)) {
              nodeMap.set(srcPath, {
                id: srcPath,
                filePath: srcPath,
                type: '',
                cluster: toNum((rec as { get: (k: string) => unknown }).get('srcCluster')),
              });
            }
            if (!nodeMap.has(tgtPath)) {
              nodeMap.set(tgtPath, {
                id: tgtPath,
                filePath: tgtPath,
                type: '',
                cluster: toNum((rec as { get: (k: string) => unknown }).get('tgtCluster')),
              });
            }
            addEdge(srcPath, tgtPath);
          }
        }
      }
    } finally {
      await session.close();
    }

    // Always include the start node itself
    if (!nodeMap.has(filePath)) {
      nodeMap.set(filePath, { id: filePath, filePath, type: '', cluster: 0 });
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
      isCenter: nd.id === filePath,
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

      // Mirror the cluster summary into code-llm-index keyed on cluster:N path,
      // so ACE preflight and bulk-lookup paths can hit it without scanning
      // wiki:note:dir:* keys. Fire-and-forget — never blocks the response.
      if (gemma4Summary && nodes[0]?.cluster !== undefined) {
        const clId = Number(nodes[0].cluster);
        // Use recordKagAnswer (D19): cluster summaries are KAG-style graph
        // traversal answers — auto-extracts 1-3 sentence summary into the
        // structured outputMeta JSONB envelope so ACE preflight can render
        // a PRIOR ANSWER preamble for any file in this cluster.
        void import('$lib/server/cache/code-llm-index.js')
          .then(({ recordKagAnswer }) =>
            recordKagAnswer(`cluster:${clId}`, gemma4Summary!, {
              glyphClusterId: clId,
              tokensUsed:     Math.ceil(gemma4Summary!.length / 4),
              model:          LLM_MODEL_ID,
            })
          )
          .catch(() => null);
      }
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
