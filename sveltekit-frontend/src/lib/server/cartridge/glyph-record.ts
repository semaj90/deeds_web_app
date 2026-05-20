/**
 * GlyphRecord — unified 4-layer glyph schema for CHR97 cartridge assembly.
 *
 * 4-layer payload:
 *   semantic  — summary, tags, section (HMM-predicted), JSONB key hints
 *   vector    — 768-dim embedding (Ollama embeddinggemma)
 *   topology  — topo4d (4D SOM/UMAP projection), somCluster, centroidId
 *   graph     — kagNeighbors (KAG edges), dagPrev (DAG order), grpoRewardScore
 *
 * Tile axes for CHR97 page packing (contiguous memory layout):
 *   Primary:   section bucket (FACTS → LEGAL_AUTHORITY → CLAIMS → PRAYER_HOLDING)
 *   Secondary: centroidId / somCluster
 *
 * 3-stage staged search (via GlyphBridge.searchCartridge):
 *   Stage 1 — 4d topo L2 prefilter   → top 4×topK candidates (cheap, no GPU)
 *   Stage 2 — attentionScoreGPU       → softmax attention on cluster-local tensors
 *   Stage 3 — rewardScoreGPU cosine   → final GRPO-compatible cosine rerank → top topK
 *
 * ACE assembly (via GlyphBridge.assembleACEFromGlyphs):
 *   Checks glyph-prompt-cache (in-process binary cache) first.
 *   On miss: builds fragment from summary + tags + kagNeighbors + section label.
 *   Writes back to cache (FragmentType.KAG, 2-min TTL).
 */

import { buildCartridge, type RuneData, type CartridgeMetadata } from './chr97-builder.js';
import { getFragment, setFragment, FragmentType } from '$lib/server/glyph-prompt-cache.js';

// ─── Section + Type enums ─────────────────────────────────────────────────────

export type GlyphSection = 'FACTS' | 'LEGAL_AUTHORITY' | 'CLAIMS' | 'PRAYER_HOLDING';
export type GlyphType = 'chunk' | 'case' | 'authority' | 'claim';

// ─── GlyphRecord ──────────────────────────────────────────────────────────────

export interface GlyphRecord {
  // Identity
  glyphId: string;           // stable id — sha256(sourceId + ':' + text.slice(0,64)) recommended
  sourceId: string;          // evidence / document / case record ID
  type: GlyphType;

  // Semantic payload
  summary: string;           // ACE-compressed summary (LangExtract output)
  tags: string[];
  section?: GlyphSection;    // HMM-predicted legal section
  jsonbKeyHints: string[];   // schema keys from Postgres JSONB payload

  // Vector payload
  embedding768: Float32Array | number[];  // 768-dim Ollama embeddinggemma vector

  // Topology payload (SOM/UMAP 4-dim projection)
  topo4d: [number, number, number, number];
  somCluster?: number;       // SOM BMU tile index
  centroidId?: number;       // k-means cluster id

  // Graph payload
  kagNeighbors: string[];   // KAG graph neighbor IDs (glyphId or sourceId)
  dagPrev?: string[];        // DAG upstream node IDs (topological order)

  // Reward payload
  grpoRewardScore?: number;  // GRPO cosine reward score vs reference embedding

  // Render payload
  sourceName?: string;       // filename / display label
  entities?: string[];       // extracted named entities (merged into chr97 rune entities)
  cartridge_kind?: string | null;
  glyph_kind?: string | null;
  cluster_key?: string | null;
}

// ─── GlyphBridge interface ────────────────────────────────────────────────────

export interface GlyphBridge {
  /** Pack a single GlyphRecord into a CHR97 binary (1-rune cartridge). */
  buildGlyph(record: GlyphRecord): Promise<Uint8Array>;

  /**
   * Pack multiple GlyphRecords into a CHR97 page cartridge.
   * Sorted by section bucket then centroidId for contiguous tile memory.
   */
  packCartridge(glyphs: GlyphRecord[], caseId?: string): Promise<Uint8Array>;

  /**
   * 3-stage staged search against a glyph pool.
   * Returns ordered glyphIds (best match first).
   *
   * @param queryEmbedding - 768-dim pre-embedded query vector
   * @param glyphs         - pool to search (already loaded GlyphRecords)
   * @param opts.topK      - number of results (default 10)
   * @param opts.section   - tile axis pre-filter (optional, e.g. 'FACTS')
   * @param opts.minScore  - minimum rewardScoreGPU cosine threshold (default 0.3)
   */
  searchCartridge(
    queryEmbedding: Float32Array,
    glyphs: GlyphRecord[],
    opts?: { topK?: number; section?: GlyphSection; minScore?: number }
  ): Promise<string[]>;

  /**
   * Assemble ACE context string from a list of GlyphRecords.
   * Checks in-process glyph-prompt-cache first; builds fresh on miss.
   *
   * @returns context string + cache provenance ('cache' | 'fresh')
   */
  assembleACEFromGlyphs(
    glyphs: GlyphRecord[]
  ): Promise<{ context: string; source: 'cache' | 'fresh' }>;

  /** Alias for searchCartridge (matches GlyphBridge contract in types/glyph.ts). */
  search(
    queryEmbedding: Float32Array,
    glyphs: GlyphRecord[],
    opts?: { topK?: number; sectionBias?: GlyphSection; minReward?: number }
  ): Promise<Array<{ glyphId: string; score: number; stage: string }>>;

  /** Alias for assembleACEFromGlyphs (matches GlyphBridge contract in types/glyph.ts). */
  assembleACE(glyphs: GlyphRecord[]): Promise<{ context: string; source: 'cache' | 'fresh' }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Section sort order for contiguous tile packing. */
const SECTION_ORDER: Record<string, number> = {
  FACTS: 0,
  LEGAL_AUTHORITY: 1,
  CLAIMS: 2,
  PRAYER_HOLDING: 3,
};

/** Convert GlyphRecord → RuneData for chr97-builder. */
export function glyphRecordToRuneData(g: GlyphRecord, index: number): RuneData {
  return {
    id: index,
    clusterId: g.centroidId ?? g.somCluster ?? 0,
    embedding: Array.isArray(g.embedding768) ? g.embedding768 : Array.from(g.embedding768),
    text: g.summary,
    sourceId: g.sourceId,
    sourceName: g.sourceName,
    entities: [...g.tags, ...(g.entities ?? []), ...(g.section ? [g.section] : [])],
  };
}

/** Build a single glyph's ACE prompt fragment from its fields. */
function buildGlyphFragment(g: GlyphRecord): string {
  const lines: string[] = [];
  if (g.section) lines.push(`[${g.section}]`);
  lines.push(g.summary);
  if (g.tags.length > 0) lines.push(`Tags: ${g.tags.join(', ')}`);
  if (g.kagNeighbors.length > 0) {
    lines.push(`Graph links: ${g.kagNeighbors.slice(0, 5).join(', ')}`);
  }
  if (g.dagPrev && g.dagPrev.length > 0) {
    lines.push(`Preceded by: ${g.dagPrev.join(', ')}`);
  }
  if (g.grpoRewardScore !== undefined) {
    lines.push(`Quality: ${g.grpoRewardScore.toFixed(3)}`);
  }
  if (g.jsonbKeyHints.length > 0) {
    lines.push(`Schema hints: ${g.jsonbKeyHints.slice(0, 4).join(', ')}`);
  }
  return lines.join('\n');
}

// ─── GlyphCartridgeBridge ─────────────────────────────────────────────────────

class GlyphCartridgeBridge implements GlyphBridge {
  async buildGlyph(record: GlyphRecord): Promise<Uint8Array> {
    const rune = glyphRecordToRuneData(record, 0);
    const meta: CartridgeMetadata = {
      caseId: record.sourceId,
      createdAt: new Date().toISOString(),
      runeCount: 1,
      embeddingDim: Array.isArray(record.embedding768)
        ? record.embedding768.length
        : record.embedding768.length,
      collections: ['glyph'],
      sources: record.sourceName ? [record.sourceName] : [],
      cartridge_kind: record.cartridge_kind ?? null,
      glyph_kind: record.glyph_kind ?? null,
      cluster_key: record.cluster_key ?? null,
    };
    const buf = buildCartridge([rune], meta);
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  async packCartridge(glyphs: GlyphRecord[], caseId = 'glyph-pack'): Promise<Uint8Array> {
    // Sort: section bucket first, then centroidId for contiguous tile memory
    const sorted = [...glyphs].sort((a, b) => {
      const aS = SECTION_ORDER[a.section ?? ''] ?? 4;
      const bS = SECTION_ORDER[b.section ?? ''] ?? 4;
      if (aS !== bS) return aS - bS;
      return (a.centroidId ?? 0) - (b.centroidId ?? 0);
    });

    const runes = sorted.map((g, i) => glyphRecordToRuneData(g, i));
    const meta: CartridgeMetadata = {
      caseId,
      createdAt: new Date().toISOString(),
      runeCount: runes.length,
      embeddingDim: runes[0]?.embedding.length ?? 768,
      collections: [...new Set(glyphs.map((g) => g.type))],
      sources: [...new Set(glyphs.map((g) => g.sourceName).filter(Boolean) as string[])],
      cartridge_kind: glyphs[0]?.cartridge_kind ?? null,
      glyph_kind: glyphs[0]?.glyph_kind ?? null,
      cluster_key: glyphs[0]?.cluster_key ?? null,
    };
    const buf = buildCartridge(runes, meta);
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  async searchCartridge(
    queryEmbedding: Float32Array,
    glyphs: GlyphRecord[],
    opts: { topK?: number; section?: GlyphSection; minScore?: number } = {}
  ): Promise<string[]> {
    const topK = opts.topK ?? 10;
    const minScore = opts.minScore ?? 0.3;
    const dim = queryEmbedding.length;

    // Optional section tile-axis pre-filter
    const pool = opts.section ? glyphs.filter((g) => g.section === opts.section) : glyphs;

    if (pool.length === 0) return [];

    // ── Stage 1: 4d topo L2 prefilter ──────────────────────────────────
    // Derive query topo4d from first 4 dims of embedding (mirrors chr97-builder convention)
    const qt = queryEmbedding as Float32Array;
    const queryTopo: [number, number, number, number] = [qt[0], qt[1], qt[2], qt[3]];

    const withDist = pool.map((g) => {
      const t = g.topo4d;
      const d =
        (t[0] - queryTopo[0]) ** 2 +
        (t[1] - queryTopo[1]) ** 2 +
        (t[2] - queryTopo[2]) ** 2 +
        (t[3] - queryTopo[3]) ** 2;
      return { g, dist4d: d };
    });
    withDist.sort((a, b) => a.dist4d - b.dist4d);
    const stage1 = withDist.slice(0, topK * 4).map((x) => x.g);

    // ── Stage 2: attentionScoreGPU on cluster-local tensors ────────────
    // Build flat key matrix [stage1.length × dim] from stage1 embeddings
    const { attentionScoreGPU } = await import('$lib/server/gpu/pytorch-graph.js');
    const keyMatrix = new Float32Array(stage1.length * dim);
    for (let i = 0; i < stage1.length; i++) {
      const emb = stage1[i].embedding768;
      const src = Array.isArray(emb) ? emb : (emb as Float32Array);
      for (let d = 0; d < dim; d++) {
        keyMatrix[i * dim + d] = src[d];
      }
    }

    const { weights } = attentionScoreGPU(queryEmbedding, dim, keyMatrix, stage1.length);

    // Weight by softmax attention → top 2×topK
    const attended = stage1
      .map((g, i) => ({ g, w: weights[i] }))
      .sort((a, b) => b.w - a.w)
      .slice(0, topK * 2);
    const stage2 = attended.map((x) => x.g);

    // ── Stage 3: rewardScoreGPU cosine final rerank ────────────────────
    const { rewardScoreGPU } = await import('$lib/server/gpu/pytorch-graph.js');
    const n = stage2.length;

    // genVecs = candidate embeddings; refVecs = query repeated n times
    const genVecs = new Float32Array(n * dim);
    const refVecs = new Float32Array(n * dim);
    for (let i = 0; i < n; i++) {
      const emb = stage2[i].embedding768;
      const src = Array.isArray(emb) ? emb : (emb as Float32Array);
      for (let d = 0; d < dim; d++) {
        genVecs[i * dim + d] = src[d];
        refVecs[i * dim + d] = queryEmbedding[d];
      }
    }

    const { scores } = rewardScoreGPU(genVecs, refVecs, n, dim);
    return stage2
      .map((g, i) => ({ g, score: scores[i] }))
      .filter((x) => x.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((x) => x.g.glyphId);
  }

  async assembleACEFromGlyphs(
    glyphs: GlyphRecord[]
  ): Promise<{ context: string; source: 'cache' | 'fresh' }> {
    const parts: string[] = [];
    let allCached = true;

    for (const g of glyphs) {
      const cacheKey = `glyph:${g.glyphId}`;
      const cached = getFragment(cacheKey);
      if (cached) {
        parts.push(cached);
      } else {
        allCached = false;
        const fragment = buildGlyphFragment(g);
        parts.push(fragment);
        // Write back: FragmentType.KAG, 2-min TTL
        setFragment(cacheKey, fragment, FragmentType.KAG, 120_000);
      }
    }

    return {
      context: parts.join('\n\n---\n\n'),
      source: allCached ? 'cache' : 'fresh',
    };
  }

  async search(
    queryEmbedding: Float32Array,
    glyphs: GlyphRecord[],
    opts?: { topK?: number; sectionBias?: GlyphSection; minReward?: number }
  ): Promise<Array<{ glyphId: string; score: number; stage: string }>> {
    const ids = await this.searchCartridge(queryEmbedding, glyphs, {
      topK: opts?.topK,
      section: opts?.sectionBias,
      minScore: opts?.minReward,
    });
    return ids.map((id, i) => ({ glyphId: id, score: 1 - i * 0.01, stage: 'reward' }));
  }

  async assembleACE(
    glyphs: GlyphRecord[]
  ): Promise<{ context: string; source: 'cache' | 'fresh' }> {
    return this.assembleACEFromGlyphs(glyphs);
  }
}

export const glyphBridge: GlyphBridge = new GlyphCartridgeBridge();
