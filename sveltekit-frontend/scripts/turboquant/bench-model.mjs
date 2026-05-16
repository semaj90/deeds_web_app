#!/usr/bin/env node
/**
 * bench-model.mjs — model throughput benchmark for the YorHA inference stack
 *
 * Sends N prompts to a running llama-server and reports tokens/sec, TTFT,
 * and total latency. Designed to compare:
 *   stock          ROTORQUANT_MODEL_PATH + stock binary   (TURBO_PROFILE=stock)
 *   atomicbot      AtomicBot binary + turbo3/turbo3 + --mtp-head
 *   turboquant     test1111 fork  + q8_0/turbo3
 *
 * Usage:
 *   node scripts/turboquant/bench-model.mjs
 *   node scripts/turboquant/bench-model.mjs --label rotorquant --n 10
 *   node scripts/turboquant/bench-model.mjs --compare   (reads saved runs, prints table)
 *   node scripts/turboquant/bench-model.mjs --port 8091 --label my-run
 *
 * Saves results to logs/turboquant/bench-<label>-<timestamp>.json
 */

import { writeFileSync, mkdirSync, readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { performance } from 'perf_hooks';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const LOG_DIR = join(ROOT, 'logs', 'turboquant');

// ── Parse CLI args ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(name);
  if (i !== -1 && args[i + 1] && !args[i + 1].startsWith('--')) return args[i + 1];
  return def;
};
const hasFlag = (name) => args.includes(name);

const PORT    = flag('--port', process.env.TURBO_PORT ?? '8080');
const LABEL   = flag('--label', `run-${Date.now()}`);
const N       = parseInt(flag('--n', '5'), 10);
const COMPARE = hasFlag('--compare');
const BASE_URL = `http://127.0.0.1:${PORT}`;

// ── Prompts ────────────────────────────────────────────────────────────────────
const PROMPTS = [
  'What is the hearsay rule in evidence law? Answer in one sentence.',
  'Define "beyond reasonable doubt" concisely.',
  'What makes a contract legally binding? List three elements.',
  'Explain the difference between civil and criminal liability in two sentences.',
  'What is the fruit of the poisonous tree doctrine?',
  'Summarize the Miranda warning.',
  'What is mens rea?',
  'Define habeas corpus.',
];

// ── Single inference call ──────────────────────────────────────────────────────
async function infer(prompt) {
  const t0 = performance.now();
  let firstToken = null;
  let outputTokens = 0;

  const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'local',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 512,
      stream: true,
      temperature: 0.1,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') break;
      try {
        const obj = JSON.parse(data);
        const delta = obj?.choices?.[0]?.delta;
        // Gemma 4 thinking model: reasoning_content = thinking tokens, content = answer tokens
        const text = delta?.content ?? delta?.reasoning_content ?? '';
        if (text) {
          if (firstToken === null) firstToken = performance.now() - t0;
          outputTokens++;
        }
      } catch { /* ignore malformed SSE chunk */ }
    }
  }

  const totalMs = performance.now() - t0;
  return { totalMs, ttftMs: firstToken ?? totalMs, outputTokens };
}

// ── Health check ───────────────────────────────────────────────────────────────
async function ensureHealthy() {
  try {
    const res = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(3_000) });
    if (!res.ok) throw new Error(`health ${res.status}`);
    return true;
  } catch (e) {
    return false;
  }
}

// ── Run benchmark ──────────────────────────────────────────────────────────────
async function runBench() {
  console.log(`\n📊 bench-model — label="${LABEL}", port=${PORT}, n=${N}`);
  console.log(`   Endpoint: ${BASE_URL}`);

  if (!await ensureHealthy()) {
    console.error(`\n❌  llama-server not healthy on ${BASE_URL}`);
    console.error(`   Start it first: npm run turbo:start  (or turbo:start:rotorquant / turbo:start:atomicbot)`);
    process.exit(1);
  }
  console.log(`   Server: healthy ✅\n`);

  // Probe model info
  let modelId = 'unknown';
  try {
    const info = await fetch(`${BASE_URL}/v1/models`).then(r => r.json());
    modelId = info?.data?.[0]?.id ?? 'unknown';
  } catch { /* not fatal */ }

  const subset = PROMPTS.slice(0, Math.min(N, PROMPTS.length));
  // Pad to N if needed by repeating
  while (subset.length < N) subset.push(...PROMPTS.slice(0, N - subset.length));

  const results = [];
  for (let i = 0; i < subset.length; i++) {
    const prompt = subset[i];
    process.stdout.write(`  [${i + 1}/${subset.length}] inferring...`);
    try {
      const r = await infer(prompt);
      const tps = r.outputTokens > 0 ? (r.outputTokens / (r.totalMs / 1000)).toFixed(1) : 'n/a';
      console.log(` TTFT=${r.ttftMs.toFixed(0)}ms  total=${r.totalMs.toFixed(0)}ms  tok/s=${tps}`);
      results.push({ prompt: prompt.slice(0, 40), ...r, tokPerSec: parseFloat(tps) || 0 });
    } catch (e) {
      console.log(` ERROR: ${e.message}`);
      results.push({ prompt: prompt.slice(0, 40), error: e.message });
    }
  }

  const ok = results.filter(r => !r.error);
  const avgTtft   = ok.reduce((s, r) => s + r.ttftMs, 0) / (ok.length || 1);
  const avgTotal  = ok.reduce((s, r) => s + r.totalMs, 0) / (ok.length || 1);
  const avgTps    = ok.reduce((s, r) => s + r.tokPerSec, 0) / (ok.length || 1);

  console.log(`\n  ┌── Summary ──────────────────────────────────────`);
  console.log(`  │  label     : ${LABEL}`);
  console.log(`  │  model     : ${modelId}`);
  console.log(`  │  runs      : ${ok.length}/${results.length} ok`);
  console.log(`  │  avg TTFT  : ${avgTtft.toFixed(0)} ms`);
  console.log(`  │  avg total : ${avgTotal.toFixed(0)} ms`);
  console.log(`  │  avg tok/s : ${avgTps.toFixed(1)}`);
  console.log(`  └─────────────────────────────────────────────────\n`);

  // Persist
  mkdirSync(LOG_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = join(LOG_DIR, `bench-${LABEL}-${ts}.json`);
  writeFileSync(outPath, JSON.stringify({
    label: LABEL, modelId, port: PORT, n: N,
    avgTtftMs: +avgTtft.toFixed(1),
    avgTotalMs: +avgTotal.toFixed(1),
    avgTokPerSec: +avgTps.toFixed(2),
    runs: results,
    timestamp: new Date().toISOString(),
  }, null, 2));
  console.log(`  Saved: ${outPath}`);
}

// ── Compare saved runs ─────────────────────────────────────────────────────────
function compareSaved() {
  let files;
  try {
    files = readdirSync(LOG_DIR).filter(f => f.startsWith('bench-') && f.endsWith('.json'));
  } catch {
    console.error('No bench results found in', LOG_DIR);
    process.exit(1);
  }
  if (!files.length) { console.log('No bench results found.'); return; }

  const runs = files.map(f => {
    try { return JSON.parse(readFileSync(join(LOG_DIR, f), 'utf8')); } catch { return null; }
  }).filter(Boolean).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  console.log('\n📊 Benchmark comparison (sorted by time):');
  console.log('  ' + ['Label'.padEnd(20), 'Model'.padEnd(24), 'TTFT(ms)'.padEnd(10), 'Total(ms)'.padEnd(12), 'Tok/s'].join('  '));
  console.log('  ' + '─'.repeat(74));
  for (const r of runs) {
    const label = (r.label ?? 'unknown').padEnd(20);
    const model = (r.modelId ?? 'unknown').slice(0, 22).padEnd(24);
    const ttft  = String(r.avgTtftMs ?? 'n/a').padEnd(10);
    const total = String(r.avgTotalMs ?? 'n/a').padEnd(12);
    const tps   = String(r.avgTokPerSec ?? 'n/a');
    console.log(`  ${label}  ${model}  ${ttft}  ${total}  ${tps}`);
  }
  console.log();
}

// ── Entry ────────────────────────────────────────────────────────────────────
if (COMPARE) {
  compareSaved();
} else {
  runBench().catch(e => { console.error(e); process.exit(1); });
}
