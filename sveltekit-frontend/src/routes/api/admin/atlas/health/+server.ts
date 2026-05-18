import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const checks = await Promise.allSettled([
    checkRedis(),
    checkQdrant(),
    checkNeo4j(),
    checkOllama(),
  ]);

  const [redis, qdrant, neo4j, ollama] = checks.map((r) =>
    r.status === 'fulfilled' ? r.value : { ok: false, latencyMs: -1, detail: String((r as any).reason) }
  );

  return json({ redis, qdrant, neo4j, ollama, timestamp: new Date().toISOString() });
};

async function checkRedis(): Promise<{ ok: boolean; latencyMs: number; detail?: string }> {
  try {
    const { getRedis } = await import('$lib/server/redis.js');
    const t = Date.now();
    const r = getRedis();
    await r.ping();
    return { ok: true, latencyMs: Date.now() - t };
  } catch (e) {
    return { ok: false, latencyMs: -1, detail: String(e) };
  }
}

async function checkQdrant(): Promise<{ ok: boolean; latencyMs: number; detail?: string; collections?: string[]; points?: Record<string, number> }> {
  try {
    const { ENV } = await import('$lib/server/env.server.js');
    const t = Date.now();
    const r = await fetch(`${ENV.QDRANT_URL}/collections`, { signal: AbortSignal.timeout(3000) });
    const data = await r.json() as any;
    const collections: string[] = (data.result?.collections ?? []).map((c: any) => c.name);
    
    const points: Record<string, number> = {};
    for (const col of ['codebase_chunks_768', 'llm_wiki_chunks', 'parents_atlas_chunks']) {
      try {
        const detailRes = await fetch(`${ENV.QDRANT_URL}/collections/${col}`, { signal: AbortSignal.timeout(1000) });
        if (detailRes.ok) {
          const detailData = await detailRes.json() as any;
          if (detailData?.result?.points_count !== undefined) {
            points[col] = detailData.result.points_count;
          }
        }
      } catch { /* skip */ }
    }

    return { ok: r.ok, latencyMs: Date.now() - t, collections, points };
  } catch (e) {
    return { ok: false, latencyMs: -1, detail: String(e) };
  }
}

async function checkNeo4j(): Promise<{ ok: boolean; latencyMs: number; detail?: string; nodeCount?: number }> {
  try {
    const neo4j = await import('neo4j-driver');
    const { ENV } = await import('$lib/server/env.server.js');
    const driver = neo4j.default.driver(
      ENV.NEO4J_URI ?? 'bolt://localhost:7687',
      neo4j.default.auth.basic(ENV.NEO4J_USER ?? 'neo4j', ENV.NEO4J_PASSWORD ?? 'password')
    );
    const t = Date.now();
    const session = driver.session();
    const result = await session.run('MATCH (n) RETURN count(n) AS c LIMIT 1');
    const nodeCount = result.records[0]?.get('c')?.toNumber?.() ?? 0;
    await session.close();
    await driver.close();
    return { ok: true, latencyMs: Date.now() - t, nodeCount };
  } catch (e) {
    return { ok: false, latencyMs: -1, detail: String(e) };
  }
}

async function checkOllama(): Promise<{ ok: boolean; latencyMs: number; detail?: string; models?: string[] }> {
  try {
    const { ENV } = await import('$lib/server/env.server.js');
    const t = Date.now();
    const r = await fetch(`${ENV.OLLAMA_URL ?? 'http://localhost:11434'}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    const data = await r.json() as any;
    const models: string[] = (data.models ?? []).map((m: any) => m.name);
    return { ok: r.ok, latencyMs: Date.now() - t, models };
  } catch (e) {
    return { ok: false, latencyMs: -1, detail: String(e) };
  }
}
