/**
 * MLA-Inspired KV Compression — low-rank retrieval reranker.
 *
 * Adapts DeepSeek MLA's core idea to the retrieval + ACE scoring layer:
 *
 *   full 768-dim embedding
 *     → W_down (768×128, cached in Redis as frozen random-orthogonal matrix)
 *     → latent c_KV (128-dim) per chunk, also cached in Redis by stable_key
 *     → MLA attention: softmax(c_Q · c_KV^T / √128)
 *     → fuse with SOM cluster proximity + pre-score
 *     → final ACE hit score
 *
 * Why this helps:
 *   • 6× less memory bandwidth vs full 768-dim cosine similarity
 *   • Cached latents survive across requests (TTL 300s) — near-zero recompute
 *   • SOM cluster boost handles topology-local relevance (same grid cell = same legal domain)
 *   • Single fusion pass replaces sequential Neo4j → GPU → SOM boosts in hybrid-search
 *
 * Usage:
 *   const scores = await mlaFusionRerank(queryEmbedding, candidates, { somBmu: queryBmu });
 */

import { getRedis } from '$lib/server/redis.js';
import { createHash } from 'crypto';

// ── Constants ─────────────────────────────────────────────────────────────────

export const MLA_RANK = 128;
export const MLA_DIM  = 768;

const PROJ_KEY    = `mla:proj:W_down:r${MLA_RANK}:d${MLA_DIM}`;
const PROJ_TTL    = 60 * 60 * 24;   // 24h — frozen weight matrix
const LATENT_TTL  = 300;            // 5min — per-chunk compressed KV

const SOM_GRID_W  = 8;
const SCALE       = 1 / Math.sqrt(MLA_RANK);

// ── Fusion weight defaults ────────────────────────────────────────────────────

export interface MlaFusionWeights {
  mlaAttention: number;   // MLA softmax attention weight
  preScore:     number;   // original hybrid pre-score weight
  somProximity: number;   // SOM BMU distance decay weight
  authorityBoost: number; // Neo4j pagerank pass-through weight
}

export const DEFAULT_MLA_WEIGHTS: MlaFusionWeights = {
  mlaAttention:   0.45,
  preScore:       0.30,
  somProximity:   0.15,
  authorityBoost: 0.10,
};

// ── Candidate shape (compatible with HybridSearchResult) ─────────────────────

export interface MlaCandidate {
  stable_key:      string;
  embedding?:      number[];          // full 768-dim (optional — used if latent not cached)
  pre_score:       number;
  som_bmu_col?:    number;
  som_bmu_row?:    number;
  authority_score?: number;
}

export interface MlaRerankResult extends MlaCandidate {
  latent_score:  number;   // MLA attention score (0-1)
  som_score:     number;   // SOM proximity score (0-1)
  mla_score:     number;   // final fused score
}

// ── Projection matrix (lazy-init, persisted in Redis) ────────────────────────

let _W: Float32Array | null = null;

function sampleRandomOrthogonal(rows: number, cols: number): Float32Array {
  const out = new Float32Array(rows * cols);
  for (let i = 0; i < out.length; i++) {
    const u1 = Math.random() + 1e-12;
    const u2 = Math.random();
    out[i] = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
  // Column-wise L2 normalisation
  for (let c = 0; c < cols; c++) {
    let norm = 0;
    for (let r = 0; r < rows; r++) norm += out[r * cols + c] ** 2;
    norm = Math.sqrt(norm) || 1;
    for (let r = 0; r < rows; r++) out[r * cols + c] /= norm;
  }
  return out;
}

export async function getProjectionMatrix(): Promise<Float32Array> {
  if (_W) return _W;
  try {
    const redis = getRedis();
    const buf = await redis.getBuffer(PROJ_KEY);
    if (buf && buf.length === MLA_DIM * MLA_RANK * 4) {
      _W = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
      return _W;
    }
  } catch { /* fall through */ }

  _W = sampleRandomOrthogonal(MLA_DIM, MLA_RANK);
  try {
    const redis = getRedis();
    await redis.setex(PROJ_KEY, PROJ_TTL, Buffer.from(_W.buffer));
  } catch { /* non-fatal */ }
  return _W;
}

// ── Down-projection: 768-dim → 128-dim latent ────────────────────────────────

export function projectDown(embedding: Float32Array, W: Float32Array): Float32Array {
  const out = new Float32Array(MLA_RANK);
  for (let r = 0; r < MLA_RANK; r++) {
    let sum = 0;
    for (let d = 0; d < MLA_DIM; d++) sum += embedding[d] * W[d * MLA_RANK + r];
    out[r] = sum;
  }
  return out;
}

// ── Per-chunk latent KV cache ─────────────────────────────────────────────────

export async function getLatentKV(stableKey: string): Promise<Float32Array | null> {
  try {
    const redis = getRedis();
    const buf = await redis.getBuffer(`mla:kv:${stableKey}`);
    if (buf && buf.length === MLA_RANK * 4) {
      return new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
    }
  } catch { /* non-fatal */ }
  return null;
}

export async function setLatentKV(stableKey: string, latent: Float32Array): Promise<void> {
  try {
    const redis = getRedis();
    await redis.setex(`mla:kv:${stableKey}`, LATENT_TTL, Buffer.from(latent.buffer));
  } catch { /* non-fatal */ }
}

// ── MLA attention: softmax(c_Q · C_KV^T / √rank) ────────────────────────────

function softmaxArr(raw: Float32Array): Float32Array {
  let max = raw[0];
  for (let i = 1; i < raw.length; i++) if (raw[i] > max) max = raw[i];
  const exp = new Float32Array(raw.length);
  let sum = 0;
  for (let i = 0; i < raw.length; i++) { exp[i] = Math.exp(raw[i] - max); sum += exp[i]; }
  for (let i = 0; i < raw.length; i++) exp[i] /= sum;
  return exp;
}

export function mlaAttention(queryLatent: Float32Array, keyLatents: Float32Array[]): Float32Array {
  const raw = new Float32Array(keyLatents.length);
  for (let i = 0; i < keyLatents.length; i++) {
    let dot = 0;
    for (let r = 0; r < MLA_RANK; r++) dot += queryLatent[r] * keyLatents[i][r];
    raw[i] = dot * SCALE;
  }
  return softmaxArr(raw);
}

// ── SOM proximity score: Gaussian decay over BMU grid distance ────────────────

function somProximityScore(
  queryBmuCol: number, queryBmuRow: number,
  chunkBmuCol: number | undefined, chunkBmuRow: number | undefined
): number {
  if (chunkBmuCol == null || chunkBmuRow == null) return 0.5; // neutral if unknown
  const dc = queryBmuCol - chunkBmuCol;
  const dr = queryBmuRow - chunkBmuRow;
  const gridDist = Math.sqrt(dc * dc + dr * dr);
  const sigma = SOM_GRID_W / 3; // 1σ ≈ 2.7 grid cells on 8×8
  return Math.exp(-(gridDist * gridDist) / (2 * sigma * sigma));
}

// ── Main fusion reranker ──────────────────────────────────────────────────────

export interface MlaFusionOpts {
  somBmuCol?:   number;     // query's SOM BMU column (from Qdrant payload lookup)
  somBmuRow?:   number;     // query's SOM BMU row
  weights?:     Partial<MlaFusionWeights>;
  skipCache?:   boolean;    // bypass Redis latent cache (for benchmarking)
}

export async function mlaFusionRerank(
  queryEmbedding: number[],
  candidates:     MlaCandidate[],
  opts:           MlaFusionOpts = {}
): Promise<MlaRerankResult[]> {
  if (!candidates.length) return [];

  const weights = { ...DEFAULT_MLA_WEIGHTS, ...opts.weights };
  const W = await getProjectionMatrix();
  const queryArr = new Float32Array(queryEmbedding);
  const queryLatent = projectDown(queryArr, W);

  // ── Resolve or compute latent KV per candidate ────────────────────────────
  const keyLatents: Float32Array[] = await Promise.all(
    candidates.map(async (c) => {
      if (!opts.skipCache) {
        const cached = await getLatentKV(c.stable_key);
        if (cached) return cached;
      }
      if (!c.embedding?.length) {
        return new Float32Array(MLA_RANK); // zero vector → neutral
      }
      const latent = projectDown(new Float32Array(c.embedding), W);
      void setLatentKV(c.stable_key, latent); // fire-and-forget cache write
      return latent;
    })
  );

  // ── MLA attention scores ──────────────────────────────────────────────────
  const attnScores = mlaAttention(queryLatent, keyLatents);

  // ── Fuse all signals ──────────────────────────────────────────────────────
  const qBmuCol = opts.somBmuCol ?? 4;
  const qBmuRow = opts.somBmuRow ?? 4;

  return candidates.map((c, i) => {
    const latent_score  = attnScores[i];
    const som_score     = somProximityScore(qBmuCol, qBmuRow, c.som_bmu_col, c.som_bmu_row);
    const authority     = Math.min(c.authority_score ?? 0, 1);
    const mla_score =
      weights.mlaAttention   * latent_score +
      weights.preScore       * c.pre_score  +
      weights.somProximity   * som_score    +
      weights.authorityBoost * authority;

    return { ...c, latent_score, som_score, mla_score };
  }).sort((a, b) => b.mla_score - a.mla_score);
}

// ── Utility: content-addressed hash for latent KV keys ───────────────────────

export function embeddingHash(embedding: number[]): string {
  return createHash('sha1')
    .update(Buffer.from(new Float32Array(embedding).buffer))
    .digest('hex')
    .slice(0, 16);
}

// ── Stats for observability ───────────────────────────────────────────────────

export async function getMlaStats(): Promise<{
  projectionCached: boolean;
  projectionDim:    string;
  latentKeyCount:   number;
}> {
  let projectionCached = !!_W;
  let latentKeyCount   = 0;
  try {
    const redis = getRedis();
    if (!projectionCached) {
      const buf = await redis.getBuffer(PROJ_KEY);
      projectionCached = !!buf;
    }
    latentKeyCount = await redis.zcard('mla:kv:*').catch(() => 0) as number;
    // approximate via keyspace scan
    const keys = await redis.keys('mla:kv:*');
    latentKeyCount = keys.length;
  } catch { /* non-fatal */ }
  return {
    projectionCached,
    projectionDim:  `${MLA_DIM}×${MLA_RANK}`,
    latentKeyCount,
  };
}
