/**
 * Bag-of-Words texture tile cache.
 *
 * Redis key layout:
 *   texture:bow:chunk:<chunkId>          packed tile for a single chunk
 *   texture:bow:cluster:<clusterId>      merged tile for a GPU cluster
 *   texture:bow:som:<x>:<y>              merged tile for a SOM cell
 *   rpc:remote-function:getBagOfWordsTexture:v1:<hash>  RPC envelope
 *
 * All keys expire after BOW_TTL_SECONDS (default 1 h).
 * Tiles are stored as JSON strings; weights are 32-bit floats serialised
 * as plain JS numbers (sufficient precision for cosine scoring).
 */

import { createHash } from 'crypto';
import { getRedis } from '$lib/server/redis.js';

export interface BowTextureTile {
  tileId: string;
  clusterId?: number;
  som?: { x: number; y: number };
  terms: string[];
  weights: number[];
  sourceChunkIds: string[];
  updatedAt: string;
}

const BOW_TTL_SECONDS = 3600;

// ── key builders ─────────────────────────────────────────────────────────────

export function chunkBowKey(chunkId: string) {
  return `texture:bow:chunk:${chunkId}`;
}
export function clusterBowKey(clusterId: number) {
  return `texture:bow:cluster:${clusterId}`;
}
export function somBowKey(x: number, y: number) {
  return `texture:bow:som:${x}:${y}`;
}

// ── low-level read / write ────────────────────────────────────────────────────

export async function getBowTile(key: string): Promise<BowTextureTile | null> {
  const redis = getRedis();
  const raw = await redis.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BowTextureTile;
  } catch {
    return null;
  }
}

export async function setBowTile(
  key: string,
  tile: BowTextureTile,
  ttlSeconds = BOW_TTL_SECONDS
): Promise<void> {
  const redis = getRedis();
  await redis.setex(key, ttlSeconds, JSON.stringify(tile));
}

// ── named helpers ─────────────────────────────────────────────────────────────

export async function getBowTextureFromRedis(
  chunkId: string
): Promise<BowTextureTile | null> {
  return getBowTile(chunkBowKey(chunkId));
}

export async function setBowTextureToRedis(
  tile: BowTextureTile,
  ttlSeconds = BOW_TTL_SECONDS
): Promise<void> {
  await setBowTile(chunkBowKey(tile.tileId), tile, ttlSeconds);
}

export async function getClusterBowTexture(
  clusterId: number
): Promise<BowTextureTile | null> {
  return getBowTile(clusterBowKey(clusterId));
}

export async function getSomBowTexture(
  x: number,
  y: number
): Promise<BowTextureTile | null> {
  return getBowTile(somBowKey(x, y));
}

// ── extraction ────────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'a','an','and','are','as','at','be','been','but','by','do','for','from',
  'has','have','he','her','his','if','in','is','it','its','not','of','on',
  'or','our','out','so','that','the','their','them','then','there','they',
  'this','to','up','was','we','were','which','will','with','you','your',
]);

export function buildBowTextureForChunk(
  chunkId: string,
  text: string,
  opts?: {
    clusterId?: number;
    som?: { x: number; y: number };
    maxTerms?: number;
    minLen?: number;
  }
): BowTextureTile {
  const maxTerms = opts?.maxTerms ?? 64;
  const minLen   = opts?.minLen   ?? 3;

  const freq = new Map<string, number>();
  for (const raw of text.toLowerCase().split(/\W+/)) {
    const t = raw.trim();
    if (t.length < minLen || STOP_WORDS.has(t)) continue;
    freq.set(t, (freq.get(t) ?? 0) + 1);
  }

  const sorted = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxTerms);

  const total = sorted.reduce((s, [, c]) => s + c, 0) || 1;
  const terms   = sorted.map(([t]) => t);
  const weights = sorted.map(([, c]) => c / total);

  return {
    tileId: chunkId,
    clusterId: opts?.clusterId,
    som: opts?.som,
    terms,
    weights,
    sourceChunkIds: [chunkId],
    updatedAt: new Date().toISOString(),
  };
}

// ── merge helpers ─────────────────────────────────────────────────────────────

export function mergeBowTiles(tiles: BowTextureTile[], tileId: string): BowTextureTile {
  const freq = new Map<string, number>();
  for (const tile of tiles) {
    for (let i = 0; i < tile.terms.length; i++) {
      const t = tile.terms[i];
      const w = tile.weights[i] ?? 0;
      freq.set(t, (freq.get(t) ?? 0) + w);
    }
  }
  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 128);
  const total  = sorted.reduce((s, [, w]) => s + w, 0) || 1;

  return {
    tileId,
    terms:          sorted.map(([t]) => t),
    weights:        sorted.map(([, w]) => w / total),
    sourceChunkIds: tiles.flatMap(t => t.sourceChunkIds),
    updatedAt:      new Date().toISOString(),
  };
}

// ── RPC args hash (mirrors server/cache/rpc-cache.ts convention) ──────────────

export function bowArgsHash(args: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(args))
    .digest('hex')
    .slice(0, 16);
}

export function bowRpcKey(args: unknown) {
  return `rpc:remote-function:getBagOfWordsTexture:v1:${bowArgsHash(args)}`;
}
