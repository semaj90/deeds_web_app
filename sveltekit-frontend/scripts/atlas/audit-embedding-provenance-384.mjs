#!/usr/bin/env node
/**
 * Embedding Provenance Audit — Gate 2.5
 *
 * Establishes the EmbeddingProvenance record for codebase_chunks_384_hybrid
 * by sampling 100 Qdrant points, recovering their source content from Postgres,
 * re-embedding via Ollama, and comparing cosine similarity.
 *
 * Outputs:
 *   - Per-point provenance records
 *   - Aggregate cosine similarity distribution
 *   - PASS/FAIL verdict for the embedding contract
 *
 * Usage:
 *   node scripts/atlas/audit-embedding-provenance-384.mjs [--sample 100] [--verbose]
 */

import pg from 'pg';
import crypto from 'crypto';

const QDRANT_URL   = process.env.QDRANT_URL  ?? 'http://localhost:6333';
const COLLECTION   = 'codebase_chunks_384_hybrid';
const OLLAMA_URL   = process.env.OLLAMA_URL  ?? 'http://127.0.0.1:11434';
const EMBED_MODEL  = 'embeddinggemma:latest';
const PG_HOST      = process.env.PG_HOST     ?? '127.0.0.1';
const PG_PORT      = parseInt(process.env.PG_PORT ?? '5434');
const PG_USER      = process.env.PG_USER     ?? 'legal_admin';
const PG_PASS      = process.env.PG_PASSWORD ?? '123456';
const PG_DB        = process.env.PG_DATABASE ?? 'legal_ai_db';

const SAMPLE_SIZE  = parseInt(process.argv.find(a => a.startsWith('--sample='))?.split('=')[1] ?? '100');
const VERBOSE      = process.argv.includes('--verbose');

const pool = new pg.Pool({ host: PG_HOST, port: PG_PORT, user: PG_USER, password: PG_PASS, database: PG_DB, max: 3 });

// ── Helpers ───────────────────────────────────────────────────────────────────

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function sha256Bytes(floatArray) {
  const buf = Buffer.alloc(floatArray.length * 4);
  for (let i = 0; i < floatArray.length; i++) buf.writeFloatLE(floatArray[i], i * 4);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function norm(v) {
  return Math.sqrt(v.reduce((s, x) => s + x * x, 0));
}

function l2normalize(v) {
  const n = norm(v);
  return n > 0 ? v.map(x => x / n) : v;
}

function truncate(v, dim) {
  return v.slice(0, dim);
}

// ── Embed via Ollama ──────────────────────────────────────────────────────────

async function embed(text) {
  const res = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, input: text }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Ollama embed failed: ${res.status}`);
  const data = await res.json();
  // /api/embed returns { embeddings: [[...]] }
  return data.embeddings?.[0] ?? data.embedding ?? null;
}

// ── Scroll random sample from Qdrant ─────────────────────────────────────────

async function sampleQdrantPoints(n) {
  // Use scroll with a random offset to get a distributed sample
  const points = [];
  let offset = null;
  const totalRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`);
  const totalData = await totalRes.json();
  const total = totalData.result?.points_count ?? 52380;

  // Skip ahead to get a sample spread across the collection
  const skipEvery = Math.floor(total / n);
  let fetched = 0;

  while (points.length < n) {
    const body = {
      limit: Math.min(250, (n - points.length) * skipEvery + 10),
      with_vector: ['content'],
      with_payload: false,
      ...(offset ? { offset } : {}),
    };

    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Qdrant scroll failed: ${res.status}`);
    const data = await res.json();
    const batch = data.result?.points ?? [];
    offset = data.result?.next_page_offset ?? null;

    // Pick every skipEvery-th point for distributed sampling
    for (const p of batch) {
      fetched++;
      if (fetched % skipEvery === 0 || points.length < n) {
        if (p.vector?.content?.length === 384) {
          points.push({ id: p.id, qdrantVec: p.vector.content });
          if (points.length >= n) break;
        }
      }
    }

    if (!offset) break;
  }

  return points.slice(0, n);
}

// ── Main audit ────────────────────────────────────────────────────────────────

const client = await pool.connect();
console.log(`=== Embedding Provenance Audit ===`);
console.log(`Collection   : ${COLLECTION}`);
console.log(`Sample size  : ${SAMPLE_SIZE}`);
console.log(`Embed model  : ${EMBED_MODEL} via ${OLLAMA_URL}`);
console.log('');

// 1. Sample Qdrant points
console.log(`Sampling ${SAMPLE_SIZE} points from Qdrant...`);
const sampled = await sampleQdrantPoints(SAMPLE_SIZE);
console.log(`Got ${sampled.length} points with content vectors`);

// 2. Fetch content from Postgres
const ids = sampled.map(p => p.id);
const pgRes = await client.query(`
  SELECT id::text, content, trim(content) AS content_trimmed,
         array_length(content_embedding::real[], 1) AS orig_dim
  FROM codebase_chunk_index
  WHERE id = ANY($1::uuid[])
    AND content IS NOT NULL
    AND length(trim(content)) > 0
`, [ids]);

const contentMap = new Map(pgRes.rows.map(r => [r.id, r]));
console.log(`Found Postgres content for ${contentMap.size}/${sampled.length} sampled IDs`);
console.log('');

// 3. Re-embed and compare
const results = [];
let ollamaErrors = 0;
let processed = 0;

for (const { id, qdrantVec } of sampled) {
  const pgRow = contentMap.get(id);
  if (!pgRow?.content_trimmed) continue;

  processed++;
  if (processed % 10 === 0) process.stdout.write(`\r  Progress: ${processed}/${sampled.length}...`);

  try {
    const content = pgRow.content_trimmed;
    const inputHash = sha256(content);

    // Re-embed
    const rawVec768 = await embed(content);
    if (!rawVec768 || rawVec768.length < 384) {
      ollamaErrors++;
      continue;
    }

    // What the backfill script would have done:
    // 1. truncate 768→384 (no normalization)
    const truncated384 = truncate(rawVec768, 384);
    // 2. Qdrant normalizes on Cosine ingestion
    const normalized384 = l2normalize(truncated384);

    // Hashes
    const qdrantVecF32 = new Float32Array(qdrantVec);
    const newVecF32    = new Float32Array(normalized384);
    const vectorHashStored = sha256Bytes(qdrantVecF32);
    const vectorHashNew    = sha256Bytes(newVecF32);

    const similarity = cosine(qdrantVec, normalized384);
    const qdrantNorm = norm(qdrantVec);
    const newNorm    = norm(rawVec768);
    const origDim    = pgRow.orig_dim;

    results.push({
      id,
      similarity,
      qdrantNorm,
      rawVec768Dim: rawVec768.length,
      inputHash,
      vectorHashMatch: vectorHashStored === vectorHashNew,
      origDim,
      provenance: {
        modelName: EMBED_MODEL,
        modelVersion: 'latest',
        modelFileHash: null,            // not recoverable without Ollama model inspect
        originalDimension: rawVec768.length,
        storedDimension: 384,
        reductionMethod: 'mrl-truncate',
        reductionNote: 'first 384 of 768 native dims, then L2-normalized by Qdrant Cosine ingest',
        normalized: true,
        inputHash,
        vectorHash: vectorHashStored,
        taskPrompt: null,
      },
    });

    if (VERBOSE) {
      console.log(`\n  ${id}  sim=${similarity.toFixed(4)}  origDim=${origDim}  match=${vectorHashStored === vectorHashNew}`);
    }
  } catch (err) {
    ollamaErrors++;
    if (VERBOSE) console.error(`\n  ${id}: ${err.message}`);
  }
}

console.log(`\n`);

// 4. Aggregate stats
const sims = results.map(r => r.similarity).sort((a, b) => a - b);
const mean = sims.reduce((s, v) => s + v, 0) / sims.length;
const min  = sims[0];
const p10  = sims[Math.floor(sims.length * 0.10)];
const p25  = sims[Math.floor(sims.length * 0.25)];
const p50  = sims[Math.floor(sims.length * 0.50)];
const p75  = sims[Math.floor(sims.length * 0.75)];
const p90  = sims[Math.floor(sims.length * 0.90)];
const max  = sims[sims.length - 1];

const highSim = sims.filter(s => s >= 0.99).length;
const lowSim  = sims.filter(s => s < 0.90).length;

console.log('─────────────────────────────────────────');
console.log('Cosine similarity: stored Qdrant vec vs re-embedded + truncated + normalized');
console.log(`  n            : ${results.length}`);
console.log(`  Ollama errors: ${ollamaErrors}`);
console.log(`  mean         : ${mean.toFixed(6)}`);
console.log(`  min          : ${min.toFixed(6)}`);
console.log(`  p10          : ${p10.toFixed(6)}`);
console.log(`  p25          : ${p25.toFixed(6)}`);
console.log(`  p50 (median) : ${p50.toFixed(6)}`);
console.log(`  p75          : ${p75.toFixed(6)}`);
console.log(`  p90          : ${p90.toFixed(6)}`);
console.log(`  max          : ${max.toFixed(6)}`);
console.log(`  sim >= 0.99  : ${highSim} (${((highSim/results.length)*100).toFixed(1)}%)`);
console.log(`  sim <  0.90  : ${lowSim}  (${((lowSim/results.length)*100).toFixed(1)}%)`);
console.log('');

// 5. Contract verdict
console.log('─────────────────────────────────────────');
console.log('EmbeddingProvenance contract (sample):');
if (results.length > 0) {
  const sample = results[0].provenance;
  console.log(JSON.stringify(sample, null, 2));
}
console.log('');

// Verdict thresholds
const CONTRACT_THRESHOLD = 0.98;  // p50 must be >= this to claim same-model
const verdict = p50 >= CONTRACT_THRESHOLD ? 'PASS' : 'INVESTIGATE';

console.log('─────────────────────────────────────────');
if (verdict === 'PASS') {
  console.log(`Gate 2.5: PASS — p50 cosine ${p50.toFixed(4)} >= ${CONTRACT_THRESHOLD}`);
  console.log('Conclusion: Qdrant vectors are canonical embeddinggemma:latest embeddings');
  console.log('  truncated 768→384 by prefix, L2-normalized by Qdrant on ingestion.');
  console.log('  reductionMethod = mrl-truncate (NOT a learned projection, NOT PCA).');
  console.log('  The truncation is deterministic and reproducible.');
} else {
  console.log(`Gate 2.5: INVESTIGATE — p50 cosine ${p50.toFixed(4)} < ${CONTRACT_THRESHOLD}`);
  console.log('Either the model changed, prompting changed, or vectors are from a different source.');
  console.log('Do NOT treat current Qdrant vectors as canonical until provenance is resolved.');
}
console.log('─────────────────────────────────────────');

client.release();
await pool.end();
