#!/usr/bin/env node
/**
 * Phase 2 — LLM Codebase Summarizer
 *
 * For each file in the deep import graph, generates a 2–3 sentence summary:
 *   "This file does X. It provides Y to Z callers. Key exports: W."
 *
 * Pipeline:
 *   deep-import-graph.json → filter interesting files → Ollama gemma3:270m
 *   → Redis code:summary:{sha1(rel)}  (24h TTL)
 *   → docs/graph/llm-summaries.json
 *   → Qdrant codebase_chunks_768 payload enrichment (if --qdrant)
 *
 * Model choice: gemma3:270m (< 1GB VRAM, runs alongside gemma4-rotorquant:latest).
 * Batches: 4 concurrent requests, 15s per-request timeout.
 * Skips: test files, generated files, files < 10 lines, already-summarized.
 *
 * Usage (from sveltekit-frontend/):
 *   node scripts/summarize-codebase-llm.mjs [--limit N] [--qdrant] [--force] [--quiet]
 *
 * --limit N   only process first N eligible files (default: all)
 * --force     re-generate even if Redis cache exists
 * --qdrant    upsert summaries into Qdrant codebase_chunks_768 payload
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '..');
const DEEP_JSON = join(ROOT, 'docs', 'graph', 'deep-import-graph.json');
const FAST_JSON = join(ROOT, 'docs', 'graph', 'codebase-graph.json');
const OUT_JSON  = join(ROOT, 'docs', 'graph', 'llm-summaries.json');

const QUIET       = process.argv.includes('--quiet');
const FORCE       = process.argv.includes('--force');
const USE_QDRANT  = process.argv.includes('--qdrant');
const LIMIT_IDX   = process.argv.indexOf('--limit');
const LIMIT       = LIMIT_IDX >= 0 ? parseInt(process.argv[LIMIT_IDX + 1], 10) : Infinity;

const OLLAMA_URL  = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
const MODEL       = 'gemma3:270m';  // fast, no VRAM swap
const BATCH       = 4;              // concurrent requests
const TIMEOUT_MS  = 15_000;

const log  = (...a) => { if (!QUIET) console.log(...a); };
const warn = (...a) => console.warn(...a);

// ── 1. Load graph ─────────────────────────────────────────────────────────────

const graphPath = existsSync(DEEP_JSON) ? DEEP_JSON : FAST_JSON;
const graph = JSON.parse(readFileSync(graphPath, 'utf8'));
const nodes = graph.nodes ?? graph.files ?? [];
log(`\n🤖 LLM Codebase Summarizer`);
log(`   Model: ${MODEL}  Batch: ${BATCH}  Source: ${graphPath.split(/[/\\]/).slice(-2).join('/')}`);

// ── 2. Redis setup ────────────────────────────────────────────────────────────

let redis = null;
try {
  const { default: Redis } = await import('ioredis');
  redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', { lazyConnect: false });
  await redis.ping();
  log(`   Redis: connected`);
} catch (e) {
  warn(`   Redis: unavailable (${e.message}) — summaries will not be cached`);
}

function summaryKey(rel) {
  return `code:summary:${createHash('sha1').update(rel).digest('hex').slice(0, 16)}`;
}

// ── 3. Filter eligible files ─────────────────────────────────────────────────

const SKIP_PATTERNS = [
  /\.(test|spec)\.(ts|js)$/, /playwright/, /\/e2e\//, /\/tests?\//,
  /\/__generated__\//, /\/\.svelte-kit\//, /\/node_modules\//,
  /\/drizzle\//, /\.sql$/, /\.json$/, /\.md$/, /\.css$/, /\.scss$/,
];

function isEligible(n) {
  const rel = n.rel ?? '';
  const lines = n.lineCount ?? 0;
  if (lines < 10) return false;
  if (SKIP_PATTERNS.some(p => p.test(rel))) return false;
  return true;
}

const eligible = nodes.filter(isEligible).slice(0, LIMIT);
log(`   Eligible: ${eligible.length} files (of ${nodes.length} total)`);

// ── 4. Check cache ────────────────────────────────────────────────────────────

const cached = new Map();
if (redis && !FORCE) {
  log(`   Checking Redis cache...`);
  const keys = eligible.map(n => summaryKey(n.rel));
  const values = await redis.mget(...keys);
  values.forEach((v, i) => {
    if (v) cached.set(eligible[i].rel, v);
  });
  log(`   Cache hits: ${cached.size}/${eligible.length}`);
}

const toProcess = FORCE ? eligible : eligible.filter(n => !cached.has(n.rel));
log(`   To process: ${toProcess.length} files\n`);

// ── 5. Build per-file prompt ─────────────────────────────────────────────────

function buildPrompt(node) {
  const rel = node.rel ?? '';
  const ext = node.ext ?? '';
  const lines = node.lineCount ?? 0;
  const exports = (node.exports ?? []).slice(0, 8).join(', ') || 'none';
  const imports = (node.resolvedImports ?? node.imports ?? []).slice(0, 5).join(', ') || 'none';
  const fanIn = node.transitiveFanIn ?? node.directFanIn ?? 0;
  const isRoute = node.isRoute ?? rel.includes('/routes/');
  const isServer = rel.includes('server') || rel.includes('+server');
  const hasAuth = node.hasAuth ?? false;
  const hasZod = node.hasZod ?? false;
  const cycleNote = node.cycleIndex != null ? ` [part of circular dependency chain #${node.cycleIndex}]` : '';

  const context = [
    `File: ${rel}`,
    `Type: ${ext} | Lines: ${lines} | Transitive dependents: ${fanIn}${cycleNote}`,
    isRoute ? `Route file (SvelteKit ${isServer ? 'server handler' : 'page'})` : '',
    hasAuth ? `Has authentication guard` : '',
    hasZod ? `Uses Zod validation` : '',
    `Exports: ${exports}`,
    `Key imports: ${imports}`,
  ].filter(Boolean).join('\n');

  return `You are a senior TypeScript/SvelteKit architect reviewing source code.
Given this file metadata, write exactly 2 sentences describing what this file does and why it matters.
Be specific: name the exports, the callers, or the domain. Do NOT say "This file is a file" or "This module is a module".

${context}

Write 2 sentences only. First sentence: what it does. Second sentence: who uses it or why it matters in the architecture.`;
}

// ── 6. Call Ollama ────────────────────────────────────────────────────────────

async function generateSummary(node) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:  MODEL,
        prompt: buildPrompt(node),
        stream: false,
        options: { temperature: 0.2, num_predict: 120 },
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
    const body = await res.json();
    return (body.response ?? '').trim();
  } finally {
    clearTimeout(tid);
  }
}

// ── 7. Process in batches ─────────────────────────────────────────────────────

const results = new Map();

// Seed with cached values
for (const [rel, summary] of cached) results.set(rel, summary);

let processed = 0;
let errors = 0;

for (let i = 0; i < toProcess.length; i += BATCH) {
  const batch = toProcess.slice(i, i + BATCH);
  const settled = await Promise.allSettled(batch.map(n => generateSummary(n)));

  for (let j = 0; j < batch.length; j++) {
    const node = batch[j];
    const result = settled[j];
    if (result.status === 'fulfilled' && result.value) {
      results.set(node.rel, result.value);
      if (redis) {
        redis.set(summaryKey(node.rel), result.value, 'EX', 86400).catch(() => {});
      }
      processed++;
    } else {
      errors++;
    }
  }

  if (!QUIET) {
    const total = processed + errors + cached.size;
    const pct = Math.round(100 * total / eligible.length);
    process.stdout.write(`\r   ${total}/${eligible.length} (${pct}%) — ${errors} errors   `);
  }
}

if (!QUIET) process.stdout.write('\r\x1b[K');
log(`\n   Generated: ${processed}  Cached: ${cached.size}  Errors: ${errors}`);

// ── 8. Write JSON output ──────────────────────────────────────────────────────

const summaryList = [...results.entries()].map(([rel, summary]) => ({
  rel,
  summary,
  hash: createHash('sha1').update(rel).digest('hex').slice(0, 16),
}));

const out = {
  generatedAt: new Date().toISOString(),
  model: MODEL,
  count: summaryList.length,
  summaries: summaryList,
};

writeFileSync(OUT_JSON, JSON.stringify(out, null, 2));
log(`✓ llm-summaries.json written (${summaryList.length} summaries)`);

// ── 9. Qdrant payload enrichment (optional) ───────────────────────────────────

if (USE_QDRANT && results.size > 0) {
  try {
    const QDRANT_URL  = process.env.QDRANT_URL ?? 'http://localhost:6333';
    const COLLECTION  = 'codebase_chunks_768';

    // We don't have point IDs here — use Qdrant scroll to find points by payload.filePath
    // Then update payload with llm_summary field.
    // Process in batches of 50 to avoid large requests.

    log(`\n   Enriching Qdrant payloads...`);
    let qdrantUpdated = 0;

    const QDRANT_BATCH = 50;
    const entries = [...results.entries()];

    for (let i = 0; i < entries.length; i += QDRANT_BATCH) {
      const chunk = entries.slice(i, i + QDRANT_BATCH);

      for (const [rel, summary] of chunk) {
        // Scroll to find matching points
        const scrollRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filter: { must: [{ key: 'file_path', match: { value: rel } }] },
            limit: 10,
            with_payload: false,
            with_vector: false,
          }),
        });
        if (!scrollRes.ok) continue;
        const scrollBody = await scrollRes.json();
        const pts = scrollBody.result?.points ?? [];
        if (pts.length === 0) continue;

        // Batch set payload
        await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/payload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            payload: { llm_summary: summary },
            points: pts.map(p => p.id),
          }),
        });
        qdrantUpdated += pts.length;
      }

      if (!QUIET) process.stdout.write(`\r   Qdrant: ${Math.min(i + QDRANT_BATCH, entries.length)}/${entries.length} files   `);
    }

    if (!QUIET) process.stdout.write('\r\x1b[K');
    log(`✓ Qdrant: ${qdrantUpdated} points enriched with llm_summary`);
  } catch (e) {
    warn(`⚠ Qdrant enrichment skipped: ${e.message}`);
  }
}

// ── 10. Cleanup ───────────────────────────────────────────────────────────────

if (redis) await redis.quit();

console.log(`
🤖 LLM Summarization Complete
   Summaries: ${results.size}
   Output:    docs/graph/llm-summaries.json
   Redis TTL: 24h (key: code:summary:<sha1>)
`);
