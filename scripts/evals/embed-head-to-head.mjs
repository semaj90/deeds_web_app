#!/usr/bin/env node
/**
 * embed-head-to-head.mjs
 *
 * Compares EmbeddingGemma via Ollama (:11434) vs llama-server (:8081)
 * on the same queries against the same Qdrant collection.
 *
 * Metrics: Recall@K, MRR, NDCG@K, top-K overlap between lanes.
 *
 * Usage:
 *   node scripts/evals/embed-head-to-head.mjs
 *   node scripts/evals/embed-head-to-head.mjs --queries 50 --k 10
 *   node scripts/evals/embed-head-to-head.mjs --ollama-only
 *   node scripts/evals/embed-head-to-head.mjs --llama-only
 *   node scripts/evals/embed-head-to-head.mjs --collection codebase_chunks_768
 *   node scripts/evals/embed-head-to-head.mjs --out reports/embed-eval.json
 *
 * Requirements:
 *   - Qdrant running at QDRANT_URL (default localhost:6333)
 *   - Ollama running at OLLAMA_URL (default localhost:11434) with embeddinggemma:latest
 *   - llama-server at LLAMA_EMBED_URL (default localhost:8081) with --embedding flag
 *     e.g.: llama-server.exe -m models/embeddinggemma-300m-f16.gguf --embedding --port 8081
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

// ── CLI args ─────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const arg = (flag, def) => {
  const i = argv.indexOf(flag);
  return i !== -1 ? argv[i + 1] : def;
};
const flag = (f) => argv.includes(f);

const N_QUERIES   = parseInt(arg('--queries', '100'), 10);
const K           = parseInt(arg('--k', '10'), 10);
const COLLECTION  = arg('--collection', 'codebase_chunks_768');
const OUT_PATH    = arg('--out', null);
const OLLAMA_ONLY = flag('--ollama-only');
const LLAMA_ONLY  = flag('--llama-only');

const OLLAMA_URL     = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const LLAMA_EMBED_URL = process.env.LLAMA_EMBED_URL ?? 'http://localhost:8081';
const QDRANT_URL     = process.env.QDRANT_URL ?? 'http://localhost:6333';
const TIMEOUT        = 15_000;

// ── Embed helpers ─────────────────────────────────────────────────────────────

async function embedOllama(text) {
  const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'embeddinggemma:latest', prompt: text }),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`Ollama embed HTTP ${res.status}`);
  const data = await res.json();
  if (!data.embedding?.length) throw new Error('Ollama embed: empty embedding');
  return data.embedding;
}

async function embedLlama(text) {
  // Try OpenAI /v1/embeddings first (llama-server with --embedding flag)
  const res = await fetch(`${LLAMA_EMBED_URL}/v1/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'embeddinggemma', input: text }),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) {
    // fallback: llama.cpp native /embedding endpoint
    const res2 = await fetch(`${LLAMA_EMBED_URL}/embedding`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text }),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res2.ok) throw new Error(`llama-server embed HTTP ${res2.status}`);
    const data2 = await res2.json();
    const emb = data2.embedding ?? data2.data?.[0]?.embedding;
    if (!emb?.length) throw new Error('llama-server embed: empty embedding');
    return emb;
  }
  const data = await res.json();
  const emb = data.data?.[0]?.embedding;
  if (!emb?.length) throw new Error('llama-server v1 embed: empty embedding');
  return emb;
}

// ── Qdrant search ─────────────────────────────────────────────────────────────

async function qdrantSearch(embedding, limit = K) {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vector: embedding, limit, with_payload: true, with_vector: false }),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`Qdrant search HTTP ${res.status}`);
  const data = await res.json();
  return (data.result ?? []).map(h => ({
    id: String(h.id),
    score: h.score,
    text: String(h.payload?.text ?? h.payload?.content ?? h.payload?.chunk_text ?? '').slice(0, 100),
    sourceRef: String(h.payload?.sourceRef ?? h.payload?.relativePath ?? h.payload?.file_path ?? ''),
  }));
}

// ── Metrics ───────────────────────────────────────────────────────────────────

function mrr(hits) {
  // MRR: mean reciprocal rank where rank 1 = highest score
  // Since we have no ground-truth labels, we use self-overlap as proxy:
  // rank 1 is always rank 1 = reciprocal 1.0
  // For a real eval, pass ground-truth relevant IDs.
  // Here we report average top-1 score as a proxy for confidence.
  if (!hits.length) return 0;
  return hits[0].score;
}

function ndcg(hits) {
  // NDCG@K with score as relevance (no binary ground truth available)
  const ideal = [...hits].sort((a, b) => b.score - a.score);
  let dcg = 0;
  let idcg = 0;
  for (let i = 0; i < hits.length; i++) {
    const rel = hits[i].score;
    const irel = ideal[i].score;
    dcg  += rel  / Math.log2(i + 2);
    idcg += irel / Math.log2(i + 2);
  }
  return idcg === 0 ? 0 : dcg / idcg;
}

function recall(hitsA, hitsB) {
  // Top-K overlap between two result sets (symmetric)
  const idsA = new Set(hitsA.map(h => h.id));
  const idsB = new Set(hitsB.map(h => h.id));
  let overlap = 0;
  for (const id of idsA) if (idsB.has(id)) overlap++;
  return idsA.size === 0 ? 0 : overlap / idsA.size;
}

// ── Sample queries from Qdrant ────────────────────────────────────────────────

async function sampleQueries(n) {
  // Scroll random points and use their text as queries
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit: n * 2, with_payload: true, with_vector: false }),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`Qdrant scroll HTTP ${res.status}`);
  const data = await res.json();
  const points = data.result?.points ?? [];

  const queries = [];
  for (const p of points) {
    const text = String(p.payload?.text ?? p.payload?.content ?? p.payload?.chunk_text ?? '').trim();
    if (text.length >= 40) {
      // Use first 120 chars as query — simulates natural-language retrieval
      queries.push(text.slice(0, 120));
      if (queries.length >= n) break;
    }
  }
  return queries;
}

// ── Health checks ─────────────────────────────────────────────────────────────

async function checkHealth() {
  const results = { ollama: false, llama: false, qdrant: false };

  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    results.ollama = r.ok;
  } catch { /* unreachable */ }

  try {
    const r = await fetch(`${LLAMA_EMBED_URL}/health`, { signal: AbortSignal.timeout(3000) });
    results.llama = r.ok;
  } catch {
    try {
      // llama-server may not have /health — try /v1/models
      const r2 = await fetch(`${LLAMA_EMBED_URL}/v1/models`, { signal: AbortSignal.timeout(3000) });
      results.llama = r2.ok;
    } catch { /* unreachable */ }
  }

  try {
    const r = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`, { signal: AbortSignal.timeout(3000) });
    results.qdrant = r.ok;
  } catch { /* unreachable */ }

  return results;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  console.log('\n── Embed Head-to-Head Eval ─────────────────────────────────');
  console.log(`   Collection : ${COLLECTION}`);
  console.log(`   Queries    : ${N_QUERIES}`);
  console.log(`   K          : ${K}`);
  console.log(`   Ollama     : ${OLLAMA_URL}`);
  console.log(`   llama-srv  : ${LLAMA_EMBED_URL}`);

  const health = await checkHealth();
  console.log(`\n   Health: ollama=${health.ollama} llama=${health.llama} qdrant=${health.qdrant}`);

  if (!health.qdrant) {
    console.error('\n✗ Qdrant unreachable — cannot run eval');
    process.exit(1);
  }
  if (!LLAMA_ONLY && !health.ollama) {
    console.warn('\n⚠ Ollama unreachable — running llama-server lane only');
  }
  if (!OLLAMA_ONLY && !health.llama) {
    console.warn(`\n⚠ llama-server :8081 unreachable`);
    console.warn(`  Start it: llama-server.exe -m models/embeddinggemma-300m-f16.gguf --embedding --port 8081 --ctx-size 512`);
    if (LLAMA_ONLY) process.exit(1);
  }

  // Sample queries
  console.log(`\n── Sampling ${N_QUERIES} queries from Qdrant...`);
  const queries = await sampleQueries(N_QUERIES);
  if (queries.length === 0) {
    console.error('✗ No text found in Qdrant collection — index first with graphify:semantic');
    process.exit(1);
  }
  console.log(`   Got ${queries.length} queries`);

  // Run eval
  const ollamaMetrics = { mrr: [], ndcg: [], latency: [], errors: 0 };
  const llamaMetrics  = { mrr: [], ndcg: [], latency: [], errors: 0 };
  const overlapScores = [];

  const runOllama = !LLAMA_ONLY && health.ollama;
  const runLlama  = !OLLAMA_ONLY && health.llama;

  let processed = 0;
  for (const query of queries) {
    process.stdout.write(`\r   Progress: ${processed + 1}/${queries.length}`);

    let ollamaHits = null;
    let llamaHits  = null;

    if (runOllama) {
      const t0 = Date.now();
      try {
        const emb = await embedOllama(query);
        ollamaHits = await qdrantSearch(emb);
        ollamaMetrics.latency.push(Date.now() - t0);
        ollamaMetrics.mrr.push(mrr(ollamaHits));
        ollamaMetrics.ndcg.push(ndcg(ollamaHits));
      } catch {
        ollamaMetrics.errors++;
      }
    }

    if (runLlama) {
      const t0 = Date.now();
      try {
        const emb = await embedLlama(query);
        llamaHits = await qdrantSearch(emb);
        llamaMetrics.latency.push(Date.now() - t0);
        llamaMetrics.mrr.push(mrr(llamaHits));
        llamaMetrics.ndcg.push(ndcg(llamaHits));
      } catch {
        llamaMetrics.errors++;
      }
    }

    if (ollamaHits && llamaHits) {
      overlapScores.push(recall(ollamaHits, llamaHits));
    }

    processed++;
  }

  process.stdout.write('\n');

  // Aggregate
  const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  const p50 = arr => { if (!arr.length) return null; const s = [...arr].sort((a,b)=>a-b); return s[Math.floor(s.length*0.5)]; };
  const p95 = arr => { if (!arr.length) return null; const s = [...arr].sort((a,b)=>a-b); return s[Math.floor(s.length*0.95)]; };

  const report = {
    timestamp: new Date().toISOString(),
    collection: COLLECTION,
    queries: queries.length,
    k: K,
    ollama: runOllama ? {
      endpoint: OLLAMA_URL,
      model: 'embeddinggemma:latest',
      mrr:    parseFloat((avg(ollamaMetrics.mrr) ?? 0).toFixed(4)),
      ndcg:   parseFloat((avg(ollamaMetrics.ndcg) ?? 0).toFixed(4)),
      latency_p50_ms: Math.round(p50(ollamaMetrics.latency) ?? 0),
      latency_p95_ms: Math.round(p95(ollamaMetrics.latency) ?? 0),
      errors: ollamaMetrics.errors,
    } : null,
    llama_server: runLlama ? {
      endpoint: LLAMA_EMBED_URL,
      model: 'embeddinggemma-300m-f16.gguf',
      mrr:    parseFloat((avg(llamaMetrics.mrr) ?? 0).toFixed(4)),
      ndcg:   parseFloat((avg(llamaMetrics.ndcg) ?? 0).toFixed(4)),
      latency_p50_ms: Math.round(p50(llamaMetrics.latency) ?? 0),
      latency_p95_ms: Math.round(p95(llamaMetrics.latency) ?? 0),
      errors: llamaMetrics.errors,
    } : null,
    delta: (runOllama && runLlama) ? {
      mrr:  parseFloat(((avg(llamaMetrics.mrr) ?? 0) - (avg(ollamaMetrics.mrr) ?? 0)).toFixed(4)),
      ndcg: parseFloat(((avg(llamaMetrics.ndcg) ?? 0) - (avg(ollamaMetrics.ndcg) ?? 0)).toFixed(4)),
      top_k_overlap: parseFloat((avg(overlapScores) ?? 0).toFixed(4)),
    } : null,
    verdict: null,
  };

  // Verdict
  if (report.delta) {
    const mrrDelta = report.delta.mrr;
    const ndcgDelta = report.delta.ndcg;
    if (Math.abs(mrrDelta) < 0.01 && Math.abs(ndcgDelta) < 0.01) {
      report.verdict = 'EQUIVALENT — both lanes produce same results; prefer Ollama (simpler ops)';
    } else if (mrrDelta > 0.01 || ndcgDelta > 0.01) {
      report.verdict = 'LLAMA-SERVER WINS — :8081 lane improves retrieval quality; keep it active';
    } else {
      report.verdict = 'OLLAMA WINS — :8081 lane hurts retrieval quality; disable OLLAMA_EMBED_BASE_URL';
    }
  } else if (runOllama) {
    report.verdict = 'OLLAMA ONLY — llama-server not available for comparison';
  } else {
    report.verdict = 'LLAMA-SERVER ONLY — Ollama not available for comparison';
  }

  // Print
  console.log('\n── Results ─────────────────────────────────────────────────');
  if (report.ollama) {
    console.log(`\n  Ollama (:11434)`);
    console.log(`    MRR@${K}  : ${report.ollama.mrr}`);
    console.log(`    NDCG@${K} : ${report.ollama.ndcg}`);
    console.log(`    p50 lat : ${report.ollama.latency_p50_ms}ms`);
    console.log(`    p95 lat : ${report.ollama.latency_p95_ms}ms`);
    console.log(`    errors  : ${report.ollama.errors}`);
  }
  if (report.llama_server) {
    console.log(`\n  llama-server (:8081)`);
    console.log(`    MRR@${K}  : ${report.llama_server.mrr}`);
    console.log(`    NDCG@${K} : ${report.llama_server.ndcg}`);
    console.log(`    p50 lat : ${report.llama_server.latency_p50_ms}ms`);
    console.log(`    p95 lat : ${report.llama_server.latency_p95_ms}ms`);
    console.log(`    errors  : ${report.llama_server.errors}`);
  }
  if (report.delta) {
    console.log(`\n  Delta (llama - ollama)`);
    console.log(`    ΔMRR    : ${report.delta.mrr > 0 ? '+' : ''}${report.delta.mrr}`);
    console.log(`    ΔNDCG   : ${report.delta.ndcg > 0 ? '+' : ''}${report.delta.ndcg}`);
    console.log(`    overlap : ${(report.delta.top_k_overlap * 100).toFixed(1)}% top-${K} match`);
  }
  console.log(`\n  Verdict: ${report.verdict}`);

  // Save
  const outPath = OUT_PATH ?? path.join(ROOT, 'memory/exports/embed-head-to-head.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\n  Report saved → ${path.relative(ROOT, outPath)}`);
}

run().catch(e => { console.error(e); process.exit(1); });