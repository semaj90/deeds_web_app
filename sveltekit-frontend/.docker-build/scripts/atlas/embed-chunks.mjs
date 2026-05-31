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
 *   QDRANT_URL    default http://localhost:6333
 *   OLLAMA_URL    default http://localhost:11434
 *   SVELTEKIT_URL default http://localhost:5173
 */

import fs        from 'node:fs';
import path      from 'node:path';
import { fileURLToPath } from 'node:url';
import { qdrantEnsureCollection, qdrantUpsertPoints, getQdrantUrl } from '../qdrant-client.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

// ── Args ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const inputI = argv.indexOf('--input');
const collI = argv.indexOf('--collection');
const batchI = argv.indexOf('--batch');
const DRY_RUN = argv.includes('--dry-run');
const VERBOSE = argv.includes('--verbose');

const INPUT_PATH = inputI >= 0 ? argv[inputI + 1] : null;
const COLLECTION = collI >= 0 ? argv[collI + 1] : 'docs_chunks';
const BATCH_SIZE = batchI >= 0 ? Number(argv[batchI + 1]) : 20;

const QDRANT_URL = getQdrantUrl();
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const SK_URL = process.env.SVELTEKIT_URL ?? 'http://localhost:5173';
const EMBED_MODEL = process.env.EMBED_MODEL ?? 'embeddinggemma:latest';

// ── Embedding ─────────────────────────────────────────────────────────────────
let skAvailable = false;

async function checkSvelteKit() {
  try {
    const r = await fetch(`${SK_URL}/api/health`, { signal: AbortSignal.timeout(2000) });
    skAvailable = r.ok;
  } catch {
    skAvailable = false;
  }
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
  return data.embedding ?? data.embeddings?.[0] ?? null;
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
  return data.embedding ?? null;
}

async function embed(text) {
  if (skAvailable) {
    try {
      return await embedViaSvelteKit(text);
    } catch {
      /* fall through */
    }
  }
  return embedViaOllama(text);
}

// ── Qdrant upsert ─────────────────────────────────────────────────────────────
async function ensureCollection(name, vectorSize) {
  const ok = await qdrantEnsureCollection(name, vectorSize);
  if (!ok) throw new Error(`Create collection ${name}: failed`);
  console.log(`[embed-chunks] Ensured Qdrant collection: ${name}`);
}

async function upsertPoints(collectionName, points) {
  const ok = await qdrantUpsertPoints(collectionName, points, true);
  if (!ok) {
    throw new Error('Qdrant upsert failed');
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
  console.log(`[embed-chunks] Embed route: ${skAvailable ? `SvelteKit ${SK_URL}/api/embed` : `Ollama ${OLLAMA_URL}`}`);

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
        points.push({
          id:      chunkIdToQdrantId(rec.chunk_id),
          vector,
          payload: {
            chunk_id:    rec.chunk_id,
            source_path: rec.source_path,
            source_type: rec.source_type,
            chunk_index: rec.chunk_index,
            text:        rec.text,
            tags:        rec.tags ?? [],
            file_refs:   rec.file_refs ?? [],
            rg_paths:    rec.rg_paths ?? [],
            rg_terms:    rec.rg_terms ?? [],
            word_count:  rec.word_count,
            indexed_at:  new Date().toISOString(),
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