#!/usr/bin/env node
/**
 * embed-chunks.mjs
 *
 * Stage 3 of the ACE Feature Context Matrix pipeline.
 * Reads an NDJSON chunk file and embeds each record's text via:
 *   1. SvelteKit /api/embed (Redis L1 + Bifrost L2 cached, preferred)
 *   2. Direct Ollama /api/embeddings (fallback when dev server is down)
 *
 * Upserts each chunk into the specified Qdrant collection with:
 *   - vector: 768-dim embeddinggemma embedding
 *   - payload: all chunk metadata (tags, file_refs, rg_paths, source_type, etc.)
 *
 * Usage:
 *   node scripts/atlas/embed-chunks.mjs \
 *     --input tmp/chunks/error-context.ndjson \
 *     --collection error_notes
 *   node scripts/atlas/embed-chunks.mjs \
 *     --input tmp/chunks/notes.ndjson \
 *     --collection docs_chunks --dry-run
 *
 * Env:
 *   DATABASE_URL  (not used here — Qdrant only)
 *   QDRANT_URL    default http://127.0.0.1:6333
 *   OLLAMA_URL    default http://localhost:11434
 *   SVELTEKIT_URL default http://localhost:5173
 */

import fs        from 'node:fs';
import path      from 'node:path';
import crypto    from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.resolve(__dir, '../..');

// ── Args ─────────────────────────────────────────────────────────────────────
const argv         = process.argv.slice(2);
const inputI       = argv.indexOf('--input');
const collI        = argv.indexOf('--collection');
const batchI       = argv.indexOf('--batch');
const DRY_RUN      = argv.includes('--dry-run');
const VERBOSE      = argv.includes('--verbose');

const INPUT_PATH   = inputI >= 0 ? argv[inputI + 1] : null;
const COLLECTION   = collI  >= 0 ? argv[collI + 1]  : 'docs_chunks';
const BATCH_SIZE   = batchI >= 0 ? Number(argv[batchI + 1]) : 20;

const QDRANT_URL   = process.env.QDRANT_URL       ?? 'http://127.0.0.1:6333';
const OLLAMA_URL   = process.env.OLLAMA_URL       ?? 'http://localhost:11434';
const SK_URL       = process.env.SVELTEKIT_URL    ?? 'http://localhost:5173';
// EMBED-PROVIDER-CONVERGENCE-01: this default and the env var names below
// (EMBEDDING_BASE_URL / OLLAMA_EMBED_BASE_URL / EMBED_SERVER_URL) are
// compatibility inputs ONLY. The canonical resolution lives in
// sveltekit-frontend/src/lib/server/embedding/embedding-provider-v1.ts's
// resolveEmbeddingProviderV1() — this script asks the live SvelteKit server
// for that resolved value (checkEmbedServer, below) whenever it's reachable,
// and only falls back to mirroring the same precedence locally when it's
// not (a standalone script outside the SvelteKit module graph can't import
// that function directly).
let EMBED_SERVER_URL =
  process.env.EMBEDDING_BASE_URL ||
  process.env.OLLAMA_EMBED_BASE_URL ||
  process.env.EMBED_SERVER_URL ||
  'http://127.0.0.1:8081';
const EMBED_MODEL  = process.env.EMBED_MODEL      ?? 'embeddinggemma:latest';
if (!/^embeddinggemma(?::|$)/i.test(EMBED_MODEL)) throw new Error(`CANONICAL_EMBEDDING_MODEL_REQUIRED:received=${EMBED_MODEL}`);

// ── Embedding ─────────────────────────────────────────────────────────────────
let skAvailable = false;
let embedServerAvailable = false;

async function checkSvelteKit() {
  try {
    const r = await fetch(`${SK_URL}/api/health`, { signal: AbortSignal.timeout(2000) });
    skAvailable = r.ok;
    if (skAvailable) {
      // Prefer the live server's own resolved provider over this script's
      // local env-var mirror — this is the "ask the resolver" path.
      try {
        const info = await fetch(`${SK_URL}/api/embed`, { signal: AbortSignal.timeout(2000) }).then((r) => r.json());
        const resolvedBaseUrl = info?.data?.embeddingBackend?.baseUrl;
        if (resolvedBaseUrl) EMBED_SERVER_URL = resolvedBaseUrl;
      } catch { /* keep local mirror */ }
    }
  } catch {
    skAvailable = false;
  }
}

async function checkEmbedServer() {
  try {
    const r = await fetch(`${EMBED_SERVER_URL}/health`, { signal: AbortSignal.timeout(2000) });
    embedServerAvailable = r.ok;
  } catch {
    embedServerAvailable = false;
  }
}

/** Mirrors checkVectorShapeV1() in embedding-provider-v1.ts (fail-closed:
 * wrong dimension, non-finite values, or a zero/degenerate norm all
 * disqualify — not just a plain all-zeros check). SvelteKit's /api/embed
 * was observed returning HTTP 200 with an all-zero fallback vector when its
 * own upstream was unreachable (found live 2026-09-02, since fixed at the
 * route) — this guard stays regardless, since any embedding-producing
 * caller should fail closed independently of that route's own behavior. */
function isValidEmbeddingVector(vector, expectedDim = 768) {
  if (!Array.isArray(vector) || vector.length !== expectedDim) return false;
  if (!vector.every((v) => Number.isFinite(v))) return false;
  let sumSq = 0;
  for (const v of vector) sumSq += v * v;
  const norm = Math.sqrt(sumSq);
  return norm > 1e-6 && Number.isFinite(norm);
}

async function embedViaSvelteKit(text) {
  const r = await fetch(`${SK_URL}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model: EMBED_MODEL }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`SK embed ${r.status}`);
  const data = await r.json();
  const vector = data.embedding ?? data.embeddings?.[0] ?? null;
  if (!isValidEmbeddingVector(vector)) throw new Error('SK embed returned an invalid vector (degraded upstream)');
  return vector;
}

/** GGUF/CUDA embed server (scripts/startup/dev-gpu-runtime.mjs,
 * EMBEDDING_BACKEND=llama_cpp_gguf) — OpenAI-compatible /v1/embeddings. */
async function embedViaEmbedServer(text) {
  const r = await fetch(`${EMBED_SERVER_URL}/v1/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'embeddinggemma', input: text }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`Embed server ${r.status}`);
  const data = await r.json();
  const vector = data.data?.[0]?.embedding ?? null;
  if (!isValidEmbeddingVector(vector)) throw new Error('Embed server returned an invalid vector');
  return vector;
}

async function embedViaOllama(text) {
  const r = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`Ollama embed ${r.status}`);
  const data = await r.json();
  const vector = data.embedding ?? null;
  if (!isValidEmbeddingVector(vector)) throw new Error('Ollama embed returned an invalid vector');
  return vector;
}

async function embed(text) {
  if (skAvailable) {
    try { return await embedViaSvelteKit(text); } catch { /* fall through */ }
  }
  if (embedServerAvailable) {
    try { return await embedViaEmbedServer(text); } catch { /* fall through */ }
  }
  return embedViaOllama(text);
}

// ── Qdrant upsert ─────────────────────────────────────────────────────────────
async function ensureCollection(name, vectorSize) {
  // Check if exists
  const check = await fetch(`${QDRANT_URL}/collections/${name}`, { signal: AbortSignal.timeout(5000) });
  if (check.status === 200) return;

  // Create
  const r = await fetch(`${QDRANT_URL}/collections/${name}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vectors: { size: vectorSize, distance: 'Cosine' },
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`Create collection ${name}: ${r.status}`);
  console.log(`[embed-chunks] Created Qdrant collection: ${name}`);
}

async function upsertPoints(collectionName, points) {
  const r = await fetch(`${QDRANT_URL}/collections/${collectionName}/points?wait=true`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points }),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`Qdrant upsert ${r.status}: ${body.slice(0, 200)}`);
  }
}

// ── chunk_id → Qdrant numeric ID ──────────────────────────────────────────────
function chunkIdToQdrantId(chunkId) {
  // Qdrant accepts UUIDs or unsigned integers. We use the hex chunk_id directly
  // as a UUID-like string (16 hex chars padded to UUID format).
  const padded = chunkId.padEnd(32, '0');
  return `${padded.slice(0,8)}-${padded.slice(8,12)}-${padded.slice(12,16)}-${padded.slice(16,20)}-${padded.slice(20,32)}`;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (!INPUT_PATH) {
    console.error('[embed-chunks] --input required');
    process.exit(1);
  }

  const inputResolved = path.isAbsolute(INPUT_PATH) ? INPUT_PATH : path.join(ROOT, INPUT_PATH);
  const lines   = fs.readFileSync(inputResolved, 'utf8').trim().split('\n').filter(Boolean);
  const records = lines.map(l => JSON.parse(l));

  console.log(`[embed-chunks] Loaded ${records.length} chunks from ${INPUT_PATH}`);
  console.log(`[embed-chunks] Target collection: ${COLLECTION}`);
  console.log(`[embed-chunks] Batch size: ${BATCH_SIZE}`);

  if (DRY_RUN) {
    console.log('[embed-chunks] DRY RUN — would embed and upsert:');
    for (const r of records.slice(0, 3)) {
      console.log(`  ${r.chunk_id}  ${r.word_count} words  tags=${r.tags?.join(',')}`);
    }
    console.log(`[embed-chunks] DRY: ${records.length} records → ${COLLECTION}`);
    return;
  }

  await checkSvelteKit();
  await checkEmbedServer();
  const embedRoute = skAvailable
    ? `SvelteKit ${SK_URL}/api/embed`
    : embedServerAvailable
      ? `Embed server ${EMBED_SERVER_URL}/v1/embeddings`
      : `Ollama ${OLLAMA_URL}`;
  console.log(`[embed-chunks] Embed route: ${embedRoute} (falls through to the next available on error/zero-vector)`);

  let vectorSize = null;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const points = [];

    for (const rec of batch) {
      try {
        const vector = await embed(rec.text);
        if (!vector || !Array.isArray(vector)) {
          console.warn(`  [skip] ${rec.chunk_id} — null embedding`);
          errors++;
          continue;
        }
        if (!vectorSize) {
          vectorSize = vector.length;
          await ensureCollection(COLLECTION, vectorSize);
        }
        // Normalize source_ref: prefer explicit field, fall back to source_path
        const sourceRef = rec.source_ref
          ?? rec.source_path?.replace(/\\/g, '/').replace(/^sveltekit-frontend\//, '')
          ?? '';

        points.push({
          id:      chunkIdToQdrantId(rec.chunk_id),
          vector,
          payload: {
            // canonical identity fields (used by HyperRAG + atlas_feature_map)
            source_ref:   sourceRef,
            source_path:  sourceRef,   // mirror of source_ref for legacy consumers
            feature_id:   rec.feature_id   ?? null,
            file_kind:    rec.file_kind     ?? rec.source_type ?? null,
            route_id:     rec.route_id      ?? null,
            centroid_id:  rec.centroid_id   ?? null,
            packet_id:    rec.packet_id     ?? null,
            text_hash:    rec.text ? crypto.createHash('sha256').update(rec.text).digest('hex').slice(0, 16) : null,
            // legacy compat
            chunk_id:    rec.chunk_id,
            source_type: rec.source_type,
            chunk_index: rec.chunk_index,
            text:        rec.text,
            tags:        rec.tags ?? [],
            file_refs:   rec.file_refs ?? [],
            rg_paths:    rec.rg_paths ?? [],
            rg_terms:    rec.rg_terms ?? [],
            word_count:  rec.word_count,
            indexed_at:  new Date().toISOString(),
            embedding_model: EMBED_MODEL,
            embedding_dimension: vectorSize,
            // Optional passthrough for non-chunk record shapes (e.g. taxonomy_nodes
            // via export-taxonomy-nodes-ndjson-v1.mjs / taxonomy_nodes_768 contract).
            // Omitted (undefined) fields are dropped by JSON.stringify, so this is a
            // no-op for every existing NDJSON producer that doesn't set them.
            ...(rec.node_key !== undefined ? { node_key: rec.node_key } : {}),
            ...(rec.level !== undefined ? { level: rec.level } : {}),
            ...(rec.parent_key !== undefined ? { parent_key: rec.parent_key } : {}),
            ...(rec.display_name !== undefined ? { display_name: rec.display_name } : {}),
          },
        });
      } catch (err) {
        console.warn(`  [error] ${rec.chunk_id}: ${err.message}`);
        errors++;
      }
    }

    if (points.length > 0) {
      await upsertPoints(COLLECTION, points);
      inserted += points.length;
    }

    process.stdout.write(`\r[embed-chunks] ${Math.min(i + BATCH_SIZE, records.length)}/${records.length}  inserted=${inserted} errors=${errors}  `);
  }

  console.log(`\n[embed-chunks] ✅ Done — inserted=${inserted} errors=${errors} collection=${COLLECTION}`);
  if (errors > 0) {
    console.log(`[embed-chunks] Next: re-run with --verbose to see per-chunk errors`);
  }
}

main().catch(err => {
  console.error('[embed-chunks]', err.message);
  process.exit(1);
});
