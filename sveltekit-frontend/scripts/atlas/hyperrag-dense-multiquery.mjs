#!/usr/bin/env node
/**
 * hyperrag-dense-multiquery.mjs
 * Phase B: 4D Qdrant Multi-Query with Cluster Prefilter
 *
 * Embeds a query, prefilters to top clusters via the TurboVec sidecar,
 * then runs a filtered + unfiltered Qdrant dense search in parallel.
 * RRF-merges both result sets and enriches with Karpathy blend scores.
 *
 * Usage:
 *   node scripts/atlas/hyperrag-dense-multiquery.mjs --query "XState machine patterns"
 *   node scripts/atlas/hyperrag-dense-multiquery.mjs --query "Redis cache layer" --top-k 20 --json
 *
 * Env:
 *   OLLAMA_URL        default http://localhost:11434
 *   EMBED_MODEL       default embeddinggemma:latest
 *   QDRANT_URL        default http://localhost:6333
 *   REDIS_URL         default redis://127.0.0.1:6379
 *   TURBOVEC_URL      default http://127.0.0.1:8099
 *   COLLECTION        default codebase_chunks_768
 *   SVELTEKIT_URL     default http://localhost:5173
 */

import Redis from 'ioredis';

// ── Config ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const argGet = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : null; };

const QUERY       = argGet('--query') ?? argv.find(a => !a.startsWith('-')) ?? '';
const TOP_K       = Number(argGet('--top-k') ?? 15);
const TOP_CLUSTERS = Number(argGet('--top-clusters') ?? 5);
const JSON_OUT    = argv.includes('--json');
const NO_SIDECAR  = argv.includes('--no-sidecar');
const DRY_RUN     = argv.includes('--dry-run');

const OLLAMA_URL   = process.env.OLLAMA_URL      ?? 'http://localhost:11434';
const EMBED_MODEL  = process.env.EMBED_MODEL     ?? 'embeddinggemma:latest';
const SVELTEKIT    = process.env.SVELTEKIT_URL   ?? 'http://localhost:5173';
const QDRANT_URL   = process.env.QDRANT_URL      ?? 'http://localhost:6333';
const REDIS_URL    = process.env.REDIS_URL       ?? 'redis://127.0.0.1:6379';
const TURBOVEC_URL = process.env.TURBOVEC_URL    ?? 'http://127.0.0.1:8099';
const COLLECTION   = process.env.COLLECTION      ?? 'codebase_chunks_768';
const RRF_K        = 60;  // Reciprocal Rank Fusion constant

if (!QUERY) {
  console.error('Usage: node hyperrag-dense-multiquery.mjs --query "your question"');
  process.exit(1);
}

// ── Redis (cold-start safe) ────────────────────────────────────────────────────
const redis = new Redis(REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  retryStrategy: () => null,
});
redis.on('error', () => {});
let redisReady = false;
try {
  await redis.connect();
  await redis.ping();
  redisReady = true;
} catch { /* offline — no Karpathy enrichment */ }

// ── Step 1: Embed the query ────────────────────────────────────────────────────
async function embedQuery(query) {
  // Try SvelteKit /api/embed first (Redis L1 + Bifrost L2 cached)
  try {
    const r = await fetch(`${SVELTEKIT}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: query, model: EMBED_MODEL }),
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) {
      const d = await r.json();
      const vec = d.embedding ?? d.embeddings?.[0];
      if (Array.isArray(vec) && vec.length > 0) return vec;
    }
  } catch { /* fall through */ }

  // Direct Ollama fallback
  const r = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, input: query }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`Ollama embed failed: ${r.status}`);
  const d = await r.json();
  const vec = d.embeddings?.[0] ?? d.embedding;
  if (!Array.isArray(vec)) throw new Error('No embedding returned from Ollama');
  return vec;
}

// ── Step 2: Cluster prefilter via TurboVec sidecar ────────────────────────────
async function getClusterIds(vector) {
  if (NO_SIDECAR) return { clusterIds: [], centroidScores: {}, backend: 'skipped' };

  // Try /prefilter first (our Phase A sidecar and future Python builds)
  try {
    const r = await fetch(`${TURBOVEC_URL}/prefilter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vector, topClusters: TOP_CLUSTERS }),
      signal: AbortSignal.timeout(3000),
    });
    if (r.ok) {
      const d = await r.json();
      if (Array.isArray(d.clusterIds)) return { ...d, backend: 'prefilter' };
    }
  } catch { /* fall through to /search */ }

  // Fallback: use /search and derive unique cluster IDs from results
  try {
    const r = await fetch(`${TURBOVEC_URL}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vector, k: TOP_CLUSTERS * 20 }),
      signal: AbortSignal.timeout(5000),
    });
    if (r.ok) {
      const d = await r.json();
      const candidates = d.candidates ?? d.results ?? [];
      const seen = new Set();
      const clusterIds = [];
      const centroidScores = {};
      for (const c of candidates) {
        const cid = c.cluster ?? c.cluster_id;
        if (cid != null && !seen.has(cid)) {
          seen.add(cid);
          clusterIds.push(Number(cid));
          centroidScores[cid] = c.score ?? 0;
          if (clusterIds.length >= TOP_CLUSTERS) break;
        }
      }
      if (clusterIds.length > 0) return { clusterIds, centroidScores, backend: 'search-derived' };
    }
  } catch { /* sidecar offline */ }

  return { clusterIds: [], centroidScores: {}, backend: 'offline' };
}

// ── Resolve payload source ref ─────────────────────────────────────────────────
function sourceRef(payload) {
  return payload?.path ?? payload?.source_ref ?? payload?.relativePath ?? null;
}

// ── Step 3: Qdrant dense search ────────────────────────────────────────────────
async function qdrantSearch(vector, { filter, limit, label }) {
  const body = {
    vector: { name: 'content', vector },
    limit,
    with_payload: true,
    with_vector: false,
    ...(filter ? { filter } : {}),
  };
  const r = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) {
    const err = await r.text().catch(() => r.statusText);
    throw new Error(`Qdrant search (${label}) failed ${r.status}: ${err}`);
  }
  const { result } = await r.json();
  return result ?? [];
}

// ── Step 4: RRF merge ─────────────────────────────────────────────────────────
function rrfMerge(resultSets) {
  // resultSets: Array<Array<{id, score, payload}>>
  const scoreMap = new Map(); // pointId → { rrf, payload, qdrantScore }

  for (const results of resultSets) {
    results.forEach((hit, rank) => {
      const key = String(hit.id);
      const prev = scoreMap.get(key) ?? { rrf: 0, payload: hit.payload, qdrantScore: 0 };
      scoreMap.set(key, {
        rrf: prev.rrf + 1 / (RRF_K + rank + 1),
        payload: hit.payload,
        qdrantScore: Math.max(prev.qdrantScore, hit.score),
      });
    });
  }

  return [...scoreMap.entries()]
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.rrf - a.rrf);
}

// ── Step 5: Karpathy blend enrichment ─────────────────────────────────────────
async function enrichWithKarpathy(hits) {
  if (!redisReady) return hits;

  // Batch HGET for paths from payload
  const refs = hits.map(h => sourceRef(h.payload)).filter(Boolean);
  if (!refs.length) return hits;

  const pipeline = redis.pipeline();
  for (const ref of refs) pipeline.hget('gpu:karpathy:scores', ref);
  const results = await pipeline.exec().catch(() => []);

  const karpathyMap = new Map();
  refs.forEach((ref, i) => {
    const raw = results[i]?.[1];
    if (raw) {
      try { karpathyMap.set(ref, JSON.parse(raw)); } catch { /* skip */ }
    }
  });

  return hits.map(h => {
    const ref = sourceRef(h.payload);
    const karpathy = karpathyMap.get(ref);
    return { ...h, karpathy: karpathy ?? null };
  });
}

// ── Step 6: Build Qdrant must-filter from cluster IDs ─────────────────────────
function buildClusterFilter(clusterIds) {
  if (!clusterIds.length) return null;
  return {
    must: [{
      key: 'som_cluster',
      match: { any: clusterIds.map(Number) },
    }],
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────
const t0 = Date.now();

if (!JSON_OUT) {
  console.log(`\n[hyperrag] Phase B: 4D Qdrant Multi-Query`);
  console.log(`[hyperrag] Query: "${QUERY}"`);
  console.log(`[hyperrag] Top-K: ${TOP_K}, Top-clusters: ${TOP_CLUSTERS}`);
  console.log(`[hyperrag] Collection: ${COLLECTION}\n`);
}

if (DRY_RUN) {
  console.log('[hyperrag] Dry run — exiting without search');
  process.exit(0);
}

// 1. Embed
if (!JSON_OUT) process.stdout.write('[hyperrag] Embedding query… ');
const embedding = await embedQuery(QUERY);
if (!JSON_OUT) console.log(`done (${embedding.length}d, ${Date.now() - t0}ms)`);

// 2. Cluster prefilter
if (!JSON_OUT) process.stdout.write('[hyperrag] Cluster prefilter… ');
const { clusterIds, centroidScores, backend: sidecarBackend } = await getClusterIds(embedding);
if (!JSON_OUT) console.log(`${clusterIds.length} clusters via ${sidecarBackend} (${Date.now() - t0}ms)`);

const clusterFilter = buildClusterFilter(clusterIds);

// 3. Parallel searches — filtered + unfiltered
if (!JSON_OUT) process.stdout.write('[hyperrag] Qdrant dual-search… ');
const [filteredHits, unfilteredHits] = await Promise.all([
  clusterFilter
    ? qdrantSearch(embedding, { filter: clusterFilter, limit: TOP_K * 2, label: 'filtered' })
    : Promise.resolve([]),
  qdrantSearch(embedding, { filter: null, limit: TOP_K * 2, label: 'unfiltered' }),
]);
if (!JSON_OUT) {
  console.log(`filtered=${filteredHits.length}, unfiltered=${unfilteredHits.length} (${Date.now() - t0}ms)`);
}

// 4. RRF merge
const resultSets = clusterFilter
  ? [filteredHits, unfilteredHits]
  : [unfilteredHits];
const merged = rrfMerge(resultSets).slice(0, TOP_K);

// 5. Karpathy enrichment
if (!JSON_OUT) process.stdout.write('[hyperrag] Karpathy enrichment… ');
const enriched = await enrichWithKarpathy(merged);
if (!JSON_OUT) console.log(`done (${Date.now() - t0}ms total)\n`);

// ── Output ────────────────────────────────────────────────────────────────────
const output = {
  query: QUERY,
  clusterIds,
  centroidScores,
  sidecarBackend,
  latencyMs: Date.now() - t0,
  resultCount: enriched.length,
  results: enriched.map((h, rank) => ({
    rank: rank + 1,
    id: h.id,
    rrfScore: parseFloat(h.rrf.toFixed(6)),
    qdrantScore: parseFloat(h.qdrantScore.toFixed(4)),
    karpathyBlend: h.karpathy?.blend ?? null,
    source_ref: sourceRef(h.payload),
    cluster: h.payload?.som_cluster ?? h.payload?.cluster_id ?? null,
    text: (h.payload?.content ?? h.payload?.text)?.slice(0, 240) ?? null,
    tags: h.payload?.qdrant_tags ?? h.payload?.tags ?? [],
  })),
};

if (JSON_OUT) {
  console.log(JSON.stringify(output, null, 2));
} else {
  // Pretty print
  console.log(`${'─'.repeat(72)}`);
  console.log(`  Results for: "${QUERY}"`);
  console.log(`  Clusters used: [${clusterIds.join(', ')}] via ${sidecarBackend}`);
  console.log(`  Latency: ${output.latencyMs}ms  |  Hits: ${enriched.length}`);
  console.log(`${'─'.repeat(72)}\n`);

  for (const r of output.results) {
    const blend = r.karpathyBlend != null ? ` | blend=${r.karpathyBlend.toFixed(3)}` : '';
    const cluster = r.cluster != null ? ` | cluster=${r.cluster}` : '';
    console.log(`  #${String(r.rank).padStart(2)} rrf=${r.rrfScore.toFixed(4)} qdrant=${r.qdrantScore.toFixed(4)}${blend}${cluster}`);
    console.log(`     ${r.source_ref ?? '(no ref)'}`);
    if (r.text) console.log(`     ${r.text.replace(/\n/g, ' ').slice(0, 120)}…`);
    if (r.tags?.length) console.log(`     tags: ${r.tags.slice(0, 6).join(', ')}`);
    console.log();
  }
}

if (redisReady) redis.disconnect();