/**
 * cluster-summary-forest.ts — Forest-level ACE cluster prefilter
 *
 * Problem: Qdrant ANN scans all chunks O(N). AST tree-shaking examines files
 * one by one. We want to beat both by routing queries to relevant *forests*
 * (GPU k-means clusters) before touching individual chunks.
 *
 * Approach:
 *   1. Embed each cluster's LLM-generated summary text ("cluster:summary:{id}")
 *      and cache as "cluster:forest:embed:{id}" (1h TTL, Base64 Float32Array).
 *   2. At query time: embed query → cosine-similarity against all cached forest
 *      embeddings (single Redis MGET + CPU dot-products, <1ms for ≤50 clusters).
 *   3. Return top-K cluster IDs — caller adds a Qdrant `should` filter so only
 *      chunks belonging to those clusters are ANN-searched.
 *
 * Warm path:  MGET + CPU cosine, ~0.5ms
 * Cold path:  embed summary on-demand (lazy), ~2s first call per cluster
 * Warmup:     call warmForestEmbeddings() from the graphify nightly cron
 */

import { getRedis } from '$lib/server/redis.js';
import { ENV } from '$lib/server/env.server.js';

// ── Constants ────────────────────────────────────────────────────────────────

const TTL_FOREST_EMBED_S = 3_600;            // 1h — refresh when summaries regenerate
const FOREST_KNOWN_IDS_KEY = 'cluster:forest:known_ids';  // Redis SET of known cluster IDs
const DEFAULT_TOP_K = 5;
const DEFAULT_MIN_SIM = 0.22;                // lower than centroid (text ≠ vector geometry)

// ── Encoding (inline, independent of tensor-similarity-cache exports) ─────────

function float32ToBase64(arr: Float32Array): string {
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).toString('base64');
}

function base64ToFloat32(b64: string): Float32Array {
  const buf = Buffer.from(b64, 'base64');
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

function forestEmbedKey(clusterId: number): string {
  return `cluster:forest:embed:${clusterId}`;
}

// ── Cosine similarity (CPU — fast for ≤50 clusters, ~0.3ms) ──────────────────

function cosineSim(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom < 1e-9 ? 0 : dot / denom;
}

// ── Summary text extraction ───────────────────────────────────────────────────

/**
 * Reads the JSON blob at cluster:summary:{id} and returns the best text
 * representation for embedding: summary > description > label > top paths.
 */
async function getClusterSummaryText(clusterId: number): Promise<string | null> {
  try {
    const redis = getRedis();
    const raw = await redis.get(`cluster:summary:${clusterId}`);
    if (!raw) return null;
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (typeof data.summary     === 'string' && data.summary.length     > 5) return data.summary;
    if (typeof data.description === 'string' && data.description.length > 5) return data.description;
    if (typeof data.label       === 'string' && data.label.length       > 5) return data.label;
    const paths = Array.isArray(data.topPaths) ? (data.topPaths as string[]).slice(0, 6) : [];
    if (paths.length > 0) return `Cluster ${clusterId}: ${paths.join(', ')}`;
    return null;
  } catch { return null; }
}

// ── Embedding helper ──────────────────────────────────────────────────────────

async function embedText(text: string): Promise<Float32Array | null> {
  try {
    // Prefer the gRPC/HTTP cascade embedding client
    const { generateEmbedding } = await import('$lib/server/grpc/embedding-client.js');
    const vec = await generateEmbedding(text);
    if (Array.isArray(vec) && vec.length === 768) return new Float32Array(vec);
  } catch { /* fall through */ }

  // Direct Ollama HTTP fallback (works when gRPC service is down)
  try {
    const ollamaUrl = ENV.OLLAMA_BASE_URL;
    const model     = process.env.EMBEDDING_MODEL  ?? 'embeddinggemma:latest';
    const res = await fetch(`${ollamaUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: text }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const { embedding } = await res.json() as { embedding: number[] };
    if (!Array.isArray(embedding) || embedding.length !== 768) return null;
    return new Float32Array(embedding);
  } catch { return null; }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get or lazily compute the 768-dim embedding for one cluster's summary text.
 * Caches result at cluster:forest:embed:{id} (1h TTL) and registers the ID
 * in the cluster:forest:known_ids Redis SET.
 */
export async function getOrEmbedClusterSummary(clusterId: number): Promise<Float32Array | null> {
  try {
    const redis = getRedis();
    const cached = await redis.get(forestEmbedKey(clusterId));
    if (cached) return base64ToFloat32(cached);

    const text = await getClusterSummaryText(clusterId);
    if (!text) return null;

    const vec = await embedText(text);
    if (!vec) return null;

    // Persist + register (pipeline for single round-trip)
    const pl = redis.pipeline();
    pl.setex(forestEmbedKey(clusterId), TTL_FOREST_EMBED_S, float32ToBase64(vec));
    pl.sadd(FOREST_KNOWN_IDS_KEY, String(clusterId));
    await pl.exec();

    return vec;
  } catch { return null; }
}

export interface ForestClusterHit {
  clusterId:  number;
  similarity: number;
}

/**
 * Rank all known forest clusters by cosine similarity to queryVec.
 * Returns top-K hits above minSimilarity, sorted descending.
 *
 * Hot path: Redis MGET (one round-trip) + CPU dot-product loop.
 * If no embeddings are cached yet (cold start), returns [].
 */
export async function forestClusterRank(
  queryVec: Float32Array,
  topK     = DEFAULT_TOP_K,
  minSim   = DEFAULT_MIN_SIM,
): Promise<ForestClusterHit[]> {
  try {
    const redis  = getRedis();
    const idStrs = await redis.smembers(FOREST_KNOWN_IDS_KEY);
    if (!idStrs.length) return [];

    const clusterIds = idStrs.map(Number).filter(n => !isNaN(n));
    if (!clusterIds.length) return [];

    const raws = await redis.mget(...clusterIds.map(forestEmbedKey));

    const hits: ForestClusterHit[] = [];
    for (let i = 0; i < clusterIds.length; i++) {
      if (!raws[i]) continue;
      try {
        const sim = cosineSim(queryVec, base64ToFloat32(raws[i]!));
        if (sim >= minSim) hits.push({ clusterId: clusterIds[i], similarity: sim });
      } catch { /* skip malformed entry */ }
    }

    return hits.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
  } catch { return []; }
}

/**
 * Background warmup: SCAN cluster:summary:* keys, embed any that aren't cached.
 * Call from graphify nightly cron after cluster summaries are written.
 * Returns counts for observability.
 */
export async function warmForestEmbeddings(): Promise<{ warmed: number; skipped: number }> {
  let warmed = 0, skipped = 0;
  try {
    const redis = getRedis();
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [nextCursor, found] = await redis.scan(cursor, 'MATCH', 'cluster:summary:*', 'COUNT', 100);
      cursor = nextCursor;
      keys.push(...found);
    } while (cursor !== '0');

    for (const key of keys) {
      const id = Number(key.replace('cluster:summary:', ''));
      if (isNaN(id)) { skipped++; continue; }
      const alreadyCached = await redis.exists(forestEmbedKey(id));
      if (alreadyCached) { skipped++; continue; }
      const vec = await getOrEmbedClusterSummary(id);
      if (vec) warmed++; else skipped++;
    }
  } catch { /* non-fatal */ }
  return { warmed, skipped };
}
