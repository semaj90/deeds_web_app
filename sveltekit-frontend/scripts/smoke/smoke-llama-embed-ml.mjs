#!/usr/bin/env node
/**
 * smoke-llama-embed-ml.mjs
 *
 * ML correctness smoke test for the llama-server embedding tier on :8081.
 * Verifies /v1/embeddings returns structurally valid, semantically meaningful vectors.
 *
 * Tests:
 *   E1. /health — embed server up
 *   E2. POST /v1/embeddings — batch returns 3 items, correct dim
 *   E3. Vectors are finite (no NaN / Inf)
 *   E4. Semantic ordering: cosine(legal_A, legal_B) > cosine(legal_A, banana_unrelated)
 *   E5. L2 norm close to 1.0 (--embd-normalize 2 was applied)
 *
 * Usage:
 *   node scripts/smoke/smoke-llama-embed-ml.mjs
 *   OLLAMA_EMBED_BASE_URL=http://127.0.0.1:8081 EXPECTED_EMBED_DIM=768 node scripts/smoke/smoke-llama-embed-ml.mjs
 *   node scripts/smoke/smoke-llama-embed-ml.mjs --strict
 */

import { parseArgs } from 'node:util';

const { values: flags } = parseArgs({
  options: {
    port:   { type: 'string' },
    strict: { type: 'boolean', default: false },
  },
  strict: false,
});

const rawUrl = process.env.OLLAMA_EMBED_BASE_URL ?? '';
const PORT   = flags.port ?? (rawUrl.match(/:(\d+)$/)?.[1] ?? '8081');
const BASE   = rawUrl.startsWith('http') ? rawUrl.replace(/\/$/, '') : `http://127.0.0.1:${PORT}`;
const STRICT = flags.strict;
const EXPECTED_DIM = parseInt(process.env.EXPECTED_EMBED_DIM ?? '768', 10);
const TIMEOUT = 15_000;

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
    console.log(`  ${c.green('✓')} ${label}${detail ? c.dim(' — ' + detail) : ''}`);
  } catch (err) {
    const ms = Date.now() - t0;
    const warn = err.message?.startsWith('WARN:');
    const status = warn ? 'WARN' : 'FAIL';
    const msg = warn ? err.message.slice(5).trim() : err.message;
    results.push({ id, label, status, detail: msg, ms });
    const icon = warn ? c.yellow('○') : c.red('✗');
    console.log(`  ${icon} ${label} ${c.dim('— ' + msg)}`);
  }
}

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function norm(a) {
  return Math.sqrt(dot(a, a));
}

function cosine(a, b) {
  const na = norm(a), nb = norm(b);
  if (na === 0 || nb === 0) return 0;
  return dot(a, b) / (na * nb);
}

// Three probe texts: two legal (semantically related), one unrelated
const TEXTS = [
  'The defendant asserts the evidence was obtained in violation of the Fourth Amendment.',
  'Search and seizure without a warrant constitutes an unlawful breach of constitutional rights.',
  'Banana bread requires ripe bananas, flour, sugar, butter, and eggs.',
];

let embeddings = null;

console.log(`\n${c.bold(c.dim(`smoke: llama-server embeddings (${BASE})`))}\n`);
console.log(c.dim(`  expected dim: ${EXPECTED_DIM}  |  texts: ${TEXTS.length}\n`));

// E1. Health
await gate('E1', `embed server ${BASE}/health`, async () => {
  const res = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(5_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json().catch(() => ({}));
  return body.status ?? 'ok';
});

// E2. Batch shape
await gate('E2', `/v1/embeddings returns ${TEXTS.length} items at dim ${EXPECTED_DIM}`, async () => {
  const res = await fetch(`${BASE}/v1/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: TEXTS, model: 'embeddinggemma' }),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} — ${body.slice(0, 120)}`);
  }
  const data = await res.json();
  const items = data?.data;
  if (!Array.isArray(items)) throw new Error(`response.data is not array — keys: ${Object.keys(data ?? {}).join(',')}`);
  if (items.length !== TEXTS.length) throw new Error(`got ${items.length} items, expected ${TEXTS.length}`);
  embeddings = items.map(d => d.embedding);
  if (!Array.isArray(embeddings[0])) throw new Error(`embedding[0] is not array`);
  const dim = embeddings[0].length;
  if (dim !== EXPECTED_DIM) throw new Error(`dim=${dim}, expected ${EXPECTED_DIM}`);
  return `${items.length} items × dim ${dim}`;
});

// E3. Finite values
await gate('E3', 'all embedding values are finite (no NaN / Inf)', () => {
  if (!embeddings) throw new Error('no embeddings — E2 must pass first');
  let total = 0, bad = 0;
  for (const vec of embeddings) {
    for (const v of vec) {
      total++;
      if (!isFinite(v)) bad++;
    }
  }
  if (bad > 0) throw new Error(`${bad}/${total} values are non-finite`);
  return `${total} values checked`;
});

// E4. Semantic ordering: legal A closer to legal B than to banana
await gate('E4', 'cosine(legal_A, legal_B) > cosine(legal_A, banana)', () => {
  if (!embeddings) throw new Error('no embeddings — E2 must pass first');
  const [legalA, legalB, banana] = embeddings;
  const simLegal  = cosine(legalA, legalB);
  const simBanana = cosine(legalA, banana);
  if (simLegal <= simBanana) {
    throw new Error(
      `semantic ordering violated: sim(legal_A,legal_B)=${simLegal.toFixed(4)} ≤ sim(legal_A,banana)=${simBanana.toFixed(4)}`
    );
  }
  return `sim(legal,legal)=${simLegal.toFixed(4)}  sim(legal,banana)=${simBanana.toFixed(4)}`;
});

// E5. L2 norm ≈ 1.0 (--embd-normalize 2)
await gate('E5', 'L2 norm of each vector ≈ 1.0 (--embd-normalize 2)', () => {
  if (!embeddings) throw new Error('no embeddings — E2 must pass first');
  const norms = embeddings.map(v => norm(v));
  const worst = norms.reduce((a, b) => Math.abs(1 - a) > Math.abs(1 - b) ? a : b);
  const tol = 0.01;
  if (Math.abs(1 - worst) > tol) {
    throw new Error(`WARN: worst L2 norm=${worst.toFixed(6)}, expected 1.0 ± ${tol} — server may not have --embd-normalize 2`);
  }
  return `norms: ${norms.map(n => n.toFixed(6)).join(', ')}`;
});

// E6. Stability — repeated call, same input, cosine drift < 0.001
await gate('E6', 'repeated call produces stable vectors (cosine drift < 0.001)', async () => {
  const res = await fetch(`${BASE}/v1/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: [TEXTS[0]], model: 'embeddinggemma' }),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const vec2 = data?.data?.[0]?.embedding;
  if (!Array.isArray(vec2)) throw new Error('no embedding in second call');
  if (!embeddings) return 'second call succeeded (no baseline to compare)';
  const sim = cosine(embeddings[0], vec2);
  if (sim < 0.999) {
    throw new Error(`WARN: cosine stability=${sim.toFixed(6)}, expected ≥0.999 (deterministic model)`);
  }
  return `cosine stability=${sim.toFixed(6)}`;
});

// E7. Route guard — /api/embed must NOT be accepted (Ollama vs llama-server confusion)
await gate('E7', '/api/embed returns non-200 (not an Ollama server, no route confusion)', async () => {
  try {
    const bad = await fetch(`${BASE}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'embeddinggemma', input: 'hello' }),
      signal: AbortSignal.timeout(5_000),
    });
    if (bad.ok) {
      throw new Error('WARN: /api/embed returned 200 — check for Ollama/llama-server route confusion');
    }
    return `/api/embed → ${bad.status} (correct)`;
  } catch (err) {
    if (err.message?.startsWith('WARN:')) throw err;
    // Connection refused = route not served = correct
    return `/api/embed → connection error (correct — route not served)`;
  }
});

// ── Summary ──────────────────────────────────────────────────────────────────
const pass = results.filter(r => r.status === 'PASS').length;
const warn = results.filter(r => r.status === 'WARN').length;
const fail = results.filter(r => r.status === 'FAIL').length;

console.log('');
if (fail === 0 && warn === 0) {
  console.log(c.green(`${pass}/${results.length} gates passed — embed server ML-correct ✓`));
} else {
  const parts = [c.green(pass + ' PASS'), warn ? c.yellow(warn + ' WARN') : '', fail ? c.red(fail + ' FAIL') : ''];
  console.log(parts.filter(Boolean).join('  '));
}
console.log('');

if (STRICT && fail > 0) process.exit(1);