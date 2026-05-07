#!/usr/bin/env node
/**
 * embeddinggemma-smoke.mjs
 *
 * Verifies the EmbeddingGemma embedding lane:
 *
 *   EmbeddingGemma (Ollama :11434, 768-dim)
 *     → embed a query chunk
 *     → embed a document chunk
 *     → verify dimension = 768
 *     → upsert test point into Qdrant codebase_chunks_768
 *     → nearest-neighbor search returns the upserted point
 *     → cleanup (delete test point)
 *
 * Tests:
 *   E1. Ollama reachable, embeddinggemma:latest available
 *   E2. Query embedding (task: search result | query: ...) → 768-dim
 *   E3. Document embedding (title: ... | text: ...) → 768-dim
 *   E4. Cosine similarity query↔document > 0.3 (same topic)
 *   E5. Qdrant upsert test point
 *   E6. Qdrant nearest-neighbor returns test point
 *   E7. Cleanup test point
 *
 * Usage:
 *   node scripts/smoke/embeddinggemma-smoke.mjs
 *   node scripts/smoke/embeddinggemma-smoke.mjs --strict
 *   node scripts/smoke/embeddinggemma-smoke.mjs --model nomic-embed-text   # fallback
 */

import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';

const { values: flags } = parseArgs({
  options: {
    model:  { type: 'string',  default: process.env.EMBEDDING_MODEL ?? 'embeddinggemma:latest' },
    strict: { type: 'boolean', default: false },
    dim:    { type: 'string',  default: process.env.EMBEDDING_DIM ?? '768' },
  },
  strict: false,
});

const MODEL      = flags.model;
const STRICT     = flags.strict;
const EXPECT_DIM = parseInt(flags.dim) || 768;
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const QDRANT_URL = process.env.QDRANT_URL ?? 'http://localhost:6333';
const COLLECTION = 'codebase_chunks_768';
const TEST_ID    = randomUUID();
const TIMEOUT    = 30_000;

const QUERY_PREFIX    = 'task: search result | query: ';
const DOC_PREFIX_FN   = (title) => `title: ${title} | text: `;

const c = {
  green:  s => `\x1b[32m${s}\x1b[0m`,
  red:    s => `\x1b[31m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  dim:    s => `\x1b[2m${s}\x1b[0m`,
  bold:   s => `\x1b[1m${s}\x1b[0m`,
};

const results = [];

async function gate(id, label, fn) {
  const t0 = Date.now();
  try {
    const detail = await fn();
    const ms = Date.now() - t0;
    results.push({ id, label, status: 'PASS', detail: detail ?? '', ms });
    console.log(`  ${c.green('✓')} ${label}  ${c.dim(ms + 'ms')}${detail ? c.dim(' — ' + detail) : ''}`);
    return { ok: true };
  } catch (err) {
    const ms = Date.now() - t0;
    const warn = err.message?.startsWith('WARN:');
    const status = warn ? 'WARN' : 'FAIL';
    const msg = warn ? err.message.slice(5).trim() : err.message;
    results.push({ id, label, status, detail: msg, ms });
    const icon = warn ? c.yellow('○') : c.red('✗');
    console.log(`  ${icon} ${label} ${c.dim('— ' + msg)}`);
    return { ok: false, msg };
  }
}

async function embed(text) {
  const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, prompt: text }),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const data = await res.json();
  const vec = data?.embedding;
  if (!Array.isArray(vec) || !vec.length) throw new Error('no embedding in response');
  return vec;
}

function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

console.log(`\n${c.bold(c.dim('smoke: EmbeddingGemma'))}`);
console.log(c.dim(`  model: ${MODEL}  expected_dim: ${EXPECT_DIM}\n`));

// E1. Ollama reachable + model available
await gate('E1', `Ollama: ${MODEL} available`, async () => {
  const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(5_000) });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const data = await res.json();
  const models = (data?.models ?? []).map(m => m.name);
  const found = models.some(m => m === MODEL || m.startsWith(MODEL.split(':')[0]));
  if (!found) throw new Error(`WARN: ${MODEL} not in Ollama — run: ollama pull ${MODEL}`);
  return `${models.length} models, ${MODEL} found`;
});

// E2. Query embedding
let queryVec = null;
const e2 = await gate('E2', 'query embedding → correct dimension', async () => {
  const text = QUERY_PREFIX + 'codebase retrieval pipeline authentication middleware';
  queryVec = await embed(text);
  if (queryVec.length !== EXPECT_DIM) {
    throw new Error(`WARN: got dim=${queryVec.length}, expected ${EXPECT_DIM} — check EMBEDDING_DIM env`);
  }
  return `dim=${queryVec.length}`;
});

// E3. Document embedding
let docVec = null;
const e3 = await gate('E3', 'document embedding → correct dimension', async () => {
  const title = 'src/lib/server/middleware/auth.ts';
  const text = DOC_PREFIX_FN(title) + 'Authentication middleware validates session tokens and user roles';
  docVec = await embed(text);
  if (docVec.length !== EXPECT_DIM) {
    throw new Error(`WARN: got dim=${docVec.length}, expected ${EXPECT_DIM}`);
  }
  return `dim=${docVec.length}`;
});

// E4. Cosine similarity
if (queryVec && docVec) {
  await gate('E4', 'query↔document cosine similarity > 0.3 (same topic)', async () => {
    const sim = cosineSim(queryVec, docVec);
    if (sim < 0.3) throw new Error(`WARN: sim=${sim.toFixed(4)} — embeddings may be poorly aligned`);
    return `sim=${sim.toFixed(4)}`;
  });
}

// E5. Qdrant upsert
if (e2.ok && queryVec) {
  await gate('E5', `Qdrant upsert test point into ${COLLECTION}`, async () => {
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        points: [{
          id: TEST_ID,
          vector: { content: queryVec },
          payload: {
            filePath: '__smoke_test__',
            stableKey: 'embeddinggemma-smoke',
            chunkText: 'embedding smoke test point',
            _smokeTest: true,
          },
        }],
      }),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok) throw new Error(`Qdrant HTTP ${res.status}`);
    const data = await res.json();
    if (data?.status !== 'ok') throw new Error(`Qdrant status: ${JSON.stringify(data?.status)}`);
    return `point ${TEST_ID.slice(0, 8)}… upserted`;
  });

  // E6. Nearest-neighbor search
  await gate('E6', 'Qdrant nearest-neighbor returns test point', async () => {
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vector: { name: 'content', vector: queryVec },
        limit: 10,
        with_payload: ['filePath'],
        filter: { must: [{ key: 'filePath', match: { value: '__smoke_test__' } }] },
      }),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok) throw new Error(`Qdrant HTTP ${res.status}`);
    const data = await res.json();
    const pts = data?.result ?? [];
    const found = pts.some(p => p.id === TEST_ID);
    if (!found) throw new Error('test point not found in search results');
    return `found at score=${pts[0]?.score?.toFixed(4)}`;
  });

  // E7. Cleanup
  await gate('E7', 'Qdrant delete test point (cleanup)', async () => {
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points: [TEST_ID] }),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok) throw new Error(`Qdrant HTTP ${res.status}`);
    return 'deleted';
  });
}

// ── Summary ──────────────────────────────────────────────────────────────────

const pass = results.filter(r => r.status === 'PASS').length;
const warn = results.filter(r => r.status === 'WARN').length;
const fail = results.filter(r => r.status === 'FAIL').length;

console.log('');
const parts = [c.green(pass + ' PASS'), warn ? c.yellow(warn + ' WARN') : '', fail ? c.red(fail + ' FAIL') : ''];
console.log(parts.filter(Boolean).join('  '));
console.log('');

if (STRICT && fail > 0) process.exit(1);
