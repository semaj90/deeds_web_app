/**
 * POST /api/graph/bow-texture
 *
 * Returns a BowTextureTile for a chunk, cluster, or SOM cell.
 * Cache hierarchy:
 *   1. RPC envelope key  rpc:remote-function:getBagOfWordsTexture:v1:<hash>
 *   2. Specific tile key texture:bow:{chunk|cluster|som}:*
 *   3. Build from Qdrant codebase_chunks_768 payload tags/chunk text
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import {
  bowRpcKey,
  getBowTile,
  setBowTile,
  buildBowTextureForChunk,
  mergeBowTiles,
  clusterBowKey,
  somBowKey,
  chunkBowKey,
  type BowTextureTile,
} from '$lib/server/langextract/bag-cache.js';
import { getRedis } from '$lib/server/redis.js';

const bodySchema = z.union([
  z.object({ chunkId: z.string().min(1).max(500), clusterId: z.number().optional(), som: z.object({ x: z.number(), y: z.number() }).optional() }),
  z.object({ clusterId: z.number() }),
  z.object({ som: z.object({ x: z.number(), y: z.number() }) }),
]);

const RPC_TTL = 3600;

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ tile: null, cache: { hit: false, key: '', ttlSeconds: 0 } }, { status: 401 });
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return json({ tile: null, cache: { hit: false, key: '', ttlSeconds: 0 } }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return json({ tile: null, cache: { hit: false, key: '', ttlSeconds: 0 } }, { status: 400 });
  }

  const args = parsed.data;
  const rpcKey = bowRpcKey(args);

  // 1. RPC envelope cache
  const redis = getRedis();
  const cached = await redis.get(rpcKey).catch(() => null);
  if (cached) {
    try {
      const tile = JSON.parse(cached) as BowTextureTile;
      return json({ tile, cache: { hit: true, key: rpcKey, ttlSeconds: RPC_TTL } });
    } catch { /* fall through */ }
  }

  let tile: BowTextureTile | null = null;

  // 2. Specific tile cache
  if ('chunkId' in args) {
    tile = await getBowTile(chunkBowKey(args.chunkId));
  } else if ('clusterId' in args) {
    tile = await getBowTile(clusterBowKey(args.clusterId));
  } else if ('som' in args) {
    tile = await getBowTile(somBowKey(args.som.x, args.som.y));
  }

  // 3. Build from Qdrant
  if (!tile) {
    tile = await buildFromQdrant(args);
  }

  if (!tile) {
    return json({ tile: null, cache: { hit: false, key: rpcKey, ttlSeconds: 0 } });
  }

  // Store under RPC key
  await redis.setex(rpcKey, RPC_TTL, JSON.stringify(tile)).catch(() => null);

  return json({ tile, cache: { hit: false, key: rpcKey, ttlSeconds: RPC_TTL } });
};

async function buildFromQdrant(args: z.infer<typeof bodySchema>): Promise<BowTextureTile | null> {
  try {
    const { getQdrantClient } = await import('$lib/server/vector/qdrant-singleton.js');
    const qdrant = getQdrantClient();

    if ('chunkId' in args) {
      const res = await (qdrant as { retrieve: (col: string, opts: unknown) => Promise<{ id: string; payload?: Record<string, unknown> }[]> })
        .retrieve('codebase_chunks_768', { ids: [args.chunkId], with_payload: true });
      const pt = res[0];
      if (!pt?.payload) return null;
      const text = [
        ...(pt.payload.tags as string[] ?? []),
        String(pt.payload.chunkText ?? pt.payload.content ?? ''),
      ].join(' ');
      const tile = buildBowTextureForChunk(args.chunkId, text, {
        clusterId: args.clusterId ?? (pt.payload.gpuCluster as number | undefined),
        som: args.som ?? (pt.payload.som_bmu_col !== undefined
          ? { x: pt.payload.som_bmu_col as number, y: pt.payload.som_bmu_row as number }
          : undefined),
      });
      await setBowTile(chunkBowKey(args.chunkId), tile);
      return tile;
    }

    if ('clusterId' in args) {
      const res = await (qdrant as { scroll: (col: string, opts: unknown) => Promise<{ points: { id: string; payload?: Record<string, unknown> }[] }> })
        .scroll('codebase_chunks_768', {
          filter: { must: [{ key: 'gpuCluster', match: { value: args.clusterId } }] },
          limit: 200,
          with_payload: true,
        });
      const tiles = (res.points ?? []).map(pt => {
        const text = [
          ...(pt.payload?.tags as string[] ?? []),
          String(pt.payload?.chunkText ?? pt.payload?.content ?? ''),
        ].join(' ');
        return buildBowTextureForChunk(String(pt.id), text);
      });
      if (!tiles.length) return null;
      const merged = mergeBowTiles(tiles, `cluster:${args.clusterId}`);
      merged.clusterId = args.clusterId;
      await setBowTile(clusterBowKey(args.clusterId), merged);
      return merged;
    }

    if ('som' in args) {
      const { x, y } = args.som;
      const res = await (qdrant as { scroll: (col: string, opts: unknown) => Promise<{ points: { id: string; payload?: Record<string, unknown> }[] }> })
        .scroll('codebase_chunks_768', {
          filter: { must: [
            { key: 'som_bmu_col', match: { value: x } },
            { key: 'som_bmu_row', match: { value: y } },
          ] },
          limit: 100,
          with_payload: true,
        });
      const tiles = (res.points ?? []).map(pt => {
        const text = [
          ...(pt.payload?.tags as string[] ?? []),
          String(pt.payload?.chunkText ?? pt.payload?.content ?? ''),
        ].join(' ');
        return buildBowTextureForChunk(String(pt.id), text);
      });
      if (!tiles.length) return null;
      const merged = mergeBowTiles(tiles, `som:${x}:${y}`);
      merged.som = { x, y };
      await setBowTile(somBowKey(x, y), merged);
      return merged;
    }
  } catch {
    // Qdrant unavailable — return null, caller returns empty tile response
  }
  return null;
}
