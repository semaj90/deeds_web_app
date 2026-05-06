/**
 * tensor-similarity-cache.ts  — Commit 4: feat(cache)
 *
 * Redis pipeline-batched cache for three hot paths:
 *   1. Embedding tensors by contentHash   → "embed:v1:{hash}"    (2h TTL)
 *   2. Centroid member lists by clusterId → "centroid:v1:{id}"   (30min TTL)
 *   3. Similarity results by query+cluster→ "sim:v1:{qh}:{ck}"   (5min TTL)
 *
 * Keys use sha1 prefixes to keep Redis memory compact.
 * All writes go through Redis pipeline to minimise round-trips.
 */

import { createHash } from 'node:crypto';
import { getRedis } from '$lib/server/redis.js';

// ── TTLs ────────────────────────────────────────────────────────────────────
const TTL_EMBED_S      = 7_200;   // 2h  — embeddings are expensive (Ollama/GPU)
const TTL_CENTROID_S   = 1_800;   // 30m — cluster membership changes rarely
const TTL_SIMILARITY_S = 300;     // 5m  — scores can vary with index updates

// ── Key helpers ──────────────────────────────────────────────────────────────

function sha1Hex(s: string): string {
  return createHash('sha1').update(s).digest('hex');
}

export function embedCacheKey(contentHash: string): string {
  return `embed:v1:${contentHash}`;
}

export function centroidCacheKey(clusterId: number): string {
  return `centroid:v1:${clusterId}`;
}

export function simCacheKey(queryHash: string, clusterKey: string): string {
  return `sim:v1:${sha1Hex(queryHash + ':' + clusterKey)}`;
}

// ── Encoding ─────────────────────────────────────────────────────────────────

function float32ToBase64(arr: Float32Array): string {
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).toString('base64');
}

function base64ToFloat32(b64: string): Float32Array {
  const buf = Buffer.from(b64, 'base64');
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

// ── Embedding tensor cache ────────────────────────────────────────────────────

export async function getEmbedding(contentHash: string): Promise<Float32Array | null> {
  try {
    const redis = getRedis();
    const raw = await redis.get(embedCacheKey(contentHash));
    if (!raw) return null;
    return base64ToFloat32(raw);
  } catch { return null; }
}

export async function setEmbedding(contentHash: string, vec: Float32Array): Promise<void> {
  try {
    const redis = getRedis();
    await redis.setex(embedCacheKey(contentHash), TTL_EMBED_S, float32ToBase64(vec));
  } catch { /* non-fatal */ }
}

/**
 * Batch read: returns a Map<contentHash, Float32Array>.
 * Missing keys are absent from the map.
 */
export async function mgetEmbeddings(hashes: string[]): Promise<Map<string, Float32Array>> {
  if (!hashes.length) return new Map();
  try {
    const redis = getRedis();
    const keys = hashes.map(embedCacheKey);
    const values = await redis.mget(...keys);
    const result = new Map<string, Float32Array>();
    for (let i = 0; i < hashes.length; i++) {
      if (values[i]) result.set(hashes[i], base64ToFloat32(values[i]!));
    }
    return result;
  } catch { return new Map(); }
}

/**
 * Batch write via pipeline.
 */
export async function pipelineSetEmbeddings(
  entries: Array<{ contentHash: string; vec: Float32Array }>
): Promise<void> {
  if (!entries.length) return;
  try {
    const redis = getRedis();
    const pipeline = redis.pipeline();
    for (const { contentHash, vec } of entries) {
      pipeline.setex(embedCacheKey(contentHash), TTL_EMBED_S, float32ToBase64(vec));
    }
    await pipeline.exec();
  } catch { /* non-fatal */ }
}

// ── Centroid member list cache ────────────────────────────────────────────────

export interface CentroidMeta {
  paths:        string[];
  centroid:     number[];   // [x, y, z, w]
  memberCount:  number;
  avgAuthority: number;
}

export async function getCentroidMeta(clusterId: number): Promise<CentroidMeta | null> {
  try {
    const redis = getRedis();
    const raw = await redis.get(centroidCacheKey(clusterId));
    if (!raw) return null;
    return JSON.parse(raw) as CentroidMeta;
  } catch { return null; }
}

export async function setCentroidMeta(clusterId: number, meta: CentroidMeta): Promise<void> {
  try {
    const redis = getRedis();
    await redis.setex(centroidCacheKey(clusterId), TTL_CENTROID_S, JSON.stringify(meta));
  } catch { /* non-fatal */ }
}

export async function pipelineSetCentroidMetas(
  entries: Array<{ clusterId: number; meta: CentroidMeta }>
): Promise<void> {
  if (!entries.length) return;
  try {
    const redis = getRedis();
    const pipeline = redis.pipeline();
    for (const { clusterId, meta } of entries) {
      pipeline.setex(centroidCacheKey(clusterId), TTL_CENTROID_S, JSON.stringify(meta));
    }
    await pipeline.exec();
  } catch { /* non-fatal */ }
}

// ── Similarity result cache ───────────────────────────────────────────────────

export interface SimilarityCache {
  scores:    number[];
  topKPaths: string[];
  source:    'gpu' | 'cpu';
  computedAt: number;
}

export async function getSimilarityResult(
  queryHash: string,
  clusterKey: string
): Promise<SimilarityCache | null> {
  try {
    const redis = getRedis();
    const raw = await redis.get(simCacheKey(queryHash, clusterKey));
    if (!raw) return null;
    return JSON.parse(raw) as SimilarityCache;
  } catch { return null; }
}

export async function setSimilarityResult(
  queryHash: string,
  clusterKey: string,
  result: SimilarityCache
): Promise<void> {
  try {
    const redis = getRedis();
    await redis.setex(
      simCacheKey(queryHash, clusterKey),
      TTL_SIMILARITY_S,
      JSON.stringify(result)
    );
  } catch { /* non-fatal */ }
}

// ── Cache stats ───────────────────────────────────────────────────────────────

export async function getTensorCacheStats(): Promise<{
  embedKeys: number;
  centroidKeys: number;
  simKeys: number;
}> {
  try {
    const redis = getRedis();
    const [embedKeys, centroidKeys, simKeys] = await Promise.all([
      redis.dbsize().catch(() => 0),  // approximate — scan for exact if needed
      redis.keys('centroid:v1:*').then(k => k.length).catch(() => 0),
      redis.keys('sim:v1:*').then(k => k.length).catch(() => 0),
    ]);
    return { embedKeys: embedKeys as number, centroidKeys, simKeys };
  } catch {
    return { embedKeys: 0, centroidKeys: 0, simKeys: 0 };
  }
}
