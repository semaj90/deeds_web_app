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
  /**
   * 1-bit pre-filter cap. When candidates.length exceeds this, run the cheap
   * Hamming pre-filter over sign-packed latents and keep the top-K before the
   * Float32 dot product. 0 / undefined → disabled.
   */
  oneBitPrefilter?: number;
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

  // ── 1-bit pre-filter (TurboQuant-style sign quantization) ─────────────────
  // When the candidate set is large, narrow it via Hamming distance over
  // 16-byte sign packs before the Float32 dot product. This mirrors the
  // PolarQuant fast-path used in TurboQuant inference KV cache.
  let filtered = candidates;
  const cap = opts.oneBitPrefilter ?? 0;
  if (cap > 0 && candidates.length > cap) {
    const queryPacked = latentTo1Bit(queryLatent);
    const oneBitScores = await Promise.all(candidates.map(async (c) => {
      let packed = opts.skipCache ? null : await getLatent1Bit(c.stable_key);
      if (!packed && c.embedding?.length) {
        const lat = projectDown(new Float32Array(c.embedding), W);
        packed = latentTo1Bit(lat);
        void setLatent1Bit(c.stable_key, packed);
      }
      return packed ? hammingSimilarity1Bit(queryPacked, packed) : 0.5;
    }));
    const indexed = candidates.map((c, i) => ({ c, s: oneBitScores[i] }));
    indexed.sort((a, b) => b.s - a.s);
    filtered = indexed.slice(0, cap).map((x) => x.c);
  }

  // ── Resolve or compute latent KV per candidate ────────────────────────────
  const keyLatents: Float32Array[] = await Promise.all(
    filtered.map(async (c) => {
      if (!opts.skipCache) {
        const cached = await getLatentKV(c.stable_key);
        if (cached) return cached;
      }
      if (!c.embedding?.length) {
        return new Float32Array(MLA_RANK); // zero vector → neutral
      }
      const latent = projectDown(new Float32Array(c.embedding), W);
      void setLatentKV(c.stable_key, latent); // fire-and-forget cache write
      // Mirror to 1-bit cache for next-time pre-filter
      void setLatent1Bit(c.stable_key, latentTo1Bit(latent));
      return latent;
    })
  );

  // ── MLA attention scores ──────────────────────────────────────────────────
  const attnScores = mlaAttention(queryLatent, keyLatents);

  // ── Fuse all signals ──────────────────────────────────────────────────────
  const qBmuCol = opts.somBmuCol ?? 4;
  const qBmuRow = opts.somBmuRow ?? 4;

  return filtered.map((c, i) => {
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

// ── 1-bit MLA: sign-pack latent → 16-byte bitmap ─────────────────────────────
//
// Mirrors the geometry that TurboQuant's PolarQuant exploits at extreme
// compression (random rotation → sign quantization → angular similarity via
// Hamming). At rank 128 each latent collapses from 512 bytes (Float32) to
// 16 bytes (128 bits) — 32× compression. Hamming distance over the sign
// bitmaps approximates the cosine-of-angle between the original latents:
//
//   cos(θ) ≈ cos(π · hamming(a,b) / 128)
//
// Use as a cheap pre-filter before the Float32 dot product when reranking
// thousands of candidates. SOM BMU adjacency is the topology mirror layer:
// candidates in the same SOM cell + close 1-bit Hamming distance → likely
// near each other in the original 768-dim space.
//
// Wire chain: 1-bit MLA → SOM mirror → engram/ngram (Redis bigrams) →
//             TurboQuant KV (inference-side) → rg/awk codebase fallback.

const ONE_BIT_BYTES = MLA_RANK / 8; // 128 / 8 = 16

export function latentTo1Bit(latent: Float32Array): Uint8Array {
  if (latent.length !== MLA_RANK) {
    throw new Error(`latentTo1Bit expects length ${MLA_RANK}, got ${latent.length}`);
  }
  const out = new Uint8Array(ONE_BIT_BYTES);
  for (let i = 0; i < MLA_RANK; i++) {
    if (latent[i] > 0) out[i >>> 3] |= 1 << (i & 7);
  }
  return out;
}

// Cached popcount for 256 byte values — measurably faster than per-call popcnt
// in hot rerank loops (called O(candidates²) for cross-similarity).
const POPCNT_TABLE = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  let x = i, c = 0;
  while (x) { c += x & 1; x >>>= 1; }
  POPCNT_TABLE[i] = c;
}

export function hammingDistance1Bit(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length) throw new Error('hamming length mismatch');
  let d = 0;
  for (let i = 0; i < a.length; i++) d += POPCNT_TABLE[a[i] ^ b[i]];
  return d;
}

/** Cosine approximation from Hamming distance over sign bitmaps, in [0, 1]. */
export function hammingSimilarity1Bit(a: Uint8Array, b: Uint8Array): number {
  const d = hammingDistance1Bit(a, b);
  // d/MLA_RANK ∈ [0,1] — fraction of disagreeing bits. Map to cos-like score.
  return Math.cos(Math.PI * d / MLA_RANK);
}

export async function getLatent1Bit(stableKey: string): Promise<Uint8Array | null> {
  try {
    const redis = getRedis();
    const buf = await redis.getBuffer(`mla:kv1b:${stableKey}`);
    if (buf && buf.length === ONE_BIT_BYTES) {
      return new Uint8Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
    }
  } catch { /* non-fatal */ }
  return null;
}

export async function setLatent1Bit(stableKey: string, packed: Uint8Array): Promise<void> {
  try {
    const redis = getRedis();
    // 1-bit cache lives much longer than Float32 — 16 bytes × N keys is cheap.
    await redis.setex(`mla:kv1b:${stableKey}`, LATENT_TTL * 12, Buffer.from(packed));
  } catch { /* non-fatal */ }
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
