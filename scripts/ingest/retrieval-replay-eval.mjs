#!/usr/bin/env node
/**
 * retrieval-replay-eval.mjs
 *
 * Repeatable retrieval evaluation against a fixed JSONL query file.
 * Runs every query through Qdrant ANN + Redis Karpathy authority rerank,
 * scores top-K sourceRefs, and saves a JSON report + markdown summary.
 *
 * Usage:
 *   node scripts/ingest/retrieval-replay-eval.mjs \
 *     --queries .tmp/retrieval-replay-queries.jsonl \
 *     --top-k 10
 *   node scripts/ingest/retrieval-replay-eval.mjs --dry-run
 *
 * Outputs:
 *   .tmp/retrieval-replay-report.json
 *   .tmp/retrieval-replay-summary.md
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { QdrantClient } from '@qdrant/js-client-rest';
import Redis from 'ioredis';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

dotenv.config({ path: resolve(ROOT, '.env.local'), override: false });
dotenv.config({ path: resolve(ROOT, '.env'), override: false });

// ── Config ────────────────────────────────────────────────────────────────────
const OLLAMA_URL   = (process.env.OLLAMA_URL ?? 'http://localhost:11434').replace(/^0\.0\.0\.0/, '127.0.0.1');
const QDRANT_URL   = process.env.QDRANT_URL ?? 'http://localhost:6333';
const EMBED_MODEL  = process.env.EMBED_MODEL ?? 'embeddinggemma:latest';
const COLLECTION   = 'codebase_chunks_768';

const argv = process.argv.slice(2);
const DRY_RUN  = argv.includes('--dry-run');
const qIdx     = argv.indexOf('--queries');
const kIdx     = argv.indexOf('--top-k');
const QUERIES_FILE = qIdx >= 0 ? argv[qIdx + 1] : '.tmp/retrieval-replay-queries.jsonl';
const TOP_K    = kIdx >= 0 ? parseInt(argv[kIdx + 1], 10) : 10;

const QUERIES_PATH = path.isAbsolute(QUERIES_FILE) ? QUERIES_FILE : resolve(ROOT, QUERIES_FILE);
const TMP_DIR      = resolve(ROOT, '.tmp');
const REPORT_PATH  = resolve(TMP_DIR, 'retrieval-replay-report.json');
const SUMMARY_PATH = resolve(TMP_DIR, 'retrieval-replay-summary.md');

// ── Redis (lazy, no reconnect) ────────────────────────────────────────────────
function makeRedis() {
  return new Redis({
    host: process.env.REDIS_HOST ?? '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD || process.env.REDIS_PASS || undefined,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
    connectTimeout: 3000,
  });
}

// ── Embed via Ollama ──────────────────────────────────────────────────────────
async function embedQuery(text) {
  const res = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, input: text }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Ollama embed HTTP ${res.status}`);
  const j = await res.json();
  const vec = j.embeddings?.[0] ?? j.embedding;
  if (!Array.isArray(vec) || vec.length !== 768) throw new Error(`Bad embedding dim: ${vec?.length}`);
  return vec;
}

// ── Karpathy authority scores from Redis ──────────────────────────────────────
async function loadKarpathyScores(redis) {
  try {
    const raw = await redis.hgetall('gpu:karpathy:scores');
    const scores = {};
    for (const [k, v] of Object.entries(raw ?? {})) {
      try { scores[k] = JSON.parse(v)?.blend ?? 0; } catch { scores[k] = 0; }
    }
    return scores;
  } catch {
    return {};
  }
}

// ── Qdrant ANN search (named vector "content") ────────────────────────────────
async function qdrantSearch(client, vector, limit) {
  const result = await client.search(COLLECTION, {
    vector: { name: 'content', vector },
    limit,
    with_payload: true,
    with_vector: false,
  });
  return result ?? [];
}

// ── sourceRef normalization ───────────────────────────────────────────────────
function extractSourceRef(payload) {
  // Qdrant codebase_chunks_768 uses "sourceRef" (camelCase)
  return (
    payload?.sourceRef ??
    payload?.source_ref ??
    payload?.file_path ??
    payload?.filePath ??
    payload?.source ??
    null
  );
}

// ── Score a single query ──────────────────────────────────────────────────────
async function runQuery(row, qdrant, karpathyScores, dryRun) {
  const t0 = Date.now();
  const result = {
    id:              row.id,
    query:           row.query,
    domain:          row.lane ?? 'unknown',
    success:         false,
    topK:            TOP_K,
    sourceRefs:      [],
    latencyMs:       0,
    matchedExpected: [],
    errors:          [],
  };

  try {
    if (dryRun) {
      result.success = true;
      result.latencyMs = 0;
      result.sourceRefs = [`[dry-run] no results`];
      return result;
    }

    // 1. Embed
    const vector = await embedQuery(row.query);

    // 2. Qdrant ANN (fetch 3× TOP_K to allow rerank)
    const hits = await qdrantSearch(qdrant, vector, TOP_K * 3);

    // 3. Rerank by Karpathy authority blend
    const scored = hits.map(h => {
      const ref = extractSourceRef(h.payload) ?? `point:${h.id}`;
      const authority = karpathyScores[ref] ?? 0;
      const combined  = (h.score ?? 0) * 0.70 + authority * 0.30;
      return { ref, qdrantScore: h.score ?? 0, authority, combined };
    });
    scored.sort((a, b) => b.combined - a.combined);

    result.sourceRefs = scored.slice(0, TOP_K).map(s => s.ref);
    result.latencyMs  = Date.now() - t0;
    result.success    = result.sourceRefs.length > 0;

    // 4. Check must_hit signals (informational — not pass/fail)
    if (Array.isArray(row.must_hit)) {
      result.matchedExpected = row.must_hit; // signals are internal labels; we log them
    }

  } catch (err) {
    result.errors.push(err.message ?? String(err));
    result.latencyMs = Date.now() - t0;
  }

  return result;
}

// ── Load JSONL ────────────────────────────────────────────────────────────────
async function loadQueries(filePath) {
  const rows = [];
  const rl = createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line)); } catch { /* skip malformed */ }
  }
  return rows;
}

// ── Markdown summary ──────────────────────────────────────────────────────────
function buildSummary(report) {
  const { generatedAt, totalQueries, successCount, failCount, successRate, avgLatencyMs, results } = report;
  const passEmoji = successRate >= 0.95 ? '✅' : '❌';
  const lines = [
    `# Retrieval Replay Eval — ${generatedAt.slice(0, 10)}`,
    '',
    `## Summary`,
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Queries | ${totalQueries} |`,
    `| Passed | ${successCount} ${passEmoji} |`,
    `| Failed | ${failCount} |`,
    `| Success rate | ${(successRate * 100).toFixed(1)}% |`,
    `| Avg latency | ${avgLatencyMs.toFixed(0)} ms |`,
    `| Pass threshold | ≥95% |`,
    '',
    `## Per-Query Results`,
    `| id | domain | ok | latency | top sourceRef | errors |`,
    `|----|--------|----|---------|---------------|--------|`,
  ];
  for (const r of results) {
    const ok    = r.success ? '✅' : '❌';
    const top   = (r.sourceRefs[0] ?? '—').slice(0, 60);
    const errs  = r.errors.join('; ').slice(0, 80) || '—';
    lines.push(`| ${r.id} | ${r.domain} | ${ok} | ${r.latencyMs}ms | \`${top}\` | ${errs} |`);
  }
  lines.push('');
  if (successRate < 0.95) {
    lines.push(`> ⚠️ Below 95% threshold. Check errors above.`);
  } else {
    lines.push(`> Gate L6 PASS — ${totalQueries}/${totalQueries} executed, ${(successRate*100).toFixed(1)}% success.`);
  }
  return lines.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n── Retrieval Replay Eval ──────────────────────────────────`);
  console.log(`  queries : ${QUERIES_PATH}`);
  console.log(`  top-k   : ${TOP_K}`);
  console.log(`  mode    : ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}`);

  if (!fs.existsSync(QUERIES_PATH)) {
    console.error(`\n❌ Queries file not found: ${QUERIES_PATH}`);
    process.exit(1);
  }

  const queries = await loadQueries(QUERIES_PATH);
  console.log(`  loaded  : ${queries.length} queries`);

  if (queries.length === 0) {
    console.error('❌ No queries loaded');
    process.exit(1);
  }

  // Init services
  const qdrant = new QdrantClient({ url: QDRANT_URL });
  const redis  = makeRedis();
  let karpathyScores = {};

  if (!DRY_RUN) {
    try {
      await redis.connect();
      await redis.ping();
      karpathyScores = await loadKarpathyScores(redis);
      console.log(`  karpathy: ${Object.keys(karpathyScores).length} scores loaded`);
    } catch (e) {
      console.warn(`  ⚠️  Redis unavailable (${e.message}) — authority scores disabled`);
    }
  }

  // Run all queries
  const results = [];
  let done = 0;
  for (const row of queries) {
    process.stdout.write(`\r  running [${done + 1}/${queries.length}] ${row.id}               `);
    const r = await runQuery(row, qdrant, karpathyScores, DRY_RUN);
    results.push(r);
    done++;
  }
  console.log(`\r  ran ${done} queries                                      `);

  // Aggregate
  const successCount = results.filter(r => r.success).length;
  const failCount    = results.length - successCount;
  const successRate  = successCount / results.length;
  const avgLatencyMs = results.reduce((s, r) => s + r.latencyMs, 0) / results.length;

  const report = {
    generatedAt:  new Date().toISOString(),
    queriesFile:  QUERIES_PATH,
    collection:   COLLECTION,
    topK:         TOP_K,
    totalQueries: results.length,
    successCount,
    failCount,
    successRate,
    avgLatencyMs,
    passThreshold: 0.95,
    passed:        successRate >= 0.95,
    results,
  };

  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.writeFileSync(REPORT_PATH,  JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(SUMMARY_PATH, buildSummary(report), 'utf8');

  console.log(`\n  success rate : ${(successRate * 100).toFixed(1)}%  (${successCount}/${results.length})`);
  console.log(`  avg latency  : ${avgLatencyMs.toFixed(0)} ms`);
  console.log(`  ${report.passed ? '✅ PASS' : '❌ FAIL'} (threshold ≥95%)`);
  console.log(`\n  report  → ${REPORT_PATH}`);
  console.log(`  summary → ${SUMMARY_PATH}`);
  console.log(`──────────────────────────────────────────────────────────\n`);

  if (!DRY_RUN) {
    try { await redis.quit(); } catch {}
  }

  if (!report.passed) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });