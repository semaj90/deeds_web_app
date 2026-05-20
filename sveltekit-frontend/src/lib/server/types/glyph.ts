/**
 * Canonical GlyphRecord schema — four nested payload layers.
 *
 * Derivation rule:
 *   RuneData       = compact CHR97 binary transport format
 *   GlyphRecord    = canonical TypeScript schema (this file)
 *   glyph_records  = durable Drizzle/Postgres JSONB form
 *   barrel exports = stable public API (src/lib/server/types/index.ts)
 *   Svelte runes   = UI only, never server schema
 *
 * Layer responsibilities:
 *   semantic  — LangExtract/ACE output: summary, tags, HMM section, KAG/DAG refs
 *   vector    — Ollama embeddinggemma 768-dim, GRPO reward score, centroid ref
 *   topology  — SOM BMU cluster, 4d manifold projection, NES tile atlas coords
 *   render    — CHR97 cartridge/page/tile pointers, glyph prompt cache key
 */

// ─── Section + Kind ───────────────────────────────────────────────────────────

export type GlyphSection =
  | 'PARTIES'
  | 'JURISDICTION'
  | 'FACTS'
  | 'LEGAL_AUTHORITY'
  | 'CLAIMS'
  | 'PRAYER_HOLDING'
  | 'UNKNOWN';

/** Map HMM raw state labels to canonical GlyphSection values. */
export function hmmStateToGlyphSection(state: string): GlyphSection {
  switch (state) {
    case 'PARTIES':
      return 'PARTIES';
    case 'JURISDICTION':
      return 'JURISDICTION';
    case 'FACTS':
      return 'FACTS';
    case 'LEGAL_AUTHORITY':
      return 'LEGAL_AUTHORITY';
    case 'CLAIMS':
      return 'CLAIMS';
    case 'PRAYER':
    case 'HOLDING':
      return 'PRAYER_HOLDING';
    default:
      return 'UNKNOWN';
  }
}

export type GlyphKind =
  | 'chunk'
  | 'authority'
  | 'claim'
  | 'evidence'
  | 'case'
  | 'prompt_fragment';

// ─── Payload layers ───────────────────────────────────────────────────────────

export interface GlyphSemanticLayer {
  title?: string;
  summary: string;
  content?: string;
  tags: string[];
  entities: string[];
  section: GlyphSection;
  dominantState?: string | null;
  jsonbKeyHints?: string[];
  /** KAG graph neighbor glyphIds (Neo4j SIMILAR / AUTHORITY edges) */
  kagNeighbors: string[];
  /** DAG upstream node IDs (topological order for ACE assembly) */
  dagPrev: string[];
  dagNext: string[];
}

export interface GlyphVectorLayer {
  /** 768-dim Ollama embeddinggemma vector */
  embedding768: Float32Array;
  embeddingModel: string;
  /** k-means centroid assignment (from glyph-tile-engine) */
  centroidId?: number | null;
  /** INT8/NF4 quantized tensor bytes (CHR97 FP16 after pack) */
  quantized?: Uint8Array | null;
  /** L2 norm of embedding768 (pre-computed for fast cosine) */
  norm?: number | null;
  /** GRPO cosine reward score vs reference embedding (nullable until trained) */
  grpoRewardScore?: number | null;
}

export interface GlyphTopologyLayer {
  /** SOM BMU tile index (from glyph-tile-engine SOM training) */
  somCluster?: number | null;
  /** 4-dim UMAP/manifold projection (mirrors chr97-builder manifold4 convention) */
  manifold4?: [number, number, number, number] | null;
  /** 2D NES tile grid position */
  gridX?: number | null;
  gridY?: number | null;
  /** Normalised 0-1 grid coords for WebGPU Voronoi shader */
  normX?: number | null;
  normY?: number | null;
  /** Mean cosine similarity of cluster members to centroid */
  confidence?: number | null;
  /** Number of source vectors that landed in this cluster */
  runeCount?: number | null;
}

export interface GlyphRenderLayer {
  /** CHR97 cartridge binary key (e.g. Redis prefix + caseId) */
  cartridgeId?: string | null;
  /** Page index within the cartridge (0-indexed) */
  pageIndex?: number | null;
  /** NES tile atlas index */
  tileIndex?: number | null;
  /** glyph-prompt-cache key for this glyph's fragment */
  promptCacheKey?: string | null;
  /** GlyphTileAtlas Redis key */
  atlasKey?: string | null;
}

// ─── Canonical GlyphRecord ────────────────────────────────────────────────────

export interface GlyphRecord {
  /** Stable ID — sha256(sourceId + ':' + content.slice(0,64)) recommended */
  glyphId: string;
  /** Evidence / document / case record UUID */
  sourceId: string;
  caseId?: string | null;
  kind: GlyphKind;
  /** Schema version for forward-compat migrations */
  schemaVersion: number;

  semantic: GlyphSemanticLayer;
  vector: GlyphVectorLayer;
  topology: GlyphTopologyLayer;
  render: GlyphRenderLayer;

  cartridge_kind?: string | null;
  glyph_kind?: string | null;
  cluster_key?: string | null;

  createdAt?: string;
  updatedAt?: string;
}

// ─── Staged search contracts ──────────────────────────────────────────────────

export interface GlyphSearchHit {
  glyphId: string;
  score: number;
  /** Which search stage produced this result */
  stage: 'topology' | 'centroid' | 'rerank';
  attnWeight?: number;
  rewardScore?: number;
}

export interface GlyphSearchOptions {
  /** Stage 1: number of nearest 4d-topology tiles to include */
  topTiles?: number;
  /** Stage 2: number of centroid-reranked candidates */
  topCentroids?: number;
  /** Stage 3: final result count */
  topK?: number;
  /** Optional section tile-axis filter */
  sectionBias?: GlyphSection | null;
  /** Minimum rewardScoreGPU threshold (default 0.25) */
  minReward?: number;
}

// ─── GlyphBridge interface ────────────────────────────────────────────────────

export interface GlyphBridge {
  /**
   * 3-stage staged search: topology L2 → attentionScoreGPU → rewardScoreGPU.
   * @param queryEmbedding - 768-dim pre-embedded query (Float32Array)
   * @param glyphs         - pool of GlyphRecords to search
   */
  search(
    queryEmbedding: Float32Array,
    glyphs: GlyphRecord[],
    opts?: GlyphSearchOptions
  ): Promise<GlyphSearchHit[]>;

  /**
   * Assemble ACE context from glyphs. Checks glyph-prompt-cache first.
   */
  assembleACE(
    glyphs: GlyphRecord[]
  ): Promise<{ context: string; source: 'cache' | 'fresh' }>;
}
