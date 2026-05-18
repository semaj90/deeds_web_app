import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const limit = Math.min(Number(url.searchParams.get('limit') ?? '50'), 200);
  const cluster = url.searchParams.get('cluster') ?? undefined;

  const nodes: any[] = [];
  const edges: any[] = [];

  try {
    // Pull top-N from Karpathy blend scores (Redis gpu:karpathy:scores)
    const { getRedis } = await import('$lib/server/redis.js');
    const redis = getRedis();
    const rawScores = await redis.hgetall('gpu:karpathy:scores').catch(() => ({}));

    const scored = Object.entries(rawScores)
      .map(([path, raw]) => {
        try {
          const s = JSON.parse(raw as string) as { pr: number; attn: number; authority: number; blend: number };
          return { path, ...s };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => (b!.blend ?? 0) - (a!.blend ?? 0))
      .slice(0, limit);

    const pathSet = new Set(scored.map((s) => s!.path));

    // Build nodes from scored paths
    for (const s of scored) {
      if (!s) continue;
      nodes.push({
        id: s.path,
        label: s.path.split('/').pop() ?? s.path,
        path: s.path,
        blend: s.blend,
        pr: s.pr,
        attn: s.attn,
        authority: s.authority,
        group: cluster ?? deriveGroup(s.path),
      });
    }

    // Pull IMPORTS edges from Neo4j (top-N nodes only — bounded query)
    try {
      const neo4j = await import('neo4j-driver');
      const { ENV } = await import('$lib/server/env.server.js');
      const driver = neo4j.default.driver(
        ENV.NEO4J_URI ?? 'bolt://localhost:7687',
        neo4j.default.auth.basic(ENV.NEO4J_USER ?? 'neo4j', ENV.NEO4J_PASSWORD ?? 'password')
      );
      const session = driver.session();
      const paths = [...pathSet].slice(0, 40);
      const result = await session.run(
        `UNWIND $paths AS p
         MATCH (a:CodebaseFile {filePath: p})-[r:IMPORTS]->(b:CodebaseFile)
         WHERE b.filePath IN $paths
         RETURN a.filePath AS src, b.filePath AS tgt, type(r) AS rel LIMIT 200`,
        { paths }
      );
      for (const rec of result.records) {
        edges.push({ source: rec.get('src'), target: rec.get('tgt'), type: rec.get('rel') });
      }
      await session.close();
      await driver.close();
    } catch {
      // Neo4j offline — return nodes only
    }
  } catch (e) {
    return json({ nodes: [], edges: [], error: String(e) });
  }

  return json({ nodes, edges, total: nodes.length });
};

function deriveGroup(path: string): string {
  if (path.includes('/server/')) return 'server';
  if (path.includes('/routes/')) return 'routes';
  if (path.includes('/lib/')) return 'lib';
  if (path.includes('/scripts/')) return 'scripts';
  return 'other';
}
