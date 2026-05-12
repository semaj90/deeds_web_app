/**
 * NES CHR97 Glyph Tile Engine — Server-side
 *
 * Converts embedding clusters (KAG/DAG/RAG) into a NES-style tile atlas:
 *   embeddings[n × 768] → kMeans(k) centroids → 2D grid (via manifold[0..1])
 *                       → CouchDB glyph_topology (4D for graph analysis)
 *                       → Redis tile cache (fast lookup)
 *                       → RabbitMQ glyph.tile.rebuild (async rebuild trigger)
 *
 * The 2D tile grid is a semantic Voronoi map:
 *   - Adjacent tiles are semantically similar (nearest centroid)
 *   - First two embedding dimensions project to grid X/Y
 *     (mirrors chr97-builder.ts manifold[0..1] convention)
 *
 * OOM prevention: pLimit(2) bounds concurrent N-API kMeans builds.
 * Each build processes embeddings in CHUNK_SIZE=32 batches.
 */

import pLimit from 'p-limit';
import { runKMeans, scoreAttention } from '$lib/server/grpc/graph-ml-client.js';
import { getRedis } from '$lib/server/redis.js';
import { ENV } from '$lib/server/env.server.js';

// ── Constants ──────────────────────────────────────────────────────────────────

const DIM = 768;
const CHUNK_SIZE = 32;               // max embeddings per kMeans chunk
const DEFAULT_GRID_W = 16;
const DEFAULT_GRID_H = 16;
const TILE_REDIS_PREFIX = 'glyph:tile:atlas:';
const TILE_REDIS_TTL = 3_600;        // 1 hour
const COUCHDB_DB = 'glyph_topology';

// ── OOM gate ──────────────────────────────────────────────────────────────────

/** pLimit(2) — max 2 concurrent GPU kMeans builds (each ~200MB VRAM) */
const _buildLimit = pLimit(2);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GlyphTile {
  clusterId: number;
  gridX: number;          // 0..gridW-1
  gridY: number;          // 0..gridH-1
  normX: number;          // 0.0..1.0 (for WebGPU Voronoi shader)
  normY: number;          // 0.0..1.0
  centroid: number[];     // 768-dim centroid embedding (f32)
  manifold4: [number, number, number, number]; // 4D topology coords for CouchDB
  runeCount: number;      // how many source vectors landed in this cluster
  entities: string[];     // merged entity list across cluster members
  confidence: number;     // mean cosine similarity of members to centroid
}

export interface GlyphTileAtlas {
  caseId: string;
  gridW: number;
  gridH: number;
  tileCount: number;
  tiles: GlyphTile[];
  buildMs: number;
  source: 'gpu' | 'cpu' | 'redis' | 'grpc';
}

export interface EmbeddingPoint {
  embedding: number[]; // 768-dim
  entities?: string[];
  sourceId?: string;
}

// ── Redis helpers ─────────────────────────────────────────────────────────────

async function _redisSave(caseId: string, atlas: GlyphTileAtlas): Promise<void> {
  try {
    const redis = getRedis();
    // Store only the metadata + lightweight tile grid (no full centroids) to bound key size
    const slim = {
      caseId: atlas.caseId,
      gridW: atlas.gridW,
      gridH: atlas.gridH,
      tileCount: atlas.tileCount,
      buildMs: atlas.buildMs,
      source: atlas.source,
      tiles: atlas.tiles.map((t) => ({
        clusterId: t.clusterId,
        gridX: t.gridX,
        gridY: t.gridY,
        normX: t.normX,
        normY: t.normY,
        runeCount: t.runeCount,
        entities: t.entities.slice(0, 8),
        confidence: t.confidence,
        manifold4: t.manifold4,
        // centroid omitted from Redis — too large; clients use /api/glyph/tile-atlas for full data
      })),
    };
    await redis.set(`${TILE_REDIS_PREFIX}${caseId}`, JSON.stringify(slim), 'EX', TILE_REDIS_TTL);
  } catch {
    // Redis unavailable — non-fatal
  }
}

async function _redisLoad(caseId: string): Promise<GlyphTileAtlas | null> {
  try {
    const redis = getRedis();
    const raw = await redis.get(`${TILE_REDIS_PREFIX}${caseId}`);
    if (!raw) return null;
    const slim = JSON.parse(raw);
    // Centroids not cached in Redis — fill with empty arrays
    slim.tiles = slim.tiles.map((t: GlyphTile) => ({ ...t, centroid: [] }));
    slim.source = 'redis';
    return slim as GlyphTileAtlas;
  } catch {
    return null;
  }
}

// ── CouchDB topology store ────────────────────────────────────────────────────
// Stores the full 4D topology for graph analysis (CouchDB REST API).
// Lightweight — no client library needed; uses standard fetch.

async function _couchSave(caseId: string, atlas: GlyphTileAtlas): Promise<void> {
  const url = `${ENV.COUCHDB_URL}/${COUCHDB_DB}/${encodeURIComponent(caseId)}`;
  try {
    // Check for existing _rev (required for upsert)
    const head = await fetch(url, { method: 'HEAD' });
    let rev: string | undefined;
    if (head.ok) {
      rev = head.headers.get('ETag')?.replace(/"/g, '');
    }

    const doc: Record<string, unknown> = {
      _id: caseId,
      type: 'glyph_topology',
      caseId,
      gridW: atlas.gridW,
      gridH: atlas.gridH,
      tileCount: atlas.tileCount,
      buildMs: atlas.buildMs,
      updatedAt: new Date().toISOString(),
      // 4D manifold topology — one entry per tile
      topology: atlas.tiles.map((t) => ({
        clusterId: t.clusterId,
        gridX: t.gridX,
        gridY: t.gridY,
        manifold4: t.manifold4,
        runeCount: t.runeCount,
        entities: t.entities.slice(0, 8),
        confidence: t.confidence,
      })),
    };
    if (rev) doc._rev = rev;

    // Ensure DB exists
    await fetch(`${ENV.COUCHDB_URL}/${COUCHDB_DB}`, { method: 'PUT' }).catch(() => {});
    await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(doc),
    });
  } catch {
    // CouchDB unavailable — non-fatal
  }
}

// ── Grid projection ───────────────────────────────────────────────────────────

/**
 * Project a 768-dim embedding to 2D grid coordinates.
 *
 * Uses the first two embedding dimensions as the manifold — mirrors
 * chr97-builder.ts: manifold[0] = embedding[0], manifold[1] = embedding[1].
 * Sentence embeddings are L2-normalised so dim[0..1] ∈ [-1, 1].
 *
 * Grid collision resolution: occupied cells shift right → wrap to next row.
 */
function _projectToGrid(
  centroids: Float32Array,
  k: number,
  gridW: number,
  gridH: number,
  occupied: Set<number>
): Array<{ gx: number; gy: number; normX: number; normY: number }> {
  const positions: Array<{ gx: number; gy: number; normX: number; normY: number }> = [];

  for (let i = 0; i < k; i++) {
    const c0 = centroids[i * DIM] ?? 0; // manifold[0]
    const c1 = centroids[i * DIM + 1] ?? 0; // manifold[1]

    // Map [-1,1] → [0, gridW/H - 1]
    let gx = Math.round(((c0 + 1) / 2) * (gridW - 1));
    let gy = Math.round(((c1 + 1) / 2) * (gridH - 1));
    gx = Math.max(0, Math.min(gridW - 1, gx));
    gy = Math.max(0, Math.min(gridH - 1, gy));

    // Collision resolution — linear probe
    let attempts = 0;
    while (occupied.has(gy * gridW + gx) && attempts < gridW * gridH) {
      gx = (gx + 1) % gridW;
      if (gx === 0) gy = (gy + 1) % gridH;
      attempts++;
    }
    occupied.add(gy * gridW + gx);

    positions.push({
      gx,
      gy,
      normX: gx / (gridW - 1),
      normY: gy / (gridH - 1),
    });
  }

  return positions;
}

// ── 4D manifold extraction ────────────────────────────────────────────────────

function _manifold4(centroid: Float32Array, offset: number): [number, number, number, number] {
  return [
    centroid[offset] ?? 0,
    centroid[offset + 1] ?? 0,
    centroid[offset + 2] ?? 0,
    centroid[offset + 3] ?? 0,
  ];
}

// ── Core builder ──────────────────────────────────────────────────────────────

/**
 * Build a NES CHR97 glyph tile atlas from a set of embedding points.
 *
 * Called with data from:
 *   - KAG expansion: neighbor node embeddings
 *   - DAG document: chunk embeddings from Qdrant RAG hits
 *   - Cartridge runes: pre-computed FP16 tensors from a case cartridge
 *
 * @param caseId   - Used as Redis cache key + CouchDB document ID
 * @param points   - Embedding vectors with optional entity metadata
 * @param gridW    - NES tile grid width (default 16)
 * @param gridH    - NES tile grid height (default 16)
 * @param skipCache- Bypass Redis read (force rebuild)
 */
export async function buildGlyphTileAtlas(
  caseId: string,
  points: EmbeddingPoint[],
  gridW = DEFAULT_GRID_W,
  gridH = DEFAULT_GRID_H,
  skipCache = false
): Promise<GlyphTileAtlas> {
  // Redis read (fast path)
  if (!skipCache) {
    const cached = await _redisLoad(caseId);
    if (cached) return cached;
  }

  // Guard against empty input
  if (points.length === 0) {
    return { caseId, gridW, gridH, tileCount: 0, tiles: [], buildMs: 0, source: 'cpu' };
  }

  // Use the concurrency gate — prevents OOM from parallel builds
  return _buildLimit(async () => {
    const t0 = performance.now();

    // Determine k: sqrt heuristic, clamped to [2, gridW × gridH, 64]
    const k = Math.max(2, Math.min(Math.round(Math.sqrt(points.length)), gridW * gridH, 64));

    // Build flat Float32Array in chunks of CHUNK_SIZE to bound peak memory
    const n = points.length;
    const embeddings = new Float32Array(n * DIM);
    for (let i = 0; i < n; i++) {
      const v = points[i].embedding;
      for (let d = 0; d < DIM && d < v.length; d++) {
        embeddings[i * DIM + d] = v[d];
      }
    }

    // N-API kMeans (GPU → CPU fallback inside pytorch-graph addon)
    const kmResult = await runKMeans(embeddings, n, DIM, k);
    const { centroids, assignments, source } = kmResult;

    // Aggregate entity lists per cluster
    const clusterEntities: Map<number, Set<string>> = new Map();
    const clusterCounts: Map<number, number> = new Map();
    for (let i = 0; i < n; i++) {
      const cid = assignments[i];
      if (cid === undefined) continue;
      if (!clusterEntities.has(cid)) clusterEntities.set(cid, new Set());
      if (!clusterCounts.has(cid)) clusterCounts.set(cid, 0);
      clusterCounts.set(cid, (clusterCounts.get(cid) ?? 0) + 1);
      for (const e of points[i].entities ?? []) {
        clusterEntities.get(cid)!.add(e);
      }
    }

    // Compute per-cluster confidence (mean cosine similarity to centroid)
    const clusterConfSum: Map<number, number> = new Map();
    for (let i = 0; i < n; i++) {
      const cid = assignments[i];
      if (cid === undefined) continue;
      const pointVec = embeddings.subarray(i * DIM, (i + 1) * DIM);
      const centroidVec = centroids.subarray(cid * DIM, (cid + 1) * DIM);
      // cosine similarity (both L2-normalised by kMeans)
      let dot = 0;
      for (let d = 0; d < DIM; d++) dot += (pointVec[d] ?? 0) * (centroidVec[d] ?? 0);
      clusterConfSum.set(cid, (clusterConfSum.get(cid) ?? 0) + dot);
    }

    // Project centroids to 2D grid
    const occupied = new Set<number>();
    const positions = _projectToGrid(centroids, k, gridW, gridH, occupied);

    // Assemble tile objects
    const tiles: GlyphTile[] = [];
    for (let ci = 0; ci < k; ci++) {
      const pos = positions[ci]!;
      const count = clusterCounts.get(ci) ?? 0;
      const confSum = clusterConfSum.get(ci) ?? 0;
      tiles.push({
        clusterId: ci,
        gridX: pos.gx,
        gridY: pos.gy,
        normX: pos.normX,
        normY: pos.normY,
        centroid: Array.from(centroids.subarray(ci * DIM, (ci + 1) * DIM)),
        manifold4: _manifold4(centroids, ci * DIM),
        runeCount: count,
        entities: Array.from(clusterEntities.get(ci) ?? []).slice(0, 16),
        confidence: count > 0 ? confSum / count : 0,
      });
    }

    // Sort tiles by grid position (top-left → bottom-right reading order)
    tiles.sort((a, b) => a.gridY * gridW + a.gridX - (b.gridY * gridW + b.gridX));

    const atlas: GlyphTileAtlas = {
      caseId,
      gridW,
      gridH,
      tileCount: tiles.length,
      tiles,
      buildMs: Math.round(performance.now() - t0),
      source,
    };

    // Async persist (fire-and-forget — don't block response)
    Promise.all([_redisSave(caseId, atlas), _couchSave(caseId, atlas)]).catch(() => {});

    return atlas;
  });
}

// ── Nearest-tile search (N-API attention) ─────────────────────────────────────

/**
 * Find the nearest tile(s) for a query embedding using scaled dot-product attention.
 * Uses N-API GPU attention (scoreAttention) for fast lookup against all tile centroids.
 *
 * @param queryEmbedding - 768-dim query vector (Float32Array or number[])
 * @param atlas          - tile atlas to search
 * @param topK           - number of nearest tiles to return (default 3)
 */
export async function searchGlyphTiles(
  queryEmbedding: Float32Array | number[],
  atlas: GlyphTileAtlas,
  topK = 3
): Promise<GlyphTile[]> {
  if (atlas.tiles.length === 0) return [];

  const query =
    queryEmbedding instanceof Float32Array ? queryEmbedding : new Float32Array(queryEmbedding);

  // Build flat centroid matrix [k × DIM]
  const k = atlas.tiles.length;
  const keys = new Float32Array(k * DIM);
  for (let i = 0; i < k; i++) {
    const c = atlas.tiles[i]!.centroid;
    for (let d = 0; d < DIM && d < c.length; d++) {
      keys[i * DIM + d] = c[d]!;
    }
  }

  // Scaled dot-product attention — GPU path via N-API, CPU fallback inside addon
  const { scores } = await scoreAttention(query, DIM, keys, k);

  // Return top-K tiles by descending attention score
  const ranked = atlas.tiles
    .map((tile, i) => ({ tile, score: scores[i] ?? 0 }))
    .sort((a, b) => b.score - a.score);

  return ranked.slice(0, topK).map((r) => r.tile);
}

// ── Cache invalidation ────────────────────────────────────────────────────────

export async function invalidateGlyphAtlas(caseId: string): Promise<void> {
  try {
    const redis = getRedis();
    await redis.del(`${TILE_REDIS_PREFIX}${caseId}`);
  } catch {
    // non-fatal
  }
}

/** Retrieve a cached GlyphTileAtlas from Redis (returns null if not cached). */
export async function getGlyphTileAtlas(caseId: string): Promise<GlyphTileAtlas | null> {
  return _redisLoad(caseId);
}

// ── RabbitMQ rebuild trigger ──────────────────────────────────────────────────
// Published after SOM topology rebuild or new evidence indexing.

export async function publishGlyphRebuild(caseId: string, reason: string): Promise<boolean> {
  try {
    const { rabbitmq } = await import('$lib/server/queue/rabbitmq-manager-fixed.js');
    await rabbitmq.publishToQueue('glyph.tile.rebuild', { caseId, reason, ts: Date.now() });
    return true;
  } catch {
    return false;
  }
}
