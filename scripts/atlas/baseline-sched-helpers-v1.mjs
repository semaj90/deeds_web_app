#!/usr/bin/env node
/**
 * baseline-sched-helpers-v1.mjs  (AFC-SCHED-01, READ-ONLY)
 *
 * Measures the facts the parallel NLP / summarization helper plan depends on.
 * Writes no datastore. Sends a handful of bounded requests to :8090 (inference) and :8095 (analyze).
 *
 *   host      RAM, disk, VRAM at start and end
 *   postgres  eligibility-query latency (BEGIN READ ONLY, LIMIT-bounded)
 *   ornith    seconds per summary at small/medium/large chunks, then 2 concurrent requests (slot serialization)
 *   sidecar   :8095 /analyze latency at concurrency 1 / 2 / 4
 *
 * Usage (from sveltekit-frontend/): node --env-file=.env ../scripts/atlas/baseline-sched-helpers-v1.mjs [--skip-ornith]
 * Receipt: .tmp/atlas/sched-baseline-receipt-v1.json  (canonicalAuthority:false, writesPerformed:false)
 */
import { spawnSync } from 'node:child_process';
import { statfsSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const LLM = (process.env.LLAMA_SERVER_URL ?? 'http://127.0.0.1:8090').replace(/\/$/, '');
const NLP = (process.env.NLP_URL ?? 'http://127.0.0.1:8095').replace(/\/$/, '');
const SKIP_ORNITH = process.argv.includes('--skip-ornith');
const GiB = 1024 ** 3;
const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)] : null; };

function hostSnapshot() {
  let disk = null;
  try { const s = statfsSync('C:\\'); disk = { freeGiB: round((s.bavail * s.bsize) / GiB, 1), totalGiB: round((s.blocks * s.bsize) / GiB, 1) }; } catch { /* non-windows */ }
  let vram = null;
  const r = spawnSync('nvidia-smi', ['--query-gpu=memory.total,memory.used,memory.free', '--format=csv,noheader,nounits'], { encoding: 'utf8' });
  if (r.status === 0) { const [t, u, f] = r.stdout.trim().split(',').map((x) => Number(x)); vram = { totalMiB: t, usedMiB: u, freeMiB: f }; }
  return { at: new Date().toISOString(), ramFreeGiB: round(os.freemem() / GiB, 2), ramTotalGiB: round(os.totalmem() / GiB, 1), disk, vram };
}

async function timed(fn) { const t0 = performance.now(); const v = await fn(); return { ms: performance.now() - t0, v }; }

// ── postgres ────────────────────────────────────────────────────────────────
async function stagePostgres(pool) {
  const out = { note: 'BEGIN READ ONLY; LIMIT-bounded; eligibility = canonical 768-d embedding present and summary blank' };
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout = '120s'");
    const q = `SELECT id FROM codebase_chunk_index WHERE content_embedding_768 IS NOT NULL AND (summary IS NULL OR btrim(summary) = '') LIMIT 1000`;
    const times = [];
    for (let i = 0; i < 5; i++) times.push((await timed(() => client.query(q))).ms);
    out.eligibilityLimit1000Ms = { runs: times.map((t) => round(t, 1)), p50: round(median(times), 1) };
    const c = await timed(() => client.query(`SELECT count(*)::bigint AS eligible FROM codebase_chunk_index WHERE content_embedding_768 IS NOT NULL AND (summary IS NULL OR btrim(summary) = '')`));
    out.eligibleCount = Number(c.v.rows[0].eligible);
    out.eligibleCountMs = round(c.ms, 0);
    const counts = await timed(() => client.query(`SELECT count(*)::bigint AS total,
      count(*) FILTER (WHERE content_embedding_768 IS NOT NULL)::bigint AS embedded,
      count(*) FILTER (WHERE summary IS NOT NULL AND btrim(summary) <> '')::bigint AS summarized,
      count(*) FILTER (WHERE content_embedding_768 IS NOT NULL AND summary IS NOT NULL AND btrim(summary) <> '')::bigint AS both FROM codebase_chunk_index`));
    const r0 = counts.v.rows[0];
    out.totalChunks = Number(r0.total);
    out.counts = { embedded: Number(r0.embedded), summarized: Number(r0.summarized), both: Number(r0.both), queryMs: round(counts.ms, 0) };
    await client.query('ROLLBACK');
  } catch (e) { out.error = String(e.message ?? e).slice(0, 200); await client.query('ROLLBACK').catch(() => {}); } finally { client.release(); }
  return out;
}

async function sampleChunks(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const pick = async (lo, hi) => (await client.query(
      `SELECT relative_path, content FROM codebase_chunk_index WHERE content_embedding_768 IS NOT NULL AND length(content) BETWEEN $1 AND $2 LIMIT 1`, [lo, hi])).rows[0];
    const sample = { small: await pick(400, 800), medium: await pick(2000, 3000), large: (await pick(6000, 9000)) ?? (await pick(3500, 6000)) };
    await client.query('ROLLBACK');
    return sample;
  } finally { client.release(); }
}

// ── ornith ──────────────────────────────────────────────────────────────────
async function summarize(model, text) {
  const t0 = performance.now();
  const res = await fetch(`${LLM}/v1/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(180000),
    body: JSON.stringify({ model, stream: true, temperature: 0, max_tokens: 160,
      messages: [{ role: 'system', content: 'Summarize the code or text in at most two sentences. Output only the summary.' }, { role: 'user', content: text }] }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  let ttft = null, chunks = 0, timings = null, content = '';
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let i; while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:') || line.includes('[DONE]')) continue;
      try { const j = JSON.parse(line.slice(5)); const d = j.choices?.[0]?.delta?.content; if (d) { if (ttft === null) ttft = performance.now() - t0; chunks++; content += d; } if (j.timings) timings = j.timings; } catch { /* partial */ }
    }
  }
  return { totalMs: round(performance.now() - t0, 0), ttftMs: ttft === null ? null : round(ttft, 0), deltaChunks: chunks, outputChars: content.length,
    promptTokens: timings?.prompt_n ?? null, predictedTokens: timings?.predicted_n ?? null,
    promptTokPerSec: timings?.prompt_per_second ? round(timings.prompt_per_second, 1) : null, genTokPerSec: timings?.predicted_per_second ? round(timings.predicted_per_second, 1) : null };
}
async function stageOrnith(samples) {
  const out = { note: 'stream:true per the thinking-model rule; temperature 0; max_tokens 160' };
  try {
    const slots = await (await fetch(`${LLM}/slots`, { signal: AbortSignal.timeout(5000) })).json();
    out.slotsTotal = slots.length; out.slotsBusyAtStart = slots.filter((s) => s.is_processing).length; out.nCtx = slots[0]?.n_ctx;
    if (out.slotsBusyAtStart > 0) { out.blocked = 'BLOCKED: llama-server slot busy; not measuring'; return out; }
    const model = (await (await fetch(`${LLM}/v1/models`)).json()).models?.[0]?.model ?? 'ornith-1.5-9b';
    out.model = model;
    out.bySize = {};
    for (const [k, c] of Object.entries(samples)) {
      if (!c) { out.bySize[k] = { skipped: 'no chunk in range' }; continue; }
      const text = c.content.slice(0, 9000);
      // A unique leading nonce defeats llama-server prompt-prefix reuse so each run pays real prefill, like a backfill of distinct chunks.
      let n = 0; const uniq = () => `[${Date.now()}-${++n}] ${text}`;
      await summarize(model, uniq()); // warm-up
      const runs = [];
      for (let i = 0; i < 3; i++) runs.push(await summarize(model, uniq()));
      out.bySize[k] = { inputChars: text.length, promptTokens: runs[0].promptTokens, promptTokensAllRuns: runs.map((r) => r.promptTokens), predictedTokensMedian: median(runs.map((r) => r.predictedTokens ?? 0)),
        totalMsMedian: median(runs.map((r) => r.totalMs)), ttftMsMedian: median(runs.map((r) => r.ttftMs ?? 0)),
        promptTokPerSecMedian: median(runs.map((r) => r.promptTokPerSec ?? 0)), genTokPerSecMedian: median(runs.map((r) => r.genTokPerSec ?? 0)), runsTotalMs: runs.map((r) => r.totalMs) };
    }
    const small = samples.small?.content.slice(0, 800) ?? 'x';
    const solo = out.bySize.small?.totalMsMedian;
    const t0 = performance.now();
    const pair = await Promise.all([summarize(model, `[${Date.now()}-a] ${small}`), summarize(model, `[${Date.now()}-b] ${small}`)]);
    out.twoConcurrent = { wallMs: round(performance.now() - t0, 0), eachMs: pair.map((p) => p.totalMs), soloSmallMs: solo,
      serialized: solo ? performance.now() - t0 > solo * 1.6 : null };
  } catch (e) { out.error = String(e.message ?? e).slice(0, 200); }
  return out;
}

// ── sidecar ─────────────────────────────────────────────────────────────────
async function stageSidecar() {
  const text = 'The Defendant, Mr. Alvarez, appeared before the Court of Appeals on March 3, 2021, represented by Counsel Smith. The Court reviewed Exhibit 12 and denied the motion under Rule 56. '.repeat(6);
  const one = async () => { const t0 = performance.now(); const r = await fetch(`${NLP}/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(120000), body: JSON.stringify({ text, source_type: 'plain_text', extraction_mode: 'entities' }) }); await r.text(); return { ok: r.ok, ms: performance.now() - t0 }; };
  const out = { note: `${text.length}-char input, 40 requests per level, extraction_mode=entities`, levels: {} };
  try {
    await one(); // warm
    for (const c of [1, 2, 4]) {
      const total = 40; const lat = []; let okCount = 0; const t0 = performance.now();
      let next = 0;
      await Promise.all(Array.from({ length: c }, async () => { while (next < total) { next++; const r = await one(); lat.push(r.ms); if (r.ok) okCount++; } }));
      const wall = performance.now() - t0;
      out.levels[c] = { requests: total, ok: okCount, wallMs: round(wall, 0), throughputPerSec: round(total / (wall / 1000), 2), p50Ms: round(median(lat), 0), p95Ms: round(pct(lat, 0.95), 0) };
    }
  } catch (e) { out.error = String(e.message ?? e).slice(0, 200); }
  return out;
}

// ── main ────────────────────────────────────────────────────────────────────
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required (run with --env-file=.env from sveltekit-frontend/)');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2, statement_timeout: 130000 });
const receipt = { schema: 'atlas.sched-baseline-receipt.v1', task: 'AFC-SCHED-01', generatedAt: new Date().toISOString(), canonicalAuthority: false, writesPerformed: false, hostStart: hostSnapshot() };
try {
  console.log('postgres...'); receipt.postgres = await stagePostgres(pool);
  console.log('sidecar...'); receipt.sidecar = await stageSidecar();
  if (SKIP_ORNITH) receipt.ornith = { skipped: '--skip-ornith' };
  else { console.log('ornith...'); const samples = await sampleChunks(pool); receipt.ornith = await stageOrnith(samples); }
} finally { await pool.end(); }
receipt.hostEnd = hostSnapshot();
mkdirSync(path.join(ROOT, '.tmp', 'atlas'), { recursive: true });
const out = path.join(ROOT, '.tmp', 'atlas', 'sched-baseline-receipt-v1.json');
writeFileSync(out, JSON.stringify(receipt, null, 2));
console.log(JSON.stringify({ postgres: receipt.postgres, ornith: receipt.ornith, sidecar: receipt.sidecar, hostStart: receipt.hostStart, hostEnd: receipt.hostEnd }, null, 1));
console.log(`receipt: ${path.relative(ROOT, out)}`);
