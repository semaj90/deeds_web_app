import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';
import { generateEmbeddings } from '$lib/server/grpc/embedding-client.js';
import { qdrant } from '$lib/server/vector/qdrant-manager.js';
import { getRedis } from '$lib/server/redis.js';
import { readWikiCard } from '$lib/server/wiki/wiki-couchdb-client.js';

const bodySchema = z.object({
  query: z.string().min(2).max(2000),
  limit: z.number().int().min(1).max(25).default(10),
  lanes: z.array(z.enum(['semantic', 'kag', 'wide'])).optional().default(['semantic', 'kag', 'wide']),
});

type LaneHit = {
  id: string;
  score: number;
  lane: string;
  payload: Record<string, unknown>;
};

function dirKey(dir: string) {
  return `wiki:note:dir:${dir.replace(/\//g, ':')}`;
}

function toMinifiedSummary(value: unknown) {
  if (typeof value === 'string') return value.slice(0, 300);
  return '';
}

async function loadCluster(queryVector: number[] | null) {
  if (!queryVector) return null;

  try {
    const redis = getRedis();
    const manifoldRaw = await redis.get('cluster:kmeans:k20:manifold4:all').catch(() => null);
    const centroidsRaw = await redis.get('cluster:kmeans:k20:centroids').catch(() => null);
    if (!manifoldRaw || !centroidsRaw) return null;

    const manifold4 = JSON.parse(manifoldRaw) as Array<{ topoLabel?: string; somRow?: number; somCol?: number }>;
    const centroids = JSON.parse(centroidsRaw) as number[][];
    let bestCluster = -1;
    let bestSim = -Infinity;

    for (let i = 0; i < centroids.length; i++) {
      const centroid = centroids[i];
      if (!centroid || centroid.length !== queryVector.length) continue;

      let dot = 0;
      for (let d = 0; d < queryVector.length; d++) dot += queryVector[d] * centroid[d];
      if (dot > bestSim) {
        bestSim = dot;
        bestCluster = i;
      }
    }

    if (bestCluster < 0) return null;
    return {
      id: bestCluster,
      sim: bestSim,
      topoLabel: manifold4[bestCluster]?.topoLabel,
      somRow: manifold4[bestCluster]?.somRow,
      somCol: manifold4[bestCluster]?.somCol,
    };
  } catch {
    return null;
  }
}

async function turboVecPrefilter(queryVector: number[] | null, limit: number) {
  if (!queryVector) return { enabled: false, ids: [] as string[] };

  const sidecarUrl = ENV.TURBOVEC_SIDECAR;
  try {
    const res = await fetch(`${sidecarUrl}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vector: queryVector.slice(0, 64), k: limit * 5 }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { enabled: false, ids: [] as string[] };
    const data = await res.json();
    return { enabled: true, ids: Array.isArray(data.ids) ? data.ids.map((id: unknown) => String(id)) : [] };
  } catch {
    return { enabled: false, ids: [] as string[] };
  }
}

async function enrichWiki(results: LaneHit[]) {
  const redis = getRedis();
  let hits = 0;

  for (const result of results) {
    const dir = String(result.payload?.dir ?? result.payload?.directoryPath ?? '');
    if (!dir) continue;

    try {
      const cached = await redis.get(dirKey(dir)).catch(() => null);
      if (cached) {
        result.payload._wikiNote = JSON.parse(cached);
        hits++;
        continue;
      }

      const card = await readWikiCard(dir).catch(() => null);
      if (card) {
        result.payload._wikiNote = card;
        hits++;
      }
    } catch {
      // Non-fatal enrichment.
    }
  }

  return hits;
}

async function synthesizeSummary(packet: Record<string, unknown>) {
  try {
    const res = await fetch(`${ENV.BIFROST_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ENV.TURBOQUANT_URL ? 'gemma4-legal:latest' : ENV.OLLAMA_CHAT_MODEL,
        temperature: 0.2,
        stream: false,
        messages: [
          {
            role: 'system',
            content: 'Summarize retrieval results in 3 bullets and 1 next action. Keep it terse.',
          },
          { role: 'user', content: JSON.stringify(packet) },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? null;
  } catch {
    return null;
  }
}

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    throw error(401, 'Unauthorized');
  }

  let parsed;
  try {
    parsed = bodySchema.safeParse(await request.json());
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!parsed.success) {
    return json({ ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }

  const { query, limit, lanes } = parsed.data;
  const startedAt = Date.now();

  let queryVector: number[] | null = null;
  try {
    const embedding = await generateEmbeddings([query]);
    queryVector = embedding.vectors?.[0] ?? null;
  } catch {
    queryVector = null;
  }

  const cluster = await loadCluster(queryVector);
  const prefilter = await turboVecPrefilter(queryVector, limit);
  const prefilterSet = new Set(prefilter.ids);

  const allResults: LaneHit[] = [];
  const denseLimit = Math.min(limit * 3, 50);

  const searchTasks: Promise<void>[] = [];

  if (queryVector && lanes.includes('semantic')) {
    searchTasks.push(
      qdrant
        .hybridSearch({
          query,
          queryEmbedding: queryVector,
          collection: 'codebase_chunks_768',
          limit: denseLimit,
          filters: cluster ? { must: [{ key: 'gpuCluster', match: { value: cluster.id } }] } : undefined,
        })
        .then((result) => {
          for (const hit of result.results) {
            allResults.push({
              id: String(hit.id),
              score: hit.score,
              lane: 'semantic',
              payload: (hit.payload ?? {}) as Record<string, unknown>,
            });
          }
        })
        .catch(() => {})
    );
  }

  if (queryVector && lanes.includes('kag')) {
    searchTasks.push(
      qdrant
        .hybridSearch({
          query,
          queryEmbedding: queryVector,
          collection: 'glyph_atlas',
          limit: Math.max(3, Math.ceil(limit / 2)),
        })
        .then((result) => {
          for (const hit of result.results) {
            allResults.push({
              id: String(hit.id),
              score: hit.score,
              lane: 'kag',
              payload: (hit.payload ?? {}) as Record<string, unknown>,
            });
          }
        })
        .catch(() => {})
    );
  }

  await Promise.all(searchTasks);

  if (lanes.includes('wide') && allResults.length < 3 && queryVector) {
    try {
      const fallback = await qdrant.hybridSearch({
        query,
        queryEmbedding: queryVector,
        collection: 'codebase_chunks_768',
        limit: denseLimit,
      });
      for (const hit of fallback.results) {
        allResults.push({
          id: String(hit.id),
          score: hit.score,
          lane: 'wide',
          payload: (hit.payload ?? {}) as Record<string, unknown>,
        });
      }
    } catch {}
  }

  const scoreMap = new Map<string, number>();
  const payloadMap = new Map<string, Record<string, unknown>>();
  const laneMap = new Map<string, string[]>();

  for (const hit of allResults) {
    const id = String(hit.id);
    const base = scoreMap.get(id) ?? 0;
    const boosted = hit.score + (prefilterSet.has(id) ? 0.1 : 0) + ((hit.payload.pageRank as number | undefined) ?? 0) * 0.15;
    scoreMap.set(id, Math.max(base, boosted) + (scoreMap.has(id) ? 0.05 : 0));
    if (!payloadMap.has(id)) payloadMap.set(id, hit.payload);
    const existingLanes = laneMap.get(id) ?? [];
    if (!existingLanes.includes(hit.lane)) existingLanes.push(hit.lane);
    laneMap.set(id, existingLanes);
  }

  const ranked = [...scoreMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id, score]) => ({
      id,
      score: +score.toFixed(4),
      lanes: laneMap.get(id) ?? [],
      prefilterHit: prefilterSet.has(id),
      payload: payloadMap.get(id) ?? {},
    }));

  const wikiHits = await enrichWiki(ranked as unknown as LaneHit[]);

  const packet = {
    query,
    lanes,
    ts: new Date().toISOString(),
    cluster,
    turbovecPrefilter: prefilter.enabled,
    turbovecCandidates: prefilter.ids.slice(0, Math.min(prefilter.ids.length, limit * 5)),
    results: ranked.map((r) => ({
      id: r.id,
      score: r.score,
      lanes: r.lanes,
      prefilterHit: r.prefilterHit,
      filePath: r.payload?.filePath ?? r.payload?.relativePath,
      dir: r.payload?.dir ?? r.payload?.directoryPath,
      summary: toMinifiedSummary(r.payload?.summary ?? r.payload?.content),
      wikiNote: toMinifiedSummary((r.payload?._wikiNote as { summary?: string } | undefined)?.summary),
      pageRank: r.payload?.pageRank ?? r.payload?.authority_score,
      gpuCluster: r.payload?.gpuCluster,
      topoClass: r.payload?.topoClass ?? r.payload?.topo_class,
    })),
  };

  const bitfrostSummary = await synthesizeSummary(packet as Record<string, unknown>);

  return json({
    ok: true,
    packet,
    bitfrostSummary,
    timing: {
      totalMs: Date.now() - startedAt,
    },
    stats: {
      totalResults: ranked.length,
      wikiHits,
      cluster: cluster?.id ?? null,
      turboVec: prefilter.enabled,
    },
  });
};
