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
 *   GET  /health           → process liveness (dependencies not checked)
 *   GET  /ready            → bounded, read-only dependency/data readiness
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

import { Pool }                      from 'pg';
import process                       from 'node:process';
import { resolve }                   from 'node:path';
import { pathToFileURL }             from 'node:url';
import { buildHybridResult, topologyIdentityKey, validateSearchRequest } from './topology-search-contract.mjs';
import { createTopologySearchHttpServer } from './topology-search-http.mjs';

// ── Config ────────────────────────────────────────────────────────────────────

const PORT     = Number(process.env.TOPOLOGY_SEARCH_PORT ?? 8101);
const HOST     = process.env.TOPOLOGY_SEARCH_HOST ?? '127.0.0.1';
const PG_URL   = process.env.DATABASE_URL;
const QDRANT   = process.env.QDRANT_URL ?? 'http://localhost:6333';
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const EMBED_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const EMBED_MODEL = process.env.EMBEDDING_MODEL ?? 'embeddinggemma:latest';
const VERSION  = '1.0.0';

const START_AT = Date.now();

// ── Postgres pool ─────────────────────────────────────────────────────────────

const pool = PG_URL ? new Pool({
  connectionString: PG_URL,
  max: 4,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 2_000,
  statement_timeout: 2_000,
}) : null;

pool?.on('error', () => { /* absorb pool errors — non-fatal */ });

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
  if (!Array.isArray(embedding) || embedding.length !== 768 || !embedding.every(Number.isFinite)) {
    throw new Error('Embedding response must contain 768 finite values');
  }
  return embedding;
}

// ── Qdrant cosine helper ──────────────────────────────────────────────────────

async function qdrantSearch(collection, vector, limit = 20) {
  // codebase_chunks_768 uses named vectors — bare array returns 0 hits
  const vectorParam = { name: 'content', vector };
  const res = await fetch(`${QDRANT}/collections/${collection}/points/search`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(QDRANT_API_KEY ? { 'api-key': QDRANT_API_KEY } : {}),
    },
    body:    JSON.stringify({ vector: vectorParam, limit, with_payload: true }),
    signal:  AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`Qdrant search failed with HTTP ${res.status}`);
  const { result } = await res.json();
  if (!Array.isArray(result)) throw new Error('Qdrant search returned an invalid result');
  return result;
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
       content_hash,
       qdrant_payload,
       output_meta,
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
    sourceRef:          r.qdrant_payload?.source_ref ?? r.output_meta?.source_ref ?? null,
    sourceRevision:     r.qdrant_payload?.source_revision ?? r.output_meta?.source_revision ?? null,
    contentHash:        r.content_hash,
    representationRevision: r.qdrant_payload?.representation_revision ?? r.output_meta?.representation_revision ?? null,
    topologySnapshotRevision: r.qdrant_payload?.topology_snapshot_revision ?? r.output_meta?.topology_snapshot_revision ?? null,
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

  // Only stable keys with full source/revision identity may cross the projection join.
  const qualifiedHits = hits
    .filter((hit) => topologyIdentityKey(hit))
    .slice(0, 8);
  const stableKeys = qualifiedHits.map((hit) => hit.payload?.stable_key ?? hit.payload?.stableKey);

  if (!stableKeys.length || stableKeys.some((key) => typeof key !== 'string' || !key.trim())) return null;

  const placeholders = stableKeys.map((_, i) => `$${i + 1}`).join(',');
  const { rows } = await pool.query(
    `SELECT stable_key, content_hash, qdrant_payload, output_meta,
            manifold4_x AS x, manifold4_y AS y, manifold4_z AS z, manifold4_w AS w
       FROM tensor_analysis_cache
      WHERE stable_key IN (${placeholders})
        AND manifold4_x IS NOT NULL
      LIMIT 8`,
    stableKeys,
  );

  if (!rows.length) return null;

  const qdrantByIdentity = new Map();
  for (const hit of qualifiedHits) {
    const key = topologyIdentityKey(hit);
    const matches = qdrantByIdentity.get(key) ?? [];
    matches.push(hit);
    qdrantByIdentity.set(key, matches);
  }
  const rowsByIdentity = new Map();
  for (const row of rows) {
    const key = topologyIdentityKey({
      stableKey: row.stable_key,
      contentHash: row.content_hash,
      qdrantPayload: row.qdrant_payload,
      outputMeta: row.output_meta,
    });
    const matches = rowsByIdentity.get(key) ?? [];
    matches.push(row);
    rowsByIdentity.set(key, matches);
  }
  const qualifiedRows = [];
  for (const [key, qdrantMatches] of qdrantByIdentity) {
    const topologyMatches = rowsByIdentity.get(key) ?? [];
    if (qdrantMatches.length === 1 && topologyMatches.length === 1) qualifiedRows.push(topologyMatches[0]);
  }
  if (!qualifiedRows.length) return null;

  const sum = qualifiedRows.reduce((a, r) => [a[0] + Number(r.x), a[1] + Number(r.y), a[2] + Number(r.z), a[3] + Number(r.w)], [0, 0, 0, 0]);
  const n = qualifiedRows.length;
  return [sum[0] / n, sum[1] / n, sum[2] / n, sum[3] / n];
}

// ── Route handlers ────────────────────────────────────────────────────────────

async function handleHealth() {
  return { status: 200, body: {
    ok: true,
    status: 'live',
    readiness: 'not_checked',
    version: VERSION,
    port: PORT,
    uptimeMs: Date.now() - START_AT,
    endpoints: ['/health', '/ready', '/search', '/search/cosine', '/search/hybrid'],
  } };
}

async function handleReady() {
  const checks = {
    postgres: 'unavailable',
    topologySchema: 'unavailable',
    topologyData: 'unavailable',
    identityJoin: 'unavailable',
    qdrant: 'unavailable',
    embedding: 'unavailable',
    embeddingDimension: 'unavailable',
  };

  try {
    if (!pool) throw new Error('database is not configured');
    await pool.query('SELECT 1');
    checks.postgres = 'ready';
    const requiredColumns = ['stable_key', 'content_hash', 'manifold4_x', 'manifold4_y', 'manifold4_z', 'manifold4_w', 'qdrant_payload', 'output_meta'];
    const { rows: schemaRows } = await pool.query(
      `SELECT COUNT(DISTINCT column_name)::int AS column_count
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'tensor_analysis_cache'
          AND column_name = ANY($1::text[])`,
      [requiredColumns],
    );
    const schemaReady = Number(schemaRows[0]?.column_count ?? 0) === requiredColumns.length;
    checks.topologySchema = schemaReady ? 'ready' : 'missing';
    if (schemaReady) {
      const { rows: dataRows } = await pool.query(
        `SELECT EXISTS (
           SELECT 1 FROM public.tensor_analysis_cache
           WHERE manifold4_x IS NOT NULL AND manifold4_y IS NOT NULL
             AND manifold4_z IS NOT NULL AND manifold4_w IS NOT NULL
         ) AS has_coordinates`,
      );
      checks.topologyData = dataRows[0]?.has_coordinates ? 'ready' : 'empty';

      const { rows: identityRows } = await pool.query(
        `SELECT EXISTS (
           SELECT 1 FROM public.tensor_analysis_cache
           WHERE NULLIF(qdrant_payload->>'source_ref', '') IS NOT NULL
             AND NULLIF(qdrant_payload->>'source_revision', '') IS NOT NULL
             AND NULLIF(content_hash, '') IS NOT NULL
             AND (
               NULLIF(qdrant_payload->>'representation_revision', '') IS NOT NULL
               OR NULLIF(output_meta->>'representation_revision', '') IS NOT NULL
               OR NULLIF(qdrant_payload->>'topology_snapshot_revision', '') IS NOT NULL
               OR NULLIF(output_meta->>'topology_snapshot_revision', '') IS NOT NULL
             )
         ) AS has_qualified_identity`,
      );
      checks.identityJoin = identityRows[0]?.has_qualified_identity ? 'ready' : 'unqualified';
    }
  } catch { /* report dependency state without returning driver details */ }

  try {
    const response = await fetch(`${QDRANT}/collections/codebase_chunks_768`, {
      headers: QDRANT_API_KEY ? { 'api-key': QDRANT_API_KEY } : {},
      signal: AbortSignal.timeout(2_000),
    });
    if (response.ok) {
      const body = await response.json();
      const vectorConfig = body.result?.config?.params?.vectors;
      const contentVector = vectorConfig?.content;
      checks.qdrant = !body.result?.config ? 'invalid_response' : 'ready';
      checks.embeddingDimension = contentVector?.size === 768 ? 'ready' : 'dimension_mismatch';
    }
  } catch { /* dependency remains unavailable */ }

  try {
    const response = await fetch(`${EMBED_URL}/api/tags`, { signal: AbortSignal.timeout(2_000) });
    if (response.ok) {
      const body = await response.json();
      checks.embedding = body.models?.some((model) => model.name === EMBED_MODEL) ? 'ready' : 'model_missing';
    }
  } catch { /* dependency remains unavailable */ }

  const ready = Object.values(checks).every((state) => state === 'ready');
  return { status: ready ? 200 : 503, body: { ok: ready, status: ready ? 'ready' : 'not_ready', checks } };
}

async function handleSearch(body) {
  const t0 = Date.now();
  const validation = validateSearchRequest('/search', body);
  if (!validation.ok) return { status: 400, body: { ok: false, error: validation.error, code: 'INVALID_SEARCH_REQUEST' } };
  const { query, center, radius, limit, somCluster, tags } = validation.value;

  // Resolve center: explicit coords > derive from query via embedding → Qdrant → tensor_analysis_cache
  let c = center;
  if (!c && query) {
    try {
      const emb = await embed(query);
      const qdrantHits = await qdrantSearch('codebase_chunks_768', emb, 5);
      c = await manifold4FromQdrantHits(qdrantHits);
    } catch {
      return { status: 503, body: { ok: false, error: 'Cosine prefilter is unavailable', code: 'COSINE_RETRIEVAL_UNAVAILABLE' } };
    }
  }

  if (!c || c.length !== 4) {
    return { status: 503, body: { ok: false, error: 'Topology coordinates are unavailable', code: 'TOPOLOGY_CENTER_UNAVAILABLE' } };
  }

  let hits;
  try {
    hits = await searchManifold4({ center: c, radius, limit, somCluster, tags });
  } catch {
    return { status: 503, body: { ok: false, error: 'Topology query is unavailable', code: 'TOPOLOGY_QUERY_FAILED' } };
  }
  return { status: 200, body: { ok: true, rankingMode: 'topology_only', topologyStatus: 'used', center: c, radius, totalFound: hits.length, durationMs: Date.now() - t0, hits } };
}

async function handleCosine(body) {
  const t0 = Date.now();
  const validation = validateSearchRequest('/search/cosine', body);
  if (!validation.ok) return { status: 400, body: { ok: false, error: validation.error, code: 'INVALID_SEARCH_REQUEST' } };
  const { query, limit, collection: col } = validation.value;

  let hits;
  try {
    const emb = await embed(query);
    hits = await qdrantSearch(col, emb, limit);
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    return { status: timedOut ? 504 : 503, body: { ok: false, error: 'Cosine retrieval is unavailable', code: timedOut ? 'COSINE_RETRIEVAL_TIMEOUT' : 'COSINE_RETRIEVAL_UNAVAILABLE' } };
  }

  return { status: 200, body: {
    ok: true,
    rankingMode: 'cosine',
    topologyStatus: 'not_requested',
    collection: col,
    totalFound: hits.length,
    durationMs: Date.now() - t0,
    hits: hits.map((h) => ({
      id:      h.id,
      score:   h.score,
      stableKey: h.payload?.stable_key ?? h.payload?.stableKey ?? null,
      sourceRef: h.payload?.source_ref ?? h.payload?.sourceRef ?? null,
      sourceRevision: h.payload?.source_revision ?? h.payload?.sourceRevision ?? null,
      contentHash: h.payload?.content_hash ?? h.payload?.contentHash ?? null,
      representationRevision: h.payload?.representation_revision ?? h.payload?.representationRevision ?? null,
      topologySnapshotRevision: h.payload?.topology_snapshot_revision ?? h.payload?.topologySnapshotRevision ?? null,
      path:    h.payload?.path ?? h.payload?.relative_path ?? null,
      summary: typeof (h.payload?.summary ?? h.payload?.content) === 'string'
        ? (h.payload?.summary ?? h.payload?.content).slice(0, 200)
        : '',
      tags:    Array.isArray(h.payload?.tags) ? h.payload.tags.filter((tag) => typeof tag === 'string') : [],
      topoClass: h.payload?.topo_class ?? null,
    })),
  } };
}

async function handleHybrid(body) {
  const t0 = Date.now();
  const validation = validateSearchRequest('/search/hybrid', body);
  if (!validation.ok) return { status: 400, body: { ok: false, error: validation.error, code: 'INVALID_SEARCH_REQUEST' } };
  const { query, radius, limit, somCluster } = validation.value;

  // Stage 1: Qdrant cosine prefilter (768-dim)
  let qdrantHits = [];
  let center = null;
  try {
    const emb = await embed(query);
    qdrantHits = await qdrantSearch('codebase_chunks_768', emb, Math.min(limit * 2, 40));
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    return { status: timedOut ? 504 : 503, body: { ok: false, error: 'Cosine retrieval is unavailable', code: timedOut ? 'COSINE_RETRIEVAL_TIMEOUT' : 'COSINE_RETRIEVAL_UNAVAILABLE' } };
  }

  // Stage 2: topology enrichment is best-effort and explicitly marked on fallback.
  let manifoldHits = [];
  let fallbackReason = null;
  try {
    center = await manifold4FromQdrantHits(qdrantHits);
    if (center) {
      manifoldHits = await searchManifold4({ center, radius, limit, somCluster });
      if (!manifoldHits.length) fallbackReason = 'no_topology_matches';
    } else {
      fallbackReason = 'no_topology_coordinates';
    }
  } catch {
    fallbackReason = 'topology_query_failed';
  }

  return { status: 200, body: buildHybridResult({
    query, center, radius, limit, cosineHits: qdrantHits, manifoldHits, fallbackReason,
    durationMs: Date.now() - t0,
  }) };
}

export function createTopologySearchServer({ handlers = {}, allowedOrigin = process.env.PUBLIC_APP_URL ?? 'http://localhost:5173', maxBodyBytes = 64 * 1024 } = {}) {
  const routeHandlers = {
    health: () => handleHealth(),
    ready: () => handleReady(),
    search: ({ body }) => handleSearch(body),
    cosine: ({ body }) => handleCosine(body),
    hybrid: ({ body }) => handleHybrid(body),
    ...handlers,
  };
  return createTopologySearchHttpServer({ handlers: routeHandlers, allowedOrigin, maxBodyBytes });
}

const isMainModule = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMainModule && !process.env.NODE_TEST_CONTEXT) {
  if (!PG_URL) {
    console.error('[topology-search] DATABASE_URL must be configured');
    process.exitCode = 1;
  } else {
    const server = createTopologySearchServer();
    server.listen(PORT, HOST, () => console.log(`[topology-search] Listening on http://${HOST}:${PORT}`));
    process.on('SIGTERM', async () => {
      server.close();
      await pool?.end();
      process.exit(0);
    });
  }
}
