/**
 * atlas-loader — single point that pulls the YoRHa Knowledge Atlas + its
 * Redis-cached neighbours (KAG notes, authority hash, Karpathy GPU scores)
 * into one in-memory object the prompt-engineering layer can read.
 *
 * Cold load via Redis: ~5ms (atlas.min.json is ~570 KB).
 * Warm hit (per-process cache): ~0ms.
 *
 * Falls back to filesystem (`docs/atlas-index/codebase-atlas.min.json`) when
 * Redis is unavailable, then to a stub when neither is reachable. Every
 * downstream caller can assume `loadAtlas()` returns a valid object — the
 * shape is constant even when data is sparse.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Redis } from 'ioredis';
import { getRedis } from '$lib/server/redis.js';
import {
  type AtlasIndex,
  atlasIndexSchema,
} from './types.js';

const REDIS_KEY         = 'ace:atlas:latest';
const REDIS_KEY_SUMMARY = 'ace:atlas:latest:summary';
const FS_FALLBACK       = resolve(process.cwd(), 'docs/atlas-index/codebase-atlas.min.json');

interface AtlasNeighbourCache {
  /** Top-200 graphAuthority hash from `ace:authority:top`. */
  authority: Record<string, { ga: number; pr?: number; cluster?: string } | string>;
  /** Karpathy GPU blend hash from `gpu:karpathy:scores`. */
  karpathy:  Record<string, { pr: number; attn: number; authority: number; blend: number } | string>;
}

let _atlas:       AtlasIndex          | null = null;
let _neighbours:  AtlasNeighbourCache | null = null;
let _loadedAt:    number              = 0;
const TTL_MS = 5 * 60_000;  // re-read after 5 min so a fresh atlas:build is picked up

async function loadAtlasFromRedis(redis: Redis): Promise<AtlasIndex | null> {
  const raw = await redis.get(REDIS_KEY).catch(() => null);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return atlasIndexSchema.parse(parsed);
  } catch {
    return null;
  }
}

async function loadAtlasFromFs(): Promise<AtlasIndex | null> {
  try {
    const raw    = await readFile(FS_FALLBACK, 'utf8');
    const parsed = JSON.parse(raw);
    return atlasIndexSchema.parse(parsed);
  } catch {
    return null;
  }
}

function emptyAtlas(): AtlasIndex {
  return {
    v: 1,
    generated_at: new Date(0).toISOString(),
    hours_window: 168,
    schema: ['f','tc','tb','c','pr','ga','h','rs','a','rules','tools','tags'],
    files: [],
    indices: { by_cluster: {}, by_topo_class: {}, by_agents_dir: {} },
    stats: {
      files: 0, clusters: 0, topo_classes: 0, agents_dirs: 0,
      with_authority: 0, with_hits: 0, build_ms: 0,
    },
  };
}

async function loadNeighbours(redis: Redis): Promise<AtlasNeighbourCache> {
  const [authority, karpathy] = await Promise.all([
    redis.hgetall('ace:authority:top').catch(() => ({})),
    redis.hgetall('gpu:karpathy:scores').catch(() => ({})),
  ]);

  // Values may be JSON strings or plain — keep them as-is; the prompt mapper
  // decodes per-call. Saves ~2ms not parsing every entry up front.
  return {
    authority: authority as AtlasNeighbourCache['authority'],
    karpathy:  karpathy  as AtlasNeighbourCache['karpathy'],
  };
}

/**
 * Public entry. Fast path: returns cached (in-process) atlas if loaded
 * within TTL_MS. Slow path: reads Redis, falls back to filesystem,
 * finally returns an empty stub. Always returns a valid AtlasIndex.
 */
export async function loadAtlas(forceReload = false): Promise<{
  atlas:      AtlasIndex;
  neighbours: AtlasNeighbourCache;
  source:     'cache' | 'redis' | 'fs' | 'empty';
}> {
  if (!forceReload && _atlas && _neighbours && Date.now() - _loadedAt < TTL_MS) {
    return { atlas: _atlas, neighbours: _neighbours, source: 'cache' };
  }

  let redis: Redis | null = null;
  try {
    redis = getRedis();
  } catch { /* fall through to fs */ }

  const atlas = (redis && (await loadAtlasFromRedis(redis)))
             ?? (await loadAtlasFromFs())
             ?? emptyAtlas();

  const neighbours = redis
    ? await loadNeighbours(redis)
    : { authority: {}, karpathy: {} };

  _atlas      = atlas;
  _neighbours = neighbours;
  _loadedAt   = Date.now();

  const source: 'redis' | 'fs' | 'empty' =
    atlas.files.length === 0 ? 'empty'
    : redis                  ? 'redis'
    :                          'fs';

  return { atlas, neighbours, source };
}

/** Best-effort summary read — useful for health probes and skill banners. */
export async function loadAtlasSummary(): Promise<{
  generated_at: string;
  files:        number;
  clusters:     number;
  topo_classes: number;
  agents_dirs:  number;
} | null> {
  try {
    const redis = getRedis();
    const raw   = await redis.get(REDIS_KEY_SUMMARY).catch(() => null);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Force a re-read on the next loadAtlas() call. */
export function invalidateAtlas(): void {
  _atlas      = null;
  _neighbours = null;
  _loadedAt   = 0;
}
