#!/usr/bin/env node
/**
 * topology-search-server.mjs
 *
 * Standalone HTTP search engine over the 4D topology-indexed tables.
 * Starts detached alongside the dev server (same pattern as llama-server.exe).
 *
 * Port: 8101  (between go-retrieval :8100 and orchestrator :8102)
 *
 * Endpoints:
 *   GET  /health           → { ok, version, uptime }
 *   POST /search           → Euclidean 4D neighborhood search (tensor_analysis_cache)
 *   POST /search/cosine    → Qdrant cosine search → manifold4 neighborhood expansion
 *   POST /search/hybrid    → cosine prefilter + manifold4 rerank (recommended)
 *
 * POST /search body:
 *   { query?: string, center?: [x,y,z,w], radius?: number, limit?: number,
 *     somCluster?: number, tags?: string[] }
 *
 * POST /search/cosine body:
 *   { query: string, limit?: number, collection?: string }
 *
 * POST /search/hybrid body:
 *   { query: string, radius?: number, limit?: number, somCluster?: number }
 *
 * Start directly:  node scripts/topology-search-server.mjs
 * Start detached:  use scripts/ensure-search-engine.mjs
 * Health check:    curl http://127.0.0.1:8101/health
 */

import http                          from 'node:http';
import { Pool }                      from 'pg';
import process                       from 'node:process';

// ── Config ────────────────────────────────────────────────────────────────────

const PORT     = Number(process.env.TOPOLOGY_SEARCH_PORT ?? 8101);
const HOST     = process.env.TOPOLOGY_SEARCH_HOST ?? '127.0.0.1';
const PG_URL   = process.env.DATABASE_URL ?? process.env.DATABASE_URL_DEV ?? 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db';
const QDRANT   = process.env.QDRANT_URL ?? 'http://localhost:6333';
const EMBED_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const EMBED_MODEL = process.env.EMBEDDING_MODEL ?? 'embeddinggemma:latest';
const VERSION  = '1.0.0';

const START_AT = Date.now();

// ── Postgres pool ─────────────────────────────────────────────────────────────

const pool = new Pool({ connectionString: PG_URL, max: 4, idleTimeoutMillis: 30_000 });

pool.on('error', () => { /* absorb pool errors — non-fatal */ });

// ── Embedding helper ──────────────────────────────────────────────────────────

async function embed(text) {
  const res = await fetch(`${EMBED_URL}/api/embeddings`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ model: EMBED_MODEL, prompt: text }),
    signal:  AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`Embedding failed: ${res.status}`);
  const { embedding } = await res.json();
  if (!Array.isArray(embedding) || embedding.length < 1) throw new Error('Empty embedding');
  return embedding;
}

// ── Qdrant cosine helper ──────────────────────────────────────────────────────

async function qdrantSearch(collection, vector, limit = 20) {
  // codebase_chunks_768 uses named vectors — bare array returns 0 hits
  const vectorParam = { name: 'content', vector };
  const res = await fetch(`${QDRANT}/collections/${collection}/points/search`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ vector: vectorParam, limit, with_payload: true }),
    signal:  AbortSignal.timeout(8_000),
  });
  if (!res.ok) return [];
  const { result } = await res.json();
  return result ?? [];
}

// ── 4D manifold Euclidean search (tensor_analysis_cache) ─────────────────────

async function searchManifold4({ center, radius = 0.25, limit = 20, somCluster, tags = [] }) {
  const [x, y, z, w] = center;
  const r2 = radius * radius;

  const where = [
    `manifold4_x IS NOT NULL`,
    `(power(manifold4_x - $1, 2) + power(manifold4_y - $2, 2) +
      power(manifold4_z - $3, 2) + power(manifold4_w - $4, 2)) <= $5`,
  ];
  const params = [x, y, z, w, r2];

  if (somCluster != null) {
    params.push(somCluster);
    where.push(`som_cluster = $${params.length}`);
  }

  for (const tag of tags) {
    params.push(tag);
    where.push(`$${params.length} = ANY(
      SELECT unnest(COALESCE((qdrant_payload->>'tags')::text[], '{}'::text[]))
    )`);
  }

  const { rows } = await pool.query(
    `SELECT
       stable_key,
       topo_byte,
       topo_class,
       topo_hex,
       manifold4_x AS x,
       manifold4_y AS y,
       manifold4_z AS z,
       manifold4_w AS w,
       centroid_key,
       som_cluster,
       graph_authority_score,
       tensor_affinity_score,
       (qdrant_payload->>'path')    AS path,
       (qdrant_payload->>'content') AS content_preview,
       sqrt(
         power(manifold4_x - $1, 2) +
         power(manifold4_y - $2, 2) +
         power(manifold4_z - $3, 2) +
         power(manifold4_w - $4, 2)
       ) AS manifold_distance
     FROM tensor_analysis_cache
     WHERE ${where.join(' AND ')}
     ORDER BY manifold_distance ASC
     LIMIT $${params.length + 1}`,
    [...params, limit],
  );

  return rows.map((r) => ({
    stableKey:          r.stable_key,
    path:               r.path ?? null,
    contentPreview:     (r.content_preview ?? '').slice(0, 200),
    topoByte:           Number(r.topo_byte ?? 0),
    topoClass:          Number(r.topo_class ?? 0),
    topoHex:            r.topo_hex ?? '0x00',
    somCluster:         r.som_cluster != null ? Number(r.som_cluster) : null,
    graphAuthorityScore: r.graph_authority_score != null ? Number(r.graph_authority_score) : null,
    tensorAffinityScore: r.tensor_affinity_score != null ? Number(r.tensor_affinity_score) : null,
    manifoldDistance:   Number(r.manifold_distance ?? 0),
    manifoldScore:      1 / (1 + Number(r.manifold_distance ?? 0)),
    coords:             [Number(r.x), Number(r.y), Number(r.z), Number(r.w)],
  }));
}

// ── Centroid from Qdrant hits ─────────────────────────────────────────────────

async function manifold4FromQdrantHits(hits) {
  if (!hits.length) return null;

  // Pull manifold4 coords from tensor_analysis_cache for the top stableKeys
  const stableKeys = hits
    .map((h) => h.payload?.stable_key ?? h.payload?.path ?? '')
    .filter(Boolean)
    .slice(0, 8);

  if (!stableKeys.length) return null;

  const placeholders = stableKeys.map((_, i) => `$${i + 1}`).join(',');
  let rows = [];
  try {
    const result = await pool.query(
      `SELECT manifold4_x AS x, manifold4_y AS y, manifold4_z AS z, manifold4_w AS w
         FROM tensor_analysis_cache
        WHERE stable_key IN (${placeholders})
          AND manifold4_x IS NOT NULL
        LIMIT 8`,
      stableKeys,
    );
    rows = result.rows;
  } catch { return null; /* table may not exist yet */ }

  if (!rows.length) return null;

  const sum = rows.reduce((a, r) => [a[0] + Number(r.x), a[1] + Number(r.y), a[2] + Number(r.z), a[3] + Number(r.w)], [0, 0, 0, 0]);
  const n = rows.length;
  return [sum[0] / n, sum[1] / n, sum[2] / n, sum[3] / n];
}

// ── Route handlers ────────────────────────────────────────────────────────────

async function handleHealth(_req, res) {
  send(res, 200, {
    ok: true,
    version: VERSION,
    port: PORT,
    uptimeMs: Date.now() - START_AT,
    endpoints: ['/health', '/search', '/search/cosine', '/search/hybrid'],
  });
}

async function handleSearch(body, res) {
  const t0 = Date.now();
  const { query, center, radius = 0.25, limit = 20, somCluster, tags } = body;

  // Resolve center: explicit coords > derive from query via embedding → Qdrant → tensor_analysis_cache
  let c = center;
  if (!c && query) {
    try {
      const emb = await embed(query);
      const qdrantHits = await qdrantSearch('codebase_chunks_768', emb, 5);
      c = await manifold4FromQdrantHits(qdrantHits).catch(() => null);
    } catch { /* no center available */ }
  }

  if (!c || c.length !== 4) {
    send(res, 400, { error: 'Provide center:[x,y,z,w] or a query string to derive it. (tensor_analysis_cache may not be populated yet)' });
    return;
  }

  const hits = await searchManifold4({ center: c, radius, limit, somCluster, tags }).catch(() => []);
  send(res, 200, { ok: true, center: c, radius, totalFound: hits.length, durationMs: Date.now() - t0, hits });
}

async function handleCosine(body, res) {
  const t0 = Date.now();
  const { query, limit = 20, collection = 'codebase_chunks_768' } = body;
  if (!query) { send(res, 400, { error: 'query required' }); return; }

  const VALID = ['codebase_chunks_768', 'research_summaries', 'legal_documents', 'evidence_items'];
  const col = VALID.includes(collection) ? collection : 'codebase_chunks_768';

  const emb = await embed(query);
  const hits = await qdrantSearch(col, emb, limit);

  send(res, 200, {
    ok: true,
    collection: col,
    totalFound: hits.length,
    durationMs: Date.now() - t0,
    hits: hits.map((h) => ({
      id:      h.id,
      score:   h.score,
      path:    h.payload?.path ?? h.payload?.relative_path ?? null,
      summary: (h.payload?.summary ?? h.payload?.content ?? '').slice(0, 200),
      tags:    h.payload?.tags ?? [],
      topoClass: h.payload?.topo_class ?? null,
    })),
  });
}

async function handleHybrid(body, res) {
  const t0 = Date.now();
  const { query, radius = 0.25, limit = 20, somCluster } = body;
  if (!query) { send(res, 400, { error: 'query required' }); return; }

  // Stage 1: Qdrant cosine prefilter (768-dim)
  let qdrantHits = [];
  let center = null;
  try {
    const emb = await embed(query);
    qdrantHits = await qdrantSearch('codebase_chunks_768', emb, Math.min(limit * 2, 40));
    center = await manifold4FromQdrantHits(qdrantHits);
  } catch (e) {
    send(res, 500, { error: `Embedding/Qdrant failed: ${e.message}` });
    return;
  }

  // Stage 2: manifold4 neighborhood expansion around centroid (non-fatal)
  let manifoldHits = [];
  if (center) {
    try {
      manifoldHits = await searchManifold4({ center, radius, limit, somCluster });
    } catch { /* tensor_analysis_cache missing or empty — cosine-only result is still valid */ }
  }

  // Merge: score = 0.60 × cosineScore + 0.40 × manifoldScore, dedup by stableKey
  const cosineMap = new Map(qdrantHits.map((h) => [
    h.payload?.path ?? String(h.id),
    { cosineScore: h.score, path: h.payload?.path, summary: (h.payload?.summary ?? h.payload?.content ?? '').slice(0, 200) },
  ]));

  const merged = manifoldHits.map((m) => {
    const cosine = cosineMap.get(m.path ?? '') ?? { cosineScore: 0 };
    return {
      ...m,
      cosineScore:  cosine.cosineScore,
      hybridScore:  cosine.cosineScore * 0.60 + m.manifoldScore * 0.40,
      summary:      cosine.summary ?? m.contentPreview,
    };
  });

  // Add cosine-only hits not found in manifold neighborhood
  for (const [path, c] of cosineMap) {
    if (!merged.some((m) => m.path === path)) {
      merged.push({ stableKey: null, path, cosineScore: c.cosineScore, manifoldScore: 0, hybridScore: c.cosineScore * 0.60, summary: c.summary });
    }
  }

  merged.sort((a, b) => b.hybridScore - a.hybridScore);

  send(res, 200, {
    ok: true,
    query,
    center,
    radius,
    totalFound: merged.length,
    durationMs: Date.now() - t0,
    hits: merged.slice(0, limit),
  });
}

// ── HTTP plumbing ─────────────────────────────────────────────────────────────

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type':  'application/json',
    'Content-Length': Buffer.byteLength(json),
    'Access-Control-Allow-Origin': process.env.PUBLIC_APP_URL ?? 'http://localhost:5173',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(json);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { send(res, 204, {}); return; }

  try {
    const url = req.url?.split('?')[0] ?? '/';

    if (url === '/health' && req.method === 'GET') {
      await handleHealth(req, res);
      return;
    }

    if (req.method !== 'POST') { send(res, 405, { error: 'Method not allowed' }); return; }

    const body = await readBody(req);

    if (url === '/search')         { await handleSearch(body, res); return; }
    if (url === '/search/cosine')  { await handleCosine(body, res); return; }
    if (url === '/search/hybrid')  { await handleHybrid(body, res); return; }

    send(res, 404, { error: 'Not found', endpoints: ['/health', '/search', '/search/cosine', '/search/hybrid'] });
  } catch (err) {
    send(res, 500, { error: err.message ?? 'Internal error' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[topology-search] Listening on http://${HOST}:${PORT}`);
});

process.on('SIGTERM', async () => {
  server.close();
  await pool.end();
  process.exit(0);
});
