#!/usr/bin/env node
/**
 * index-summaries-qdrant.mjs
 *
 * Indexes atlas_summary_layers into the `atlas_summaries_768` Qdrant collection
 * for hybrid semantic search using title_id + tree_node_id.
 *
 * Control plane: TypeScript/Node.js (this script)
 * Graph enrichment: Neo4j GDS (run graphify:gds first)
 * GPU PageRank fallback: WSL2 Python cuGraph (run atlas:cugraph:pagerank)
 * Serving index: Qdrant (atlas_summaries_768 collection)
 * Truth: Postgres atlas_packets + atlas_summary_layers
 *
 * Pipeline:
 *   1. Create/verify `atlas_summaries_768` Qdrant collection (768-dim, HNSW)
 *   2. Fetch summaries joined to atlas_packets (gets title_id, tree_node_id,
 *      packet_key, source_ref, page_rank_score, community_id)
 *   3. Embed each summary via Ollama embeddinggemma:latest (768-dim)
 *   4. Upsert point: vector + payload { title_id, tree_node_id, packet_key,
 *      source_ref, page_rank_score, community_id, summary_type, layer_type }
 *   5. Print fill-rate report + fallback recommendations
 *
 * Hybrid search (after indexing):
 *   - Dense: cosine over 768-dim summary embedding
 *   - Filter by title_id prefix, community_id, or tree_node_id prefix
 *   - Rank boost: page_rank_score in payload (apply in RRF blend)
 *
 * Fallback recommendations printed when enrichment columns are missing:
 *   - page_rank_score < 50%  → run: npm run graphify:gds
 *   - community_id < 50%     → run: npm run atlas:louvain:apply
 *   - tree_node_id missing   → run: npm run atlas:backfill:ast (P2A)
 *   - title_id missing       → run: npm run atlas:title-identity:backfill:apply
 *
 * Usage:
 *   node scripts/atlas/index-summaries-qdrant.mjs --dry-run
 *   node scripts/atlas/index-summaries-qdrant.mjs --apply
 *   node scripts/atlas/index-summaries-qdrant.mjs --apply --limit=500
 *   node scripts/atlas/index-summaries-qdrant.mjs --apply --batch=50 --verbose
 *
 * npm scripts (add to sveltekit-frontend/package.json):
 *   atlas:summaries:qdrant:dry    → node ../scripts/atlas/index-summaries-qdrant.mjs --dry-run
 *   atlas:summaries:qdrant:apply  → node ../scripts/atlas/index-summaries-qdrant.mjs --apply
 */

import pg from 'pg';
import { createHash } from 'node:crypto';
import { loadEnvFiles, REPO_ROOT, FRONTEND_ROOT } from './connection-config.mjs';
import path from 'node:path';

const ENV = loadEnvFiles([
  path.join(REPO_ROOT, '.env'),
  path.join(FRONTEND_ROOT, '.env'),
  path.join(FRONTEND_ROOT, '.env.local'),
]);
Object.assign(process.env, ENV);

// ── CLI flags ─────────────────────────────────────────────────────────────────

const APPLY   = process.argv.includes('--apply');
const DRY_RUN = !APPLY;
const VERBOSE = process.argv.includes('--verbose');
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1]) : 0; // 0 = all
const BATCH_ARG = process.argv.find(a => a.startsWith('--batch='));
const BATCH = BATCH_ARG ? parseInt(BATCH_ARG.split('=')[1]) : 50;
// --concurrency=N: parallel embed+upsert workers (default 4 with ONNX, 1 with Ollama)
const CONCURRENCY_ARG = process.argv.find(a => a.startsWith('--concurrency='));
const CONCURRENCY_OVERRIDE = CONCURRENCY_ARG ? parseInt(CONCURRENCY_ARG.split('=')[1]) : 0;

// ── Config ────────────────────────────────────────────────────────────────────

const DB_URL    = process.env.DATABASE_URL     || `postgresql://${process.env.DB_USER||'legal_admin'}:${process.env.DB_PASSWORD||'123456'}@${process.env.DB_HOST||'127.0.0.1'}:${process.env.DB_PORT||'5434'}/${process.env.DB_NAME||'legal_ai_db'}`;
const QDRANT    = process.env.QDRANT_URL       || 'http://127.0.0.1:6333';
const OLLAMA    = (process.env.OLLAMA_HOST || 'http://127.0.0.1:11434').replace(/^0\.0\.0\.0/, '127.0.0.1');
const OLLAMA_URL = OLLAMA.startsWith('http') ? OLLAMA : `http://${OLLAMA}`;
// Prefer OLLAMA_EMBED_MODEL (canonical 768-dim) over EMBED_MODEL (may be set to nomic-embed-text)
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || process.env.EMBED_MODEL || 'embeddinggemma:latest';
const COLLECTION  = 'atlas_summaries_768';
const VECTOR_DIM  = 768;

// ONNX GPU embed server (launched by npm run dev:gpu or embed:onnx:start:detached)
// Exposes OpenAI-compatible POST /v1/embeddings with true GPU batching at batch_size=512
// Only use EMBED_SERVER_URL if it points to a non-Ollama port (not 11434)
function resolveOnnxUrl() {
  const candidates = [process.env.EMBED_SERVER_URL, process.env.OLLAMA_EMBED_BASE_URL];
  for (const url of candidates) {
    if (!url) continue;
    // Skip if it's pointing at Ollama port (11434) — that's not an ONNX server
    if (url.includes(':11434')) continue;
    return url;
  }
  return null;
}
const ONNX_EMBED_URL = resolveOnnxUrl();

const pool = new pg.Pool({ connectionString: DB_URL, max: 4 });

// ── Qdrant helpers ────────────────────────────────────────────────────────────

async function qdrantReq(method, path, body) {
  const res = await fetch(`${QDRANT}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body != null ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Qdrant ${method} ${path} → HTTP ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

async function ensureCollection() {
  // Check if collection exists
  const list = await qdrantReq('GET', '/collections').catch(() => ({ result: { collections: [] } }));
  const exists = (list.result?.collections ?? []).some(c => c.name === COLLECTION);

  if (exists) {
    const info = await qdrantReq('GET', `/collections/${COLLECTION}`);
    const count = info.result?.points_count ?? 0;
    console.log(`   ✓ Collection '${COLLECTION}' exists (${count} points)`);
    return;
  }

  if (DRY_RUN) {
    console.log(`   DRY-RUN: would create collection '${COLLECTION}' (${VECTOR_DIM}-dim, cosine, HNSW m=16)`);
    return;
  }

  await qdrantReq('PUT', `/collections/${COLLECTION}`, {
    vectors: {
      size: VECTOR_DIM,
      distance: 'Cosine',
      hnsw_config: { m: 16, ef_construct: 200 },
    },
    optimizers_config: { memmap_threshold: 20_000 },
    // Enable payload indexing for hybrid filter search
    on_disk_payload: false,
  });

  // Create payload indexes for filterable fields
  await qdrantReq('PUT', `/collections/${COLLECTION}/index`, {
    field_name: 'title_id',
    field_schema: 'keyword',
  }).catch(() => {});
  await qdrantReq('PUT', `/collections/${COLLECTION}/index`, {
    field_name: 'community_id',
    field_schema: 'integer',
  }).catch(() => {});
  await qdrantReq('PUT', `/collections/${COLLECTION}/index`, {
    field_name: 'source_ref',
    field_schema: 'keyword',
  }).catch(() => {});
  await qdrantReq('PUT', `/collections/${COLLECTION}/index`, {
    field_name: 'layer_type',
    field_schema: 'keyword',
  }).catch(() => {});

  console.log(`   ✅ Created collection '${COLLECTION}' with payload indexes`);
}

// ── Embedding — ONNX GPU server (:8081) with Ollama fallback ─────────────────
// ONNX server: OpenAI-compatible POST /v1/embeddings, true GPU batching, ~3min for 7640 rows
// Ollama:      POST /api/embeddings, serial (one call per text), ~30min for 7640 rows

let _onnxAvailable = null; // null=unchecked, true/false after first probe

async function probeOnnxServer() {
  if (_onnxAvailable !== null) return _onnxAvailable;
  if (!ONNX_EMBED_URL) { _onnxAvailable = false; return false; }
  try {
    const base = ONNX_EMBED_URL.replace(/\/+$/, '');
    const r = await fetch(`${base}/health`, { signal: AbortSignal.timeout(3000) });
    _onnxAvailable = r.ok;
  } catch {
    _onnxAvailable = false;
  }
  return _onnxAvailable;
}

// Embed a batch of texts at once (ONNX: true batch; Ollama: serial fallback)
async function embedBatch(texts) {
  const useOnnx = await probeOnnxServer();

  if (useOnnx) {
    const base = ONNX_EMBED_URL.replace(/\/+$/, '');
    const res = await fetch(`${base}/v1/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`ONNX embed HTTP ${res.status}`);
    const data = await res.json();
    const vecs = (data.data ?? []).map(d => d.embedding);
    if (vecs.length !== texts.length) throw new Error(`ONNX returned ${vecs.length} embeddings for ${texts.length} inputs`);
    if (vecs[0]?.length !== VECTOR_DIM) throw new Error(`ONNX dim mismatch: got ${vecs[0]?.length}, expected ${VECTOR_DIM}`);
    return vecs;
  }

  // Ollama fallback: serial (no batch API)
  const results = [];
  for (const text of texts) {
    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`Ollama embed HTTP ${res.status}`);
    const data = await res.json();
    const vec = data.embedding;
    if (!Array.isArray(vec) || vec.length !== VECTOR_DIM) {
      throw new Error(`Expected ${VECTOR_DIM}-dim embedding, got ${vec?.length}`);
    }
    results.push(vec);
  }
  return results;
}

// ── Deterministic Qdrant point ID from packet_key + layer_type ───────────────

function makePointId(packetKey, layerType) {
  // UUID v4 format derived from sha256 so the ID is stable across re-runs
  const hash = createHash('sha256').update(`${packetKey}\0${layerType}`).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    '4' + hash.slice(13, 16),       // version 4
    ((parseInt(hash[16], 16) & 3) | 8).toString(16) + hash.slice(17, 20), // variant
    hash.slice(20, 32),
  ].join('-');
}

// ── Upsert batch to Qdrant ────────────────────────────────────────────────────

async function upsertBatch(points) {
  if (!points.length) return;
  await qdrantReq('PUT', `/collections/${COLLECTION}/points`, {
    points,
    wait: true,
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  Atlas Summary → Qdrant Indexer                                  ║');
  console.log(`║  Collection: ${COLLECTION.padEnd(51)}║`);
  console.log(`║  Mode: ${(DRY_RUN ? 'DRY-RUN' : 'APPLY').padEnd(59)}║`);
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');
  console.log(`   Postgres: ${DB_URL.replace(/:([^:@]+)@/, ':***@')}`);
  console.log(`   Qdrant:   ${QDRANT}/${COLLECTION}`);
  console.log(`   Ollama:   ${OLLAMA_URL} model=${EMBED_MODEL}`);
  console.log(`   Batch:    ${BATCH}  ${LIMIT ? `Limit: ${LIMIT}` : 'No limit (all rows)'}\n`);

  // ── Step 1: Verify Qdrant reachable ──────────────────────────────────────
  try {
    await qdrantReq('GET', '/');
    console.log('   ✓ Qdrant reachable');
  } catch (e) {
    console.error(`   ✗ Qdrant unreachable: ${e.message}`);
    process.exit(1);
  }

  // ── Step 2: Probe embed backends ─────────────────────────────────────────
  const onnxUp = await probeOnnxServer();
  if (onnxUp) {
    console.log(`   ✓ ONNX GPU embed server reachable at ${ONNX_EMBED_URL} (GPU batch mode)`);
  } else {
    if (ONNX_EMBED_URL) {
      console.log(`   ⚠ ONNX embed server not available (${ONNX_EMBED_URL}) — falling back to Ollama`);
      console.log('     Start it with: npm run embed:onnx:start:detached');
    }
    try {
      const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      console.log(`   ✓ Ollama reachable at ${OLLAMA_URL} (serial mode, ~30min for 7640 rows)`);
      console.log('     Tip: run npm run dev:gpu to start ONNX server for ~3min GPU indexing');
    } catch (e) {
      console.warn(`   ✗ Both ONNX and Ollama unreachable — embedding will fail`);
      if (!DRY_RUN) process.exit(1);
    }
  }

  // ── Step 3: Ensure collection ─────────────────────────────────────────────
  console.log('\n── Step 1: Qdrant collection setup ──────────────────────────────');
  await ensureCollection();

  // ── Step 4: Query summaries joined to atlas_packets ──────────────────────
  console.log('\n── Step 2: Query summaries from Postgres ────────────────────────');

  const limitClause = LIMIT > 0 ? `LIMIT ${LIMIT}` : '';
  const { rows } = await pool.query(`
    SELECT
      sl.packet_key,
      sl.layer_type,
      coalesce(nullif(btrim(sl.summary_text), ''), nullif(btrim(sl.summary), '')) AS summary_text,
      ap.source_ref,
      ap.title_id,
      ap.page_rank_score,
      ap.community_id,
      -- tree_node_ids is JSONB array; take first element as the canonical tree_node_id
      CASE
        WHEN ap.tree_node_ids IS NOT NULL AND jsonb_array_length(ap.tree_node_ids) > 0
        THEN ap.tree_node_ids->0->>0
        ELSE NULL
      END AS tree_node_id,
      ap.feature_id,
      ap.directory_path
    FROM atlas_summary_layers sl
    JOIN atlas_packets ap ON ap.packet_key = sl.packet_key
    WHERE coalesce(nullif(btrim(sl.summary_text), ''), nullif(btrim(sl.summary), '')) IS NOT NULL
      AND length(coalesce(nullif(btrim(sl.summary_text), ''), nullif(btrim(sl.summary), ''))) >= 30
    ORDER BY ap.page_rank_score DESC NULLS LAST, sl.packet_key
    ${limitClause}
  `).catch(async (e) => {
    // tree_node_ids column may not exist yet if P2A hasn't run
    if (e.message.includes('tree_node_ids')) {
      console.warn('   ⚠ tree_node_ids column not found — running without AST identity (run P2A backfill)');
      return pool.query(`
        SELECT
          sl.packet_key,
          sl.layer_type,
          coalesce(nullif(btrim(sl.summary_text), ''), nullif(btrim(sl.summary), '')) AS summary_text,
          ap.source_ref,
          ap.title_id,
          ap.page_rank_score,
          ap.community_id,
          NULL AS tree_node_id,
          ap.feature_id,
          ap.directory_path
        FROM atlas_summary_layers sl
        JOIN atlas_packets ap ON ap.packet_key = sl.packet_key
        WHERE coalesce(nullif(btrim(sl.summary_text), ''), nullif(btrim(sl.summary), '')) IS NOT NULL
          AND length(coalesce(nullif(btrim(sl.summary_text), ''), nullif(btrim(sl.summary), ''))) >= 30
        ORDER BY ap.page_rank_score DESC NULLS LAST, sl.packet_key
        ${limitClause}
      `);
    }
    throw e;
  });

  const total = rows.length;
  console.log(`   Found ${total} summaries to index`);

  if (total === 0) {
    console.log('\n   ⚠ No summaries found. Ensure:');
    console.log('     1. Phase 7 workers have run (summaries in codebase_chunk_index)');
    console.log('     2. npm run atlas:summaries:backfill promoted them to atlas_summary_layers');
    console.log('     3. atlas_packets rows exist with matching packet_key');
    await pool.end();
    return;
  }

  // Fill-rate audit before indexing
  const withTitle    = rows.filter(r => r.title_id).length;
  const withTree     = rows.filter(r => r.tree_node_id).length;
  const withPageRank = rows.filter(r => r.page_rank_score != null).length;
  const withCommunity = rows.filter(r => r.community_id != null).length;
  console.log(`\n   Enrichment fill rates (of ${total} rows):`);
  console.log(`     title_id:       ${withTitle}/${total} (${pct(withTitle, total)})`);
  console.log(`     tree_node_id:   ${withTree}/${total} (${pct(withTree, total)})`);
  console.log(`     page_rank_score:${withPageRank}/${total} (${pct(withPageRank, total)})`);
  console.log(`     community_id:   ${withCommunity}/${total} (${pct(withCommunity, total)})`);

  if (DRY_RUN) {
    console.log('\n   DRY-RUN: would embed and upsert above rows');
    console.log('   Re-run with --apply to index');
    printRecommendations(rows, total);
    await pool.end();
    return;
  }

  // ── Step 5: Embed and upsert ─────────────────────────────────────────────
  console.log('\n── Step 3: Embed and upsert to Qdrant ───────────────────────────');

  // Determine backend and concurrency
  const useOnnx = await probeOnnxServer();
  const backend = useOnnx ? `ONNX GPU :8081 (batch mode)` : `Ollama :11434 (serial)`;
  // ONNX: 4 concurrent workers (each sends a batch of BATCH texts → GPU parallelism)
  // Ollama: 1 worker (serial, no batch API; concurrency just increases queue depth not throughput)
  const CONCURRENCY = CONCURRENCY_OVERRIDE || (useOnnx ? 4 : 1);
  const etaRows = total;
  const etaMs = useOnnx
    ? Math.round(etaRows / 512 * 800)   // ~800ms per 512-row ONNX batch
    : Math.round(etaRows * 200);        // ~200ms per Ollama call
  const etaMin = (etaMs / 60000).toFixed(1);
  console.log(`   Backend:     ${backend}`);
  console.log(`   Concurrency: ${CONCURRENCY} workers × batch=${BATCH}`);
  console.log(`   ETA:         ~${etaMin} min (${etaRows} rows)\n`);

  let indexed = 0;
  let embedErrors = 0;
  const startMs = Date.now();

  // Build list of batch slices
  const batches = [];
  for (let i = 0; i < rows.length; i += BATCH) {
    batches.push(rows.slice(i, i + BATCH));
  }

  // Process batches with bounded concurrency
  let batchIdx = 0;
  async function worker() {
    while (batchIdx < batches.length) {
      const myIdx = batchIdx++;
      const chunk = batches[myIdx];
      const texts = chunk.map(buildEmbedText);
      let vectors;
      try {
        vectors = await embedBatch(texts);
      } catch (e) {
        embedErrors += chunk.length;
        if (VERBOSE) console.warn(`\n   ⚠ Batch embed failed (batch ${myIdx}): ${e.message}`);
        continue;
      }
      const points = chunk.map((row, j) => ({
        id: makePointId(row.packet_key, row.layer_type ?? 'default'),
        vector: vectors[j],
        payload: {
          packet_key:      row.packet_key,
          source_ref:      row.source_ref,
          title_id:        row.title_id ?? null,
          tree_node_id:    row.tree_node_id ?? null,
          feature_id:      row.feature_id ?? null,
          directory_path:  row.directory_path ?? null,
          community_id:    row.community_id != null ? Number(row.community_id) : null,
          page_rank_score: row.page_rank_score != null ? parseFloat(row.page_rank_score) : null,
          layer_type:      row.layer_type ?? 'summary',
          summary_text:    row.summary_text.slice(0, 512),
        },
      }));
      try {
        await upsertBatch(points);
        indexed += points.length;
      } catch (e) {
        embedErrors += points.length;
        if (VERBOSE) console.warn(`\n   ⚠ Qdrant upsert failed (batch ${myIdx}): ${e.message}`);
      }
      const done = Math.min((myIdx + 1) * BATCH, rows.length);
      const elapsed = (Date.now() - startMs) / 1000;
      const rate = indexed / elapsed;
      process.stdout.write(`\r   Progress: ${done}/${rows.length} | indexed=${indexed} errors=${embedErrors} | ${rate.toFixed(0)} rows/s`);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
  console.log(`\n\n   ✅ Indexed ${indexed}/${total} summaries in ${elapsed}s (${embedErrors} embed errors)`);

  // ── Step 6: Verify ───────────────────────────────────────────────────────
  console.log('\n── Step 4: Verification ─────────────────────────────────────────');
  const info = await qdrantReq('GET', `/collections/${COLLECTION}`);
  const pointCount = info.result?.points_count ?? 0;
  console.log(`   Collection '${COLLECTION}': ${pointCount} total points`);
  if (pointCount >= indexed * 0.95) {
    console.log(`   ✅ Gate PASS: ${pointCount} >= ${Math.floor(indexed * 0.95)} (95% of ${indexed})`);
  } else {
    console.log(`   ⚠ Gate WARN: ${pointCount} < ${Math.floor(indexed * 0.95)} expected`);
  }

  printRecommendations(rows, total);

  await pool.end();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(n, total) {
  return total > 0 ? `${Math.round(n / total * 100)}%` : '0%';
}

/** Build the embedding input text — summary + source context for richer vectors */
function buildEmbedText(row) {
  const parts = [];
  if (row.source_ref) parts.push(row.source_ref);
  if (row.feature_id) parts.push(row.feature_id);
  parts.push(row.summary_text);
  return parts.join('\n');
}

function printRecommendations(rows, total) {
  const withTitle     = rows.filter(r => r.title_id).length;
  const withTree      = rows.filter(r => r.tree_node_id).length;
  const withPageRank  = rows.filter(r => r.page_rank_score != null).length;
  const withCommunity = rows.filter(r => r.community_id != null).length;

  const recs = [];
  if (withPageRank < total * 0.5)
    recs.push('page_rank_score <50%  → run: npm run graphify:gds  (or atlas:cugraph:pagerank for GPU)');
  if (withCommunity < total * 0.5)
    recs.push('community_id <50%    → run: npm run atlas:louvain:apply  (Louvain community detection)');
  if (withTree < total * 0.5)
    recs.push('tree_node_id <50%    → run: npm run atlas:backfill:ast  (P2A AST symbol extraction)');
  if (withTitle < total * 0.5)
    recs.push('title_id <50%        → run: npm run atlas:title-identity:backfill:apply');

  if (recs.length) {
    console.log('\n── Enrichment recommendations ───────────────────────────────────');
    for (const r of recs) console.log(`   ⚠  ${r}`);
    console.log('\n   Recommended pipeline order:');
    console.log('     1. graphify:daily          (codebase graph → Neo4j)');
    console.log('     2. graphify:gds             (Neo4j GDS PageRank + Louvain → Postgres)');
    console.log('     3. atlas:louvain:apply      (community_id backfill)');
    console.log('     4. atlas:title-identity:backfill:apply  (title_id generation)');
    console.log('     5. atlas:summaries:qdrant:apply  (this script — index summaries)');
    console.log('     6. [optional] atlas:cugraph:pagerank  (GPU PageRank via WSL2 cuGraph)');
  } else {
    console.log('\n   ✅ All enrichment columns adequately populated.');
  }
}

main().catch(e => { console.error('\n❌ Fatal:', e.message); process.exit(1); });
