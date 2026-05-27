#!/usr/bin/env node
/**
 * hyperrag-cuda-stream.mjs
 * Phase D: CUDA Graph Stream → Atlas-fed RotorQuant Decode Stream
 *
 * Reads Phase C enriched results, extracts chunk embeddings, runs
 * kmeansWithCentroids (CUDA) to produce cluster centroids, then streams
 * those centroids + compact Atlas chunks to the RotorQuant llama-server
 * (port 8090) for speculative decoding / final synthesis.
 *
 * CUDA fallback: if tensorrt_bridge.node is unavailable, cluster centroids
 * are computed via a pure-JS k-means (Forgy init, Lloyd's iteration).
 *
 * Usage:
 *   # Full pipeline from Phase C:
 *   node scripts/atlas/hyperrag-couchdb-enrich.mjs \
 *     | node scripts/atlas/hyperrag-cuda-stream.mjs --query "XState patterns"
 *
 *   # Or pass a Phase C result file:
 *   node scripts/atlas/hyperrag-cuda-stream.mjs \
 *     --input /tmp/phaseC.json --query "XState patterns"
 *
 *   # JSON output (for Phase E):
 *   node scripts/atlas/hyperrag-cuda-stream.mjs --input /tmp/phaseC.json --json
 *
 * Env:
 *   ROTORQUANT_URL   default http://127.0.0.1:8090  (llama-server)
 *   QDRANT_URL       default http://localhost:6333
 *   COLLECTION       default codebase_chunks_768
 *   MAX_K            default 8   (k-means cluster count for centroid stream)
 *   MAX_CONTEXT_CHARS default 6000  (character budget for synthesis prompt)
 */

import fs   from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));

// ── Config ─────────────────────────────────────────────────────────────────────
const argv   = process.argv.slice(2);
const argGet = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };

const INPUT_PATH   = argGet('--input');
const QUERY        = argGet('--query') ?? '';
const MAX_K        = Number(process.env.MAX_K             ?? 8);
const MAX_CTX      = Number(process.env.MAX_CONTEXT_CHARS ?? 6000);
const DRY_RUN      = argv.includes('--dry-run');
const JSON_OUT     = argv.includes('--json') || !process.stdout.isTTY;
const SKIP_INFER   = argv.includes('--no-inference');

const ROTORQUANT_URL = (process.env.ROTORQUANT_URL ?? 'http://127.0.0.1:8090').replace(/\/+$/, '');
const QDRANT_URL     = (process.env.QDRANT_URL     ?? 'http://localhost:6333').replace(/\/+$/, '');
const COLLECTION     = process.env.COLLECTION      ?? 'codebase_chunks_768';

// ── Load tensorrt_bridge (CUDA N-API) ─────────────────────────────────────────
const require = createRequire(import.meta.url);
let bridge = null;
const BRIDGE_PATHS = [
  path.resolve(__dir, '../../..', 'simd-bridge/cpp/build/Release/tensorrt_bridge.node'),
  path.resolve(__dir, '../../../..', 'simd-bridge/cpp/build/Release/tensorrt_bridge.node'),
];
for (const p of BRIDGE_PATHS) {
  try { bridge = require(p); break; } catch { /* try next */ }
}
const CUDA_AVAILABLE = Boolean(bridge?.kmeansWithCentroids);

// ── Pure-JS k-means fallback ───────────────────────────────────────────────────
function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
  return dot / (Math.sqrt(na * nb) + 1e-9);
}

function kmeansJS(vectors, k, maxIters = 20) {
  const n = vectors.length;
  const dim = vectors[0].length;
  if (n === 0 || k <= 0) return { centroids: [], assignments: [] };
  k = Math.min(k, n);

  // Forgy init
  const idxs = Array.from({ length: n }, (_, i) => i).sort(() => Math.random() - 0.5).slice(0, k);
  let centroids = idxs.map(i => [...vectors[i]]);

  let assignments = new Array(n).fill(0);
  for (let iter = 0; iter < maxIters; iter++) {
    let changed = false;
    // Assign
    for (let i = 0; i < n; i++) {
      let best = 0, bestSim = -Infinity;
      for (let j = 0; j < centroids.length; j++) {
        const s = cosineSim(vectors[i], centroids[j]);
        if (s > bestSim) { bestSim = s; best = j; }
      }
      if (assignments[i] !== best) { assignments[i] = best; changed = true; }
    }
    if (!changed) break;
    // Update centroids
    const sums = Array.from({ length: k }, () => new Array(dim).fill(0));
    const counts = new Array(k).fill(0);
    for (let i = 0; i < n; i++) {
      const c = assignments[i];
      for (let d = 0; d < dim; d++) sums[c][d] += vectors[i][d];
      counts[c]++;
    }
    centroids = sums.map((s, c) => counts[c] > 0 ? s.map(v => v / counts[c]) : centroids[c]);
  }

  return { centroids, assignments };
}

// ── Fetch vector for a Qdrant point ───────────────────────────────────────────
async function fetchVectors(pointIds) {
  if (!pointIds.length) return [];
  const r = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: pointIds, with_vectors: ['content'], with_payload: false }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) return [];
  const { result } = await r.json();
  return result ?? [];
}

// ── Build compact Atlas context string ────────────────────────────────────────
function buildContextString(hits, query) {
  let ctx = query ? `Query: ${query}\n\n` : '';
  for (const hit of hits) {
    const src = hit.source_ref ? `[${hit.source_ref}]` : '';
    const text = hit.text ?? '';
    const wikiRules = hit.wikiEnrichment?.flatMap(w => w.rules).slice(0, 2).join('; ') ?? '';
    const line = `${src} ${text}${wikiRules ? ` // ${wikiRules}` : ''}`.trim();
    if ((ctx + line).length > MAX_CTX) break;
    ctx += line + '\n';
  }
  return ctx.trim();
}

// ── RotorQuant inference ───────────────────────────────────────────────────────
async function rotorquantInfer(contextStr, query, centroidCount) {
  const systemPrompt = `You are a code intelligence assistant. Given the following codebase context and centroid clusters, answer the developer's question precisely and concisely. Focus on code patterns, file relationships, and implementation details.`;
  const userMsg = `Context (${centroidCount} semantic clusters):\n\n${contextStr}\n\nQuestion: ${query}`;

  const body = {
    model: 'gemma4-rotorquant:latest',  // resolved by llama-server to whatever is loaded
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMsg },
    ],
    max_tokens: 1024,
    temperature: 0.2,
    stream: false,
  };

  const r = await fetch(`${ROTORQUANT_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  if (!r.ok) throw new Error(`RotorQuant inference failed: ${r.status}`);
  const d = await r.json();
  return d.choices?.[0]?.message?.content ?? '';
}

// ── Main ──────────────────────────────────────────────────────────────────────
const t0 = Date.now();

if (!JSON_OUT) {
  console.log('\n[phase-d] CUDA Graph Stream → RotorQuant Decode Stream');
  console.log(`[phase-d] CUDA bridge: ${CUDA_AVAILABLE ? 'kmeansWithCentroids ONLINE' : 'JS fallback'}`);
  console.log(`[phase-d] RotorQuant: ${ROTORQUANT_URL}  k=${MAX_K}  maxCtx=${MAX_CTX}`);
}

// Read input
let phaseCResult;
try {
  if (INPUT_PATH) {
    phaseCResult = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));
  } else {
    const chunks = [];
    for await (const c of process.stdin) chunks.push(c);
    phaseCResult = JSON.parse(Buffer.concat(chunks.map(c => Buffer.from(c))).toString());
  }
} catch (e) {
  console.error(`[phase-d] Failed to read Phase C input: ${e.message}`);
  process.exit(1);
}

const hits      = phaseCResult.results ?? [];
const queryStr  = QUERY || phaseCResult.query || '';
if (!JSON_OUT) console.log(`[phase-d] Hits: ${hits.length}  Query: "${queryStr}"`);

if (DRY_RUN) {
  console.log('[phase-d] Dry run — skipping CUDA + inference');
  process.exit(0);
}

// Fetch vectors for top-N hits (CUDA path needs them)
let centroids = [];
let assignments = [];
let clusterLabels = [];
let backend = 'none';

const TOP_N_FOR_KMEANS = Math.min(hits.length, 50);
const topHits = hits.slice(0, TOP_N_FOR_KMEANS);
const pointIds = topHits.map(h => h.id).filter(Boolean);

if (pointIds.length >= MAX_K) {
  if (!JSON_OUT) process.stdout.write(`[phase-d] Fetching ${pointIds.length} vectors for k-means… `);
  const points = await fetchVectors(pointIds).catch(() => []);
  const vectors = points
    .map(p => p.vectors?.content ?? p.vector)
    .filter(v => Array.isArray(v) && v.length > 0);

  if (vectors.length >= MAX_K) {
    if (!JSON_OUT) console.log(`${vectors.length} vectors (${Date.now() - t0}ms)`);
    if (!JSON_OUT) process.stdout.write(`[phase-d] k-means k=${Math.min(MAX_K, vectors.length)} via ${CUDA_AVAILABLE ? 'CUDA' : 'JS'}… `);

    const k = Math.min(MAX_K, vectors.length);

    if (CUDA_AVAILABLE) {
      try {
        const flat = new Float32Array(vectors.flat());
        const dim = vectors[0].length;
        const res = bridge.kmeansWithCentroids(flat, vectors.length, dim, k, 30);
        centroids = Array.from({ length: k }, (_, ci) =>
          Array.from(res.centroids.slice(ci * dim, (ci + 1) * dim))
        );
        assignments = Array.from(res.assignments ?? []);
        backend = 'cuda';
      } catch (e) {
        console.warn(`\n[phase-d] CUDA k-means error: ${e.message} — JS fallback`);
        ({ centroids, assignments } = kmeansJS(vectors, k));
        backend = 'js-fallback';
      }
    } else {
      ({ centroids, assignments } = kmeansJS(vectors, k));
      backend = 'js-fallback';
    }

    // Label each cluster by its most prominent hit
    clusterLabels = centroids.map((_, ci) => {
      const memberIndices = assignments.map((a, i) => a === ci ? i : -1).filter(i => i >= 0);
      return memberIndices[0] !== undefined ? (topHits[memberIndices[0]]?.source_ref ?? `cluster-${ci}`) : `cluster-${ci}`;
    });

    if (!JSON_OUT) console.log(`done — ${centroids.length} centroids via ${backend} (${Date.now() - t0}ms)`);
  } else {
    if (!JSON_OUT) console.log(`too few vectors (${vectors.length}) — skipping k-means`);
  }
}

// Build compact context string
const contextStr = buildContextString(topHits, queryStr);

// Synthesise via RotorQuant
let synthesis = null;
let inferLatencyMs = 0;
let inferError = null;

if (SKIP_INFER) {
  if (!JSON_OUT) console.log('[phase-d] Inference skipped (--no-inference)');
} else {
  if (!JSON_OUT) process.stdout.write(`[phase-d] RotorQuant inference… `);
  const t1 = Date.now();
  try {
    synthesis = await rotorquantInfer(contextStr, queryStr, centroids.length);
    inferLatencyMs = Date.now() - t1;
    if (!JSON_OUT) console.log(`done (${inferLatencyMs}ms)`);
  } catch (e) {
    inferError = e.message;
    if (!JSON_OUT) console.warn(`\n[phase-d] Inference error: ${e.message}`);
  }
}

const output = {
  ...phaseCResult,
  phaseD: {
    cudaBackend: backend,
    centroidCount: centroids.length,
    centroidsK: MAX_K,
    clusterLabels,
    contextChars: contextStr.length,
    synthesis: synthesis ?? null,
    inferLatencyMs,
    inferError: inferError ?? null,
    totalLatencyMs: Date.now() - t0,
  },
};

if (JSON_OUT) {
  console.log(JSON.stringify(output, null, 2));
} else {
  console.log(`\n${'─'.repeat(72)}`);
  console.log(`  Centroids: ${centroids.length} (${backend})`);
  console.log(`  Context: ${contextStr.length} chars`);
  if (synthesis) {
    console.log(`\n  Synthesis (${inferLatencyMs}ms):\n`);
    console.log(synthesis.split('\n').map(l => `  ${l}`).join('\n'));
  }
  console.log(`\n  Phase D total: ${Date.now() - t0}ms`);
  console.log('─'.repeat(72));
}
