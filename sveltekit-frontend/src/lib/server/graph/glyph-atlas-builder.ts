/**
 * GlyphAtlas Builder — MapReduce over cluster summaries, BoW tiles, and PageRank scores.
 *
 * Produces a packed atlas record per GPU cluster, analogous to a sprite-sheet:
 *   - Each cluster is one "glyph" with a fixed-stride Float32 descriptor vector
 *   - All glyphs are packed into a single contiguous Float32Array (WebGPU-uploadable)
 *   - Atlas is cached in Redis as `glyph:atlas:v1` (1h TTL)
 *
 * Descriptor layout per cluster (STRIDE = 128 floats):
 *   [0..63]   BoW weights (top-64 cluster terms, TF-IDF normalised)
 *   [64]      PageRank centroid (mean of top-5 file scores, 0-1)
 *   [65]      File count (normalised to 0-1 by total files)
 *   [66]      Audit score (0-1)
 *   [67]      SSR risk ratio (0-1)
 *   [68]      SOM row centroid (0-1 by grid height)
 *   [69]      SOM col centroid (0-1 by grid width)
 *   [70]      Paired-test ratio (0-1)
 *   [71..127] Reserved (zero-padded for future GPU features)
 *
 * MapReduce phases:
 *   Map   — per-directory: load wiki note + graph flags + BoW tile → dir descriptor
 *   Reduce— per-cluster: merge all dir descriptors → cluster glyph
 *   Pack  — all cluster glyphs → Float32Array atlas + manifest JSON
 */

import { readFile, stat } from 'node:fs/promises';
import { existsSync }      from 'node:fs';
import path                from 'node:path';
import { getRedis }        from '$lib/server/redis.js';
import {
  getClusterBowTexture,
  getSomBowTexture,
  mergeBowTiles,
  type BowTextureTile,
} from '$lib/server/langextract/bag-cache.js';

// ── Constants ─────────────────────────────────────────────────────────────────

export const ATLAS_VERSION  = 'v1';
export const ATLAS_REDIS_KEY = `glyph:atlas:${ATLAS_VERSION}`;
export const ATLAS_TTL       = 3600; // 1h
export const DESCRIPTOR_STRIDE = 128; // floats per cluster glyph
export const BOW_DIM            = 64; // floats [0..63]
const SOM_GRID_H = 20; // normalisation denominator for SOM row
const SOM_GRID_W = 20; // normalisation denominator for SOM col

const GRAPH_PATH      = path.resolve(process.cwd(), 'docs/graph/codebase-graph.json');
const HYPERGRAPH_PATH = path.resolve(process.cwd(), 'docs/graph/hypergraph-clusters.json');

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GlyphDescriptor {
  clusterId:      number;
  /** Cluster topic label from hypergraph-clusters.json */
  topic:          string;
  /** Top-N directories contributing to this cluster */
  topDirs:        string[];
  /** Top terms (parallel to weights in the packed atlas) */
  terms:          string[];   // length BOW_DIM
  weights:        number[];   // length BOW_DIM (normalised BoW)
  pageRankMean:   number;     // 0-1
  fileCount:      number;     // raw
  auditScore:     number;     // 0-1
  ssrRisk:        number;     // 0-1
  somRowCentroid: number;     // 0-1
  somColCentroid: number;     // 0-1
  pairedTestRatio:number;     // 0-1
  dirCount:       number;
}

export interface GlyphAtlasManifest {
  version:        string;
  builtAt:        string;
  clusterCount:   number;
  totalFiles:     number;
  stride:         number;
  bowDim:         number;
  /** Ordered cluster IDs — index i → atlas[i * stride .. (i+1)*stride - 1] */
  clusterOrder:   number[];
  glyphs:         GlyphDescriptor[];
  /** Cosine similarity matrix (upper triangle, row-major, NxN) */
  similarity:     number[];
}

export interface GlyphAtlasResult {
  manifest:     GlyphAtlasManifest;
  /** Base64-encoded Float32Array (use atob + Float32Array.from for WebGPU upload) */
  atlasBase64:  string;
  /** Redis cache hit */
  fromCache:    boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

let _graph: { files?: RawFile[]; directories?: RawDir[] } | null = null;
let _graphMtime = 0;

interface RawFile {
  rel: string;
  tags?: string[];
  clusterId?: number;
  somBmuRow?: number;
  somBmuCol?: number;
  hasPairedTest?: boolean;
  ssrUnsafe?: boolean;
  fanIn?: number;
}

interface RawDir {
  dir: string;
  score?: number;
  fileCount: number;
  tagList?: string[];
}

async function loadGraph() {
  if (!existsSync(GRAPH_PATH)) return { files: [] as RawFile[], directories: [] as RawDir[] };
  const { mtimeMs } = await stat(GRAPH_PATH);
  if (_graph && mtimeMs <= _graphMtime) return _graph;
  const raw = await readFile(GRAPH_PATH, 'utf8');
  _graph = JSON.parse(raw) as typeof _graph;
  _graphMtime = mtimeMs;
  return _graph!;
}

interface HypergraphCluster {
  clusterId: number;
  inferredTopic?: string;
  topDirs?: string[];
  topKinds?: Record<string, number>;
  topTags?: (string | { tag: string; count: number })[];
}

async function loadHypergraphClusters(): Promise<HypergraphCluster[]> {
  if (!existsSync(HYPERGRAPH_PATH)) return [];
  try {
    const raw = await readFile(HYPERGRAPH_PATH, 'utf8');
    return JSON.parse(raw) as HypergraphCluster[];
  } catch {
    return [];
  }
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function padOrTrim(arr: number[], size: number): number[] {
  if (arr.length >= size) return arr.slice(0, size);
  return [...arr, ...new Array(size - arr.length).fill(0)];
}

// ── Phase 1: Map — per-cluster BoW merge from Redis ──────────────────────────

async function mapClusterBoW(
  clusterId: number,
  dirFiles: RawFile[]
): Promise<{ terms: string[]; weights: number[] }> {
  // Try cluster tile first (written by graphify:bow-tiles)
  const clusterTile = await getClusterBowTexture(clusterId).catch(() => null);
  if (clusterTile && clusterTile.terms.length > 0) {
    return {
      terms: clusterTile.terms.slice(0, BOW_DIM),
      weights: padOrTrim(clusterTile.weights, BOW_DIM),
    };
  }

  // Fallback: build BoW from file tags (no Qdrant needed)
  const freq = new Map<string, number>();
  for (const f of dirFiles) {
    for (const tag of f.tags ?? []) {
      freq.set(tag, (freq.get(tag) ?? 0) + 1);
    }
  }
  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, BOW_DIM);
  const total = sorted.reduce((s, [, c]) => s + c, 0) || 1;
  return {
    terms:   sorted.map(([t]) => t),
    weights: padOrTrim(sorted.map(([, c]) => c / total), BOW_DIM),
  };
}

// ── Phase 2: Reduce — build one GlyphDescriptor per cluster ──────────────────

async function reduceCluster(
  clusterId: number,
  files: RawFile[],
  hypCluster: HypergraphCluster | undefined,
  pageRankMap: Map<string, number>,
  totalFiles: number
): Promise<GlyphDescriptor> {
  const { terms, weights } = await mapClusterBoW(clusterId, files);

  // PageRank mean of top-5 files (sorted by fanIn fallback)
  const prScores = files
    .map((f) => pageRankMap.get(f.rel) ?? (f.fanIn ?? 0) / 200)
    .sort((a, b) => b - a)
    .slice(0, 5);
  const pageRankMean = prScores.length
    ? prScores.reduce((s, v) => s + v, 0) / prScores.length
    : 0;

  // SOM centroid: majority-vote of BMU coords
  const somRows = files.map((f) => f.somBmuRow ?? -1).filter((v) => v >= 0);
  const somCols = files.map((f) => f.somBmuCol ?? -1).filter((v) => v >= 0);
  const somRowCentroid = somRows.length
    ? somRows.reduce((s, v) => s + v, 0) / somRows.length / SOM_GRID_H
    : 0;
  const somColCentroid = somCols.length
    ? somCols.reduce((s, v) => s + v, 0) / somCols.length / SOM_GRID_W
    : 0;

  const ssrRiskFiles  = files.filter((f) => f.ssrUnsafe).length;
  const pairedFiles   = files.filter((f) => f.hasPairedTest).length;

  // Derive top dirs from cluster files
  const dirFreq = new Map<string, number>();
  for (const f of files) {
    const d = f.rel.split('/').slice(0, -1).join('/');
    dirFreq.set(d, (dirFreq.get(d) ?? 0) + 1);
  }
  const topDirs = [...dirFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([d]) => d);

  return {
    clusterId,
    topic:          hypCluster?.inferredTopic ?? `Cluster ${clusterId}`,
    topDirs:        hypCluster?.topDirs ?? topDirs,
    terms:          terms.slice(0, BOW_DIM),
    weights:        padOrTrim(weights, BOW_DIM),
    pageRankMean:   Math.min(1, pageRankMean),
    fileCount:      files.length,
    auditScore:     0.75, // placeholder — populated from KAG wiki note below
    ssrRisk:        files.length > 0 ? ssrRiskFiles / files.length : 0,
    somRowCentroid,
    somColCentroid,
    pairedTestRatio:files.length > 0 ? pairedFiles / files.length : 0,
    dirCount:       dirFreq.size,
  };
}

// ── Phase 3: Pack — all glyphs → Float32Array ─────────────────────────────────

function packAtlas(glyphs: GlyphDescriptor[]): Float32Array {
  const buf = new Float32Array(glyphs.length * DESCRIPTOR_STRIDE);
  for (let i = 0; i < glyphs.length; i++) {
    const base = i * DESCRIPTOR_STRIDE;
    const g = glyphs[i];
    // [0..63] BoW weights
    for (let j = 0; j < BOW_DIM; j++) buf[base + j] = g.weights[j] ?? 0;
    // [64..70] scalar features
    buf[base + 64] = g.pageRankMean;
    buf[base + 65] = g.fileCount / 500; // normalise by expected max
    buf[base + 66] = g.auditScore;
    buf[base + 67] = g.ssrRisk;
    buf[base + 68] = g.somRowCentroid;
    buf[base + 69] = g.somColCentroid;
    buf[base + 70] = g.pairedTestRatio;
    // [71..127] zero-padded
  }
  return buf;
}

// ── Phase 4: Similarity matrix (cosine, upper-triangle) ───────────────────────

function buildSimilarityMatrix(glyphs: GlyphDescriptor[]): number[] {
  const n = glyphs.length;
  const sim: number[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      sim.push(cosine(glyphs[i].weights, glyphs[j].weights));
    }
  }
  return sim;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function buildGlyphAtlas(opts: {
  forceRebuild?: boolean;
  limitClusters?: number;
}): Promise<GlyphAtlasResult> {
  const redis = getRedis();

  // Cache check
  if (!opts.forceRebuild) {
    try {
      const cached = await redis.get(ATLAS_REDIS_KEY);
      if (cached) {
        const manifest = JSON.parse(cached) as GlyphAtlasManifest;
        const atlasBase64 = await redis.get(`${ATLAS_REDIS_KEY}:buf`) ?? '';
        return { manifest, atlasBase64, fromCache: true };
      }
    } catch { /* proceed to rebuild */ }
  }

  // Load graph + hypergraph
  const [graph, hypClusters] = await Promise.all([loadGraph(), loadHypergraphClusters()]);
  const files = graph.files ?? [];

  // Load PageRank scores from Redis (written by run-pagerank.ts)
  let pageRankMap = new Map<string, number>();
  try {
    const prJson = await redis.get('couchdb:pagerank_scores');
    if (prJson) {
      const prObj = JSON.parse(prJson) as Record<string, number>;
      pageRankMap = new Map(Object.entries(prObj));
    }
  } catch { /* fallback to fanIn */ }

  // Load KAG audit scores in bulk — simdjson AVX2 fast-parse for ≥10/≥5KB
  // aggregate (wiki notes are typically 1-5KB each so the threshold trips
  // when the codebase has ≥10 directories with cached notes).
  const allDirs = [...new Set(files.map((f) => f.rel.split('/').slice(0, -1).join('/')))];
  const kagKeys = allDirs.map((d) => `wiki:note:dir:${d.replace(/[^a-z0-9]/gi, '_')}`);
  let kagVals: (string | null)[] = [];
  try {
    kagVals = kagKeys.length ? await redis.mget(...kagKeys) : [];
  } catch { /* non-fatal */ }

  const kagAuditMap = new Map<string, number>();
  // Choose parser per total payload — V8 wins for tiny aggregates, simdjson wins for ≥5KB
  const totalChars = kagVals.reduce((sum, v) => sum + (v?.length ?? 0), 0);
  let parseFn: <T>(s: string) => T = (s) => JSON.parse(s) as never;
  if (kagVals.length >= 10 && totalChars >= 5_000) {
    try {
      const { fastJsonParse, isSimdJsonAvailable } = await import('$lib/server/gpu/simdjson-bridge.js');
      if (isSimdJsonAvailable()) parseFn = fastJsonParse;
    } catch { /* addon unavailable — keep V8 */ }
  }
  for (let i = 0; i < allDirs.length; i++) {
    const raw = kagVals[i];
    if (!raw) continue;
    try {
      const note = parseFn<{ auditScore?: number }>(raw);
      if (note.auditScore != null) kagAuditMap.set(allDirs[i], note.auditScore / 100);
    } catch { /* ignore */ }
  }

  // Group files by cluster (Map phase)
  const clusterFiles = new Map<number, RawFile[]>();
  for (const f of files) {
    const cid = f.clusterId ?? -1;
    if (!clusterFiles.has(cid)) clusterFiles.set(cid, []);
    clusterFiles.get(cid)!.push(f);
  }

  // Sort clusters by file count desc; optionally limit
  let clusterIds = [...clusterFiles.keys()]
    .filter((id) => id >= 0)
    .sort((a, b) => (clusterFiles.get(b)?.length ?? 0) - (clusterFiles.get(a)?.length ?? 0));
  if (opts.limitClusters && opts.limitClusters > 0) {
    clusterIds = clusterIds.slice(0, opts.limitClusters);
  }

  const hypClusterMap = new Map(hypClusters.map((c) => [c.clusterId, c]));

  // Reduce phase (parallelised 4 at a time)
  const glyphs: GlyphDescriptor[] = [];
  const CONCURRENCY = 4;
  for (let i = 0; i < clusterIds.length; i += CONCURRENCY) {
    const batch = clusterIds.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map((cid) =>
        reduceCluster(
          cid,
          clusterFiles.get(cid) ?? [],
          hypClusterMap.get(cid),
          pageRankMap,
          files.length
        )
      )
    );
    // Patch auditScore from KAG
    for (const g of results) {
      const dirScores = (clusterFiles.get(g.clusterId) ?? []).map((f) => {
        const d = f.rel.split('/').slice(0, -1).join('/');
        return kagAuditMap.get(d) ?? 0.75;
      });
      if (dirScores.length) {
        g.auditScore = dirScores.reduce((s, v) => s + v, 0) / dirScores.length;
      }
    }
    glyphs.push(...results);
  }

  // Pack atlas buffer
  const atlasBuf = packAtlas(glyphs);
  const atlasBase64 = Buffer.from(atlasBuf.buffer).toString('base64');

  // Cosine similarity matrix
  const similarity = buildSimilarityMatrix(glyphs);

  const manifest: GlyphAtlasManifest = {
    version:      ATLAS_VERSION,
    builtAt:      new Date().toISOString(),
    clusterCount: glyphs.length,
    totalFiles:   files.length,
    stride:       DESCRIPTOR_STRIDE,
    bowDim:       BOW_DIM,
    clusterOrder: glyphs.map((g) => g.clusterId),
    glyphs,
    similarity,
  };

  // Write to Redis
  try {
    await Promise.all([
      redis.setex(ATLAS_REDIS_KEY, ATLAS_TTL, JSON.stringify(manifest)),
      redis.setex(`${ATLAS_REDIS_KEY}:buf`, ATLAS_TTL, atlasBase64),
    ]);
  } catch { /* non-fatal */ }

  return { manifest, atlasBase64, fromCache: false };
}

/**
 * Compare two clusters: returns per-dimension diff, cosine similarity,
 * and top diverging terms (for UI side-by-side comparison).
 */
export function compareGlyphs(
  a: GlyphDescriptor,
  b: GlyphDescriptor
): {
  cosineSimilarity:   number;
  l2Distance:         number;
  topDivergingTerms:  Array<{ term: string; aWeight: number; bWeight: number; delta: number }>;
  scalarDiff: {
    pageRank:    number;
    ssrRisk:     number;
    auditScore:  number;
    pairedTest:  number;
    somDistance: number;
  };
} {
  const cosineSimilarity = cosine(a.weights, b.weights);

  let l2 = 0;
  for (let i = 0; i < BOW_DIM; i++) {
    const d = (a.weights[i] ?? 0) - (b.weights[i] ?? 0);
    l2 += d * d;
  }
  const l2Distance = Math.sqrt(l2);

  // Union of terms from both glyphs
  const allTerms = new Set([...a.terms, ...b.terms]);
  const aTermMap  = new Map(a.terms.map((t, i) => [t, a.weights[i] ?? 0]));
  const bTermMap  = new Map(b.terms.map((t, i) => [t, b.weights[i] ?? 0]));

  const topDivergingTerms = [...allTerms]
    .map((term) => ({
      term,
      aWeight: aTermMap.get(term) ?? 0,
      bWeight: bTermMap.get(term) ?? 0,
      delta:   Math.abs((aTermMap.get(term) ?? 0) - (bTermMap.get(term) ?? 0)),
    }))
    .sort((x, y) => y.delta - x.delta)
    .slice(0, 20);

  const somDist = Math.sqrt(
    Math.pow(a.somRowCentroid - b.somRowCentroid, 2) +
    Math.pow(a.somColCentroid - b.somColCentroid, 2)
  );

  return {
    cosineSimilarity,
    l2Distance,
    topDivergingTerms,
    scalarDiff: {
      pageRank:   a.pageRankMean   - b.pageRankMean,
      ssrRisk:    a.ssrRisk        - b.ssrRisk,
      auditScore: a.auditScore     - b.auditScore,
      pairedTest: a.pairedTestRatio - b.pairedTestRatio,
      somDistance: somDist,
    },
  };
}
