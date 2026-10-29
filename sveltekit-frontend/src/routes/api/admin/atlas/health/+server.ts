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
    const { getNeo4jDriver } = await import('$lib/server/neo4j-driver.js');
    const driver = getNeo4jDriver();
    const t = Date.now();
    const session = driver.session();
    try {
      const result = await session.run('MATCH (n) RETURN count(n) AS c LIMIT 1');
      const nodeCount = result.records[0]?.get('c')?.toNumber?.() ?? 0;
      return { ok: true, latencyMs: Date.now() - t, nodeCount };
    } finally {
      await session.close();
    }
  } catch (e) {
    return { ok: false, latencyMs: -1, detail: String(e) };
  }
}

async function checkOllama(): Promise<{ ok: boolean; latencyMs: number; detail?: string; models?: string[] }> {
  try {
    const { ENV } = await import('$lib/server/env.server.js');
    if (!ENV.OLLAMA_BASE_URL) {
      return { ok: false, latencyMs: 0, detail: 'OLLAMA_BASE_URL_NOT_CONFIGURED' };
    }
    const t = Date.now();
    const r = await fetch(`${ENV.OLLAMA_BASE_URL.replace(/\/+$/, '')}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    const data = await r.json() as any;
    const models: string[] = (data.models ?? []).map((m: any) => m.name);
    return { ok: r.ok, latencyMs: Date.now() - t, models };
  } catch (e) {
    return { ok: false, latencyMs: -1, detail: String(e) };
  }
}
