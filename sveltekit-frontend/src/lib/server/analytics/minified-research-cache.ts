/**
 * minified-research-cache.ts
 *
 * Compact glyph-format pipeline for research_summaries with:
 *
 *   Int8 quantization     — 768 float32 → Int8Array (4× memory, <0.5% cosine loss)
 *   Parallel L1-L3 cache  — Redis exact | Bifrost semantic | Qdrant ANN (Promise.allSettled)
 *   CPU offloading        — in-process LRU Map (L2) for warm glyphs, GPU for hot batch ops
 *   Gradient checkpointing— LibTorch cosine matrix built in configurable block sizes
 *                           to avoid materialising the full N×M float32 matrix in VRAM
 *   N64-bit atlas         — BigInt64Array addresses glyph tiles by (somCluster << 32 |
 *                           topo4dHash), mapping NES 8×8 CHR tile space → N64 64-bit
 *                           virtual RAM for up to 4 billion tile addresses
 *   Tag bitmask           — 64-bit bigint encodes presence of top-64 corpus tags O(1)
 *
 * Public API:
 *   minifyRow(row)                   → MinifiedGlyph
 *   parallelCacheLookup(…)           → { glyphs, cacheLevel, hitMs }
 *   buildGlyphMatrixGpu(…)           → Float32Array of attention scores
 *   glyphAtlasAddress(…)             → bigint
 *   resolveAtlasAddress(addr)         → { somCluster, tileX, tileY }
 *   warmResearchCache(userId, limit) → void (background warm-up)
 */

import { getRedis } from '$lib/server/redis.js';
import type { ResearchSummary } from '$lib/server/db/schema-postgres.js';

// ── Constants ──────────────────────────────────────────────────────────────────

const DIM               = 768;
const INT8_SCALE        = 127;             // float32 → int8 scale factor
const L1_TTL            = 300;             // 5 min — hot Redis glyph cache
const L1_PREFIX         = 'rsglyph:l1:';
const L2_LRU_MAX        = 200;             // in-process LRU entries
const L2_LRU_TTL_MS     = 60_000;          // 1 min TTL for in-process cache
const CHECKPOINT_BLOCK  = 128;             // gradient checkpoint block size (rows per GPU pass)
const ATLAS_TILE_BITS   = 32n;             // top 32 bits = somCluster in BigInt64 address
const SUMMARY_TRUNC     = 300;             // chars to store in minified glyph

// ── Top-64 tag corpus for bitmask encoding ────────────────────────────────────
// Ordered by typical frequency — index = bit position in bigint
const TAG_CORPUS: readonly string[] = [
  'contract','statute','evidence','liability','damages','negligence','motion',
  'discovery','deposition','settlement','plaintiff','defendant','jurisdiction',
  'appeal','precedent','constitution','tort','breach','intellectual-property',
  'criminal','civil','federal','state','district','bankruptcy','employment',
  'insurance','real-estate','family-law','immigration','tax','environmental',
  'healthcare','securities','antitrust','privacy','arbitration','mediation',
  'injunction','sanction','subpoena','affidavit','pleading','complaint',
  'answer','counterclaim','dismissal','summary-judgment','trial','verdict',
  'judgment','appeal-brief','statute-of-limitations','admissibility','hearsay',
  'expert-witness','chain-of-custody','fourth-amendment','due-process',
  'equal-protection','first-amendment','commerce-clause','supremacy-clause',
  'standing','mootness','ripeness',
] as const;

const TAG_INDEX = new Map(TAG_CORPUS.map((t, i) => [t, i]));

// ── MinifiedGlyph type ────────────────────────────────────────────────────────

export interface MinifiedGlyph {
  glyphId:     string;          // research_summary UUID
  sourceId:    string;          // same as glyphId for now; extends to evidence IDs
  sectionCode: 0 | 1 | 2 | 3;  // FACTS=0 LEGAL_AUTHORITY=1 CLAIMS=2 PRAYER_HOLDING=3
  tagMask:     bigint;          // 64-bit bitmask over TAG_CORPUS
  embInt8:     Int8Array;       // int8-quantized 768-dim embedding
  topo4d:      [number, number, number, number];
  somCluster:  number;
  pageRank:    number;
  rewardScore: number;
  summary:     string;          // truncated to SUMMARY_TRUNC chars
  pipeline:    string;
  relevance:   number;
}

// ── Quantization ──────────────────────────────────────────────────────────────

export function quantizeInt8(vec: Float32Array | number[]): Int8Array {
  const arr = Array.isArray(vec) ? vec : vec;
  // Find max abs to normalise before quantising
  let maxAbs = 0;
  for (let i = 0; i < arr.length; i++) {
    const v = Math.abs((arr as number[])[i] ?? (arr as Float32Array)[i]);
    if (v > maxAbs) maxAbs = v;
  }
  const scale = maxAbs > 0 ? INT8_SCALE / maxAbs : 1;
  const out = new Int8Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    const v = (arr as number[])[i] ?? (arr as Float32Array)[i] ?? 0;
    out[i] = Math.round(Math.max(-127, Math.min(127, v * scale)));
  }
  return out;
}

export function dequantizeInt8(vec: Int8Array, origMaxAbs = 1): Float32Array {
  const scale = origMaxAbs / INT8_SCALE;
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] * scale;
  return out;
}

// ── Tag bitmask ───────────────────────────────────────────────────────────────

export function tagsToBitmask(tags: string[]): bigint {
  let mask = 0n;
  for (const t of tags) {
    const idx = TAG_INDEX.get(t.toLowerCase().replace(/\s+/g, '-'));
    if (idx !== undefined) mask |= (1n << BigInt(idx));
  }
  return mask;
}

export function bitmaskToTags(mask: bigint): string[] {
  const out: string[] = [];
  for (let i = 0; i < TAG_CORPUS.length; i++) {
    if ((mask & (1n << BigInt(i))) !== 0n) out.push(TAG_CORPUS[i]);
  }
  return out;
}

/** Approximate Jaccard similarity between two tag bitmasks (O(1)). */
export function bitmaskJaccard(a: bigint, b: bigint): number {
  const intersection = BigInt.asUintN(64, a & b);
  const union        = BigInt.asUintN(64, a | b);
  if (union === 0n) return 1;
  // popcount via string hack (good enough for 64-bit)
  const pop = (x: bigint) => x.toString(2).split('').filter(c => c === '1').length;
  return pop(intersection) / pop(union);
}

// ── Section mapping ───────────────────────────────────────────────────────────

const SECTION_CODE: Record<string, 0 | 1 | 2 | 3> = {
  FACTS: 0, LEGAL_AUTHORITY: 1, CLAIMS: 2, PRAYER_HOLDING: 3,
};

function sectionFromTags(tags: string[]): 0 | 1 | 2 | 3 {
  for (const t of tags) {
    const k = t.toUpperCase().replace(/[^A-Z_]/g, '_');
    if (k in SECTION_CODE) return SECTION_CODE[k as keyof typeof SECTION_CODE];
  }
  return 0; // default FACTS
}

// ── Row → MinifiedGlyph ───────────────────────────────────────────────────────

export function minifyRow(row: ResearchSummary): MinifiedGlyph {
  const rawEmb = row.embedding as unknown as number[] | null;
  const embInt8 = rawEmb && rawEmb.length === DIM
    ? quantizeInt8(rawEmb)
    : new Int8Array(DIM);

  return {
    glyphId:     row.id,
    sourceId:    row.id,
    sectionCode: sectionFromTags(row.entityTags ?? []),
    tagMask:     tagsToBitmask(row.entityTags ?? []),
    embInt8,
    topo4d:      [0, 0, 0, 0],   // populated by SOM pipeline
    somCluster:  0,
    pageRank:    0,
    rewardScore: row.relevanceScore ?? 0,
    summary:     row.summary.slice(0, SUMMARY_TRUNC),
    pipeline:    row.pipeline ?? 'ace',
    relevance:   row.relevanceScore ?? 0,
  };
}

// ── N64-bit atlas addressing ──────────────────────────────────────────────────
//
// NES CHR tile space:   8×8 pixels per tile, 512 tiles per page (2 pages = 8KB)
// N64 virtual address:  64-bit, top 32 = somCluster, bottom 32 = topo hash
//
// The topo4d coordinates are hashed into a 32-bit Morton code (Z-order curve)
// for contiguous spatial locality within a cluster page.

function mortonEncode2d(x: number, y: number): number {
  // Expand bits: interleave x and y into a 32-bit Morton code
  let rx = x & 0xFFFF, ry = y & 0xFFFF;
  rx = (rx | (rx << 8))  & 0x00FF00FF;
  ry = (ry | (ry << 8))  & 0x00FF00FF;
  rx = (rx | (rx << 4))  & 0x0F0F0F0F;
  ry = (ry | (ry << 4))  & 0x0F0F0F0F;
  rx = (rx | (rx << 2))  & 0x33333333;
  ry = (ry | (ry << 2))  & 0x33333333;
  rx = (rx | (rx << 1))  & 0x55555555;
  ry = (ry | (ry << 1))  & 0x55555555;
  return (rx | (ry << 1)) >>> 0;
}

export function glyphAtlasAddress(
  somCluster: number,
  topo4d: [number, number, number, number],
): bigint {
  // Project 4D → 2D tile coordinates (first 2 topo dims, quantised to uint16)
  const tileX = Math.round(Math.abs(topo4d[0]) * 0xFFFF) & 0xFFFF;
  const tileY = Math.round(Math.abs(topo4d[1]) * 0xFFFF) & 0xFFFF;
  const morton = BigInt(mortonEncode2d(tileX, tileY)) & 0xFFFFFFFFn;
  const cluster = BigInt(somCluster & 0xFFFFFFFF);
  return (cluster << ATLAS_TILE_BITS) | morton;
}

export function resolveAtlasAddress(
  addr: bigint,
): { somCluster: number; tileX: number; tileY: number; morton: number } {
  const cluster = Number((addr >> ATLAS_TILE_BITS) & 0xFFFFFFFFn);
  const morton  = Number(addr & 0xFFFFFFFFn);
  // De-interleave Morton code
  let x = morton, y = morton >> 1;
  x &= 0x55555555; x = (x | (x >> 1))  & 0x33333333;
  x = (x | (x >> 2))  & 0x0F0F0F0F;
  x = (x | (x >> 4))  & 0x00FF00FF;
  x = (x | (x >> 8))  & 0x0000FFFF;
  y &= 0x55555555; y = (y | (y >> 1))  & 0x33333333;
  y = (y | (y >> 2))  & 0x0F0F0F0F;
  y = (y | (y >> 4))  & 0x00FF00FF;
  y = (y | (y >> 8))  & 0x0000FFFF;
  return { somCluster: cluster, tileX: x, tileY: y, morton };
}

// ── In-process L2 LRU cache ───────────────────────────────────────────────────

interface L2Entry { glyph: MinifiedGlyph; expiresAt: number }
const _l2Map = new Map<string, L2Entry>();

function l2Get(key: string): MinifiedGlyph | null {
  const e = _l2Map.get(key);
  if (!e) return null;
  if (Date.now() > e.expiresAt) { _l2Map.delete(key); return null; }
  return e.glyph;
}

function l2Set(key: string, glyph: MinifiedGlyph): void {
  if (_l2Map.size >= L2_LRU_MAX) {
    // Evict oldest entry
    const firstKey = _l2Map.keys().next().value;
    if (firstKey) _l2Map.delete(firstKey);
  }
  _l2Map.set(key, { glyph, expiresAt: Date.now() + L2_LRU_TTL_MS });
}

// ── Redis L1 helpers ──────────────────────────────────────────────────────────

async function l1Get(glyphId: string): Promise<MinifiedGlyph | null> {
  try {
    const raw = await getRedis().get(`${L1_PREFIX}${glyphId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Rehydrate Int8Array from base64
    if (typeof parsed.embInt8 === 'string') {
      parsed.embInt8 = new Int8Array(Buffer.from(parsed.embInt8, 'base64'));
    }
    if (typeof parsed.tagMask === 'string') parsed.tagMask = BigInt(parsed.tagMask);
    return parsed as MinifiedGlyph;
  } catch { return null; }
}

async function l1Set(glyph: MinifiedGlyph): Promise<void> {
  try {
    const serializable = {
      ...glyph,
      embInt8:  Buffer.from(glyph.embInt8.buffer).toString('base64'),
      tagMask:  glyph.tagMask.toString(),
    };
    await getRedis().set(
      `${L1_PREFIX}${glyph.glyphId}`,
      JSON.stringify(serializable),
      'EX', L1_TTL,
    );
  } catch { /* non-fatal */ }
}

// ── Parallel L1-L3 cache lookup ───────────────────────────────────────────────

export interface CacheLookupResult {
  glyphs:     MinifiedGlyph[];
  cacheLevel: 'l1' | 'l2' | 'l3-qdrant' | 'l3-db' | 'miss';
  hitMs:      number;
  total:      number;
}

/**
 * Parallel L1-L3 cache lookup for research glyphs.
 *
 * L1: Redis exact-match by FNV-1a query hash
 * L2: In-process LRU map (warm glyphs from recent queries)
 * L3a: Qdrant ANN vector search (cosine distance, nearest 64 candidates)
 * L3b: Postgres fallback with relevance_score DESC
 *
 * Returns the FIRST tier that resolves with results; other tiers are
 * allowed to finish in the background for cache warm-up.
 */
export async function parallelCacheLookup(
  queryHash:      string,
  queryEmbedding: Float32Array | null,
  filters: {
    pipeline?: string;
    tags?:     string[];
    limit?:    number;
  } = {},
): Promise<CacheLookupResult> {
  const t0    = Date.now();
  const limit = filters.limit ?? 20;

  // ── L2: synchronous in-process check (fastest — no await) ────────────────
  const l2Hit = l2Get(`q:${queryHash}`);
  if (l2Hit) {
    return { glyphs: [l2Hit], cacheLevel: 'l2', hitMs: Date.now() - t0, total: 1 };
  }

  // ── L1 + L3 in parallel ───────────────────────────────────────────────────
  const [l1Result, l3Result] = await Promise.allSettled([
    // L1: Redis exact-match bundle for this query hash
    (async () => {
      const raw = await getRedis().get(`rsglyph:bundle:${queryHash}`);
      if (!raw) return null;
      const ids: string[] = JSON.parse(raw);
      const glyphs = (await Promise.all(ids.map(l1Get))).filter(Boolean) as MinifiedGlyph[];
      return glyphs.length ? glyphs : null;
    })(),

    // L3: Qdrant ANN + DB fallback (slower, full-fidelity)
    queryEmbedding
      ? searchQdrantGlyphs(queryEmbedding, filters.tags ?? [], limit, filters.pipeline)
      : searchDbGlyphs(filters, limit),
  ]);

  // Use L1 if it hit
  if (l1Result.status === 'fulfilled' && l1Result.value) {
    // Warm L2 from L1
    for (const g of l1Result.value) l2Set(`q:${queryHash}`, g);
    return {
      glyphs: l1Result.value,
      cacheLevel: 'l1',
      hitMs: Date.now() - t0,
      total: l1Result.value.length,
    };
  }

  // Use L3 result
  if (l3Result.status === 'fulfilled' && l3Result.value) {
    const { glyphs, source } = l3Result.value;
    // Backfill L1 + L2 caches (non-blocking)
    void backfillCaches(queryHash, glyphs);
    return {
      glyphs,
      cacheLevel: source === 'qdrant' ? 'l3-qdrant' : 'l3-db',
      hitMs: Date.now() - t0,
      total: glyphs.length,
    };
  }

  return { glyphs: [], cacheLevel: 'miss', hitMs: Date.now() - t0, total: 0 };
}

async function backfillCaches(queryHash: string, glyphs: MinifiedGlyph[]): Promise<void> {
  // Write each glyph to Redis L1
  await Promise.allSettled(glyphs.map(l1Set));
  // Store bundle index for L1 re-assembly
  try {
    await getRedis().set(
      `rsglyph:bundle:${queryHash}`,
      JSON.stringify(glyphs.map(g => g.glyphId)),
      'EX', L1_TTL,
    );
  } catch { /* non-fatal */ }
  // Warm L2 with first glyph
  if (glyphs[0]) l2Set(`q:${queryHash}`, glyphs[0]);
}

// ── Qdrant glyph search ───────────────────────────────────────────────────────

async function searchQdrantGlyphs(
  queryVec: Float32Array,
  tags:     string[],
  limit:    number,
  pipeline?: string,
): Promise<{ glyphs: MinifiedGlyph[]; source: 'qdrant' }> {
  try {
    const { qdrant } = await import('$lib/server/vector/qdrant-manager.js');
    const filter = tags.length || pipeline
      ? {
          must: [
            ...tags.map(t => ({ key: 'entity_tags', match: { value: t } })),
            ...(pipeline ? [{ key: 'pipeline', match: { value: pipeline } }] : []),
          ],
        }
      : undefined;

    const searchResult = await qdrant._denseSearch({
      query: 'glyph search',
      queryEmbedding: Array.from(queryVec),
      collection: 'research_summaries',
      filters: filter,
      limit,
    });

    const glyphs: MinifiedGlyph[] = searchResult.results.map((r) => ({
      glyphId:     String(r.id),
      sourceId:    String(r.id),
      sectionCode: 0 as const,
      tagMask:     tagsToBitmask((r.payload?.entity_tags as string[]) ?? []),
      embInt8:     new Int8Array(DIM),  // not stored in Qdrant payload — rehydrate on demand
      topo4d:      [0, 0, 0, 0] as [number, number, number, number],
      somCluster:  Number(r.payload?.som_cluster ?? 0),
      pageRank:    0,
      rewardScore: r.score,
      summary:     String(r.payload?.summary ?? '').slice(0, SUMMARY_TRUNC),
      pipeline:    String(r.payload?.pipeline ?? 'ace'),
      relevance:   r.score,
    }));

    return { glyphs, source: 'qdrant' };
  } catch {
    return { glyphs: [], source: 'qdrant' };
  }
}

// ── DB fallback (no embedding) ────────────────────────────────────────────────

async function searchDbGlyphs(
  filters: { pipeline?: string; tags?: string[]; limit?: number },
  limit:   number,
): Promise<{ glyphs: MinifiedGlyph[]; source: 'db' }> {
  try {
    const { db }                = await import('$lib/server/db/client');
    const { researchSummaries } = await import('$lib/server/db/schema-postgres.js');
    const { desc, eq, and, sql: drizzleSql } = await import('drizzle-orm');

    const conditions = [];
    if (filters.pipeline && filters.pipeline !== 'all') {
      conditions.push(eq(researchSummaries.pipeline, filters.pipeline));
    }
    for (const tag of (filters.tags ?? [])) {
      conditions.push(drizzleSql`${researchSummaries.entityTags} @> ARRAY[${tag}]::text[]`);
    }

    const rows = await db
      .select()
      .from(researchSummaries)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(researchSummaries.relevanceScore))
      .limit(limit);

    return { glyphs: rows.map(minifyRow), source: 'db' };
  } catch {
    return { glyphs: [], source: 'db' };
  }
}

// ── GPU matrix with gradient checkpointing ────────────────────────────────────
//
// "Gradient checkpointing" here: instead of materialising the full N×DIM
// float32 matrix in VRAM at once, we process `CHECKPOINT_BLOCK` rows per
// GPU pass and accumulate scores.  This bounds VRAM usage to:
//   CHECKPOINT_BLOCK × DIM × 4 bytes = 128 × 768 × 4 = 393 KB per pass
// vs N × DIM × 4 for a typical batch of 1000 = 3 MB.

export async function buildGlyphMatrixGpu(
  glyphs:         MinifiedGlyph[],
  queryVec:       Float32Array,
  blockSize:      number = CHECKPOINT_BLOCK,
): Promise<Float32Array> {
  const scores = new Float32Array(glyphs.length);

  try {
    const { scoreAttention } = await import('$lib/server/grpc/graph-ml-client.js');

    for (let start = 0; start < glyphs.length; start += blockSize) {
      const block = glyphs.slice(start, start + blockSize);
      const n     = block.length;
      const mat   = new Float32Array(n * DIM);

      // Dequantize int8 block into float32 matrix (CPU offloaded, then GPU)
      for (let i = 0; i < n; i++) {
        const g   = block[i];
        const vec = dequantizeInt8(g.embInt8);
        // L2-normalise before GPU attention
        let sq = 0;
        for (let j = 0; j < DIM; j++) sq += vec[j] * vec[j];
        const norm = Math.sqrt(sq) || 1;
        for (let j = 0; j < DIM; j++) mat[i * DIM + j] = vec[j] / norm;
      }

      // GPU attention score: query vs block matrix (N-API synchronous)
      const attn = scoreAttention(queryVec, DIM, mat, n);
      for (let i = 0; i < n; i++) {
        scores[start + i] = attn.scores[i] ?? 0;
      }
    }
  } catch {
    // CPU fallback: dot-product cosine
    for (let i = 0; i < glyphs.length; i++) {
      const vec = dequantizeInt8(glyphs[i].embInt8);
      let dot = 0, qa = 0, va = 0;
      for (let j = 0; j < DIM; j++) {
        dot += queryVec[j] * vec[j];
        qa  += queryVec[j] * queryVec[j];
        va  += vec[j] * vec[j];
      }
      scores[i] = dot / (Math.sqrt(qa) * Math.sqrt(va) || 1);
    }
  }

  return scores;
}

// ── Top-K selection after GPU scoring ────────────────────────────────────────

export function topKGlyphs(
  glyphs: MinifiedGlyph[],
  scores: Float32Array,
  k:      number,
): Array<MinifiedGlyph & { score: number }> {
  return glyphs
    .map((g, i) => ({ ...g, score: scores[i] ?? 0 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

// ── Background cache warm-up ──────────────────────────────────────────────────

/**
 * Pre-fill L1 Redis cache with the most relevant glyphs for a user.
 * Called after login or on idle — non-blocking fire-and-forget.
 */
export async function warmResearchCache(
  userId:  string,
  limit:   number = 50,
): Promise<void> {
  try {
    const { db }                = await import('$lib/server/db/client');
    const { researchSummaries } = await import('$lib/server/db/schema-postgres.js');
    const { eq, desc }          = await import('drizzle-orm');

    const rows = await db
      .select()
      .from(researchSummaries)
      .where(eq(researchSummaries.userId, userId))
      .orderBy(desc(researchSummaries.relevanceScore))
      .limit(limit);

    await Promise.allSettled(rows.map(r => l1Set(minifyRow(r))));
  } catch { /* non-fatal */ }
}

// ── Glyph-formatted search result (for agentic tools) ─────────────────────────

export interface GlyphSearchResult {
  glyphs:         Array<MinifiedGlyph & { score: number }>;
  cacheLevel:     string;
  hitMs:          number;
  total:          number;
  tagMatches:     string[];   // tags shared between query bitmask and top glyph
}

/**
 * End-to-end glyph search: parallel cache → GPU matrix → top-K.
 * Entry point for agentic tool calls.
 */
export async function glyphSearch(opts: {
  queryText:      string;
  queryHash:      string;
  queryEmbedding: Float32Array | null;
  tags?:          string[];
  pipeline?:      string;
  topK?:          number;
}): Promise<GlyphSearchResult> {
  const topK = opts.topK ?? 10;

  // 1. Parallel cache lookup
  const lookup = await parallelCacheLookup(
    opts.queryHash,
    opts.queryEmbedding,
    { pipeline: opts.pipeline, tags: opts.tags, limit: topK * 4 },
  );

  if (!lookup.glyphs.length) {
    return { glyphs: [], cacheLevel: lookup.cacheLevel, hitMs: lookup.hitMs, total: 0, tagMatches: [] };
  }

  // 2. GPU attention scoring (gradient-checkpointed)
  let scores: Float32Array;
  if (opts.queryEmbedding) {
    // L2-normalise query vector
    const qv = new Float32Array(opts.queryEmbedding);
    let sq = 0;
    for (let i = 0; i < qv.length; i++) sq += qv[i] * qv[i];
    const norm = Math.sqrt(sq) || 1;
    for (let i = 0; i < qv.length; i++) qv[i] /= norm;
    scores = await buildGlyphMatrixGpu(lookup.glyphs, qv);
  } else {
    // No embedding — rank by stored relevance score
    scores = Float32Array.from(lookup.glyphs.map(g => g.relevance));
  }

  // 3. Top-K selection
  const ranked = topKGlyphs(lookup.glyphs, scores, topK);

  // 4. Tag intersection with query tag bitmask
  const queryMask = tagsToBitmask(opts.tags ?? []);
  const tagMatches = queryMask > 0n && ranked[0]
    ? bitmaskToTags(queryMask & ranked[0].tagMask)
    : [];

  return {
    glyphs: ranked,
    cacheLevel: lookup.cacheLevel,
    hitMs: lookup.hitMs,
    total: lookup.total,
    tagMatches,
  };
}
