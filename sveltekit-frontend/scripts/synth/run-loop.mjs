#!/usr/bin/env node
/**
 * run-loop.mjs — Gemma4 ⇄ MCP synthesis loop (Phase C)
 *
 * Orchestrates the 5-lane retrieval+synthesis pipeline:
 *
 *   Lane 1  Retrieval         TRACE MCP (kag_search, expand_neighborhood, …)
 *   Lane 2  Graph analysis    Neo4j-backed PageRank + topology lookups via TRACE
 *   Lane 3  Rerank + KAG      gemma4-offload reranks; web_search fallback
 *   Lane 4  Synthesis         single Gemma4 shot → markdown brief
 *   Lane 5  Handoff           file path printed for Claude Code to read
 *
 * Each lane writes its artifact to scratch/synthesis-runs/<ts>/<lane>.json
 * so any lane can be re-run independently. The final brief lands at
 * memory/implementation-briefs/<ts>_<slug>.md.
 *
 * Designed for zero Claude API tokens: every retrieval + every Gemma4 call
 * happens locally (TRACE MCP on :8788, TurboQuant on :8090, Ollama fallback).
 *
 * Usage:
 *   node scripts/synth/run-loop.mjs --query "wire browser context lane"
 *   node scripts/synth/run-loop.mjs --query "..." --slug browser-context
 *   node scripts/synth/run-loop.mjs --query "..." --dry-run     # skip Lane 4
 *   node scripts/synth/run-loop.mjs --query "..." --depth=2     # graph depth
 *   node scripts/synth/run-loop.mjs --resume <ts>                # rerun from Lane 3
 *
 * Reference: next_steps/active/2026-05-09_gemma4-mcp-synthesis-loop.md
 */

import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

// ── config ──────────────────────────────────────────────────────────

const MCP_BASE     = process.env.TRACE_MCP_URL ?? 'http://127.0.0.1:8788';
const TURBO_BASE   = process.env.TURBO_BASE    ?? 'http://127.0.0.1:8090';
const OLLAMA_BASE  = process.env.OLLAMA_BASE   ?? 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL  ?? 'gemma4-legal-vlm:latest';

const RERANK_CONFIDENCE_THRESHOLD = 0.6;   // below → trigger KAG/web_search fallback
const MAX_LANE1_HITS              = 12;
const MAX_LANE3_KEEP              = 10;
const SYNTHESIS_MAX_TOKENS        = 1500;

// ── args ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function arg(name, def = null) {
  const i = args.indexOf(`--${name}`);
  if (i >= 0 && args[i + 1] && !args[i + 1].startsWith('--')) return args[i + 1];
  const eq = args.find(a => a.startsWith(`--${name}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  return def;
}
function flag(name) { return args.includes(`--${name}`); }

const QUERY    = arg('query');
const SLUG     = arg('slug') ?? slugify(QUERY ?? 'untitled');
const DEPTH    = Number(arg('depth', 2));
const DRY_RUN  = flag('dry-run');
const RESUME   = arg('resume');         // <ts> of a previous run
const VERBOSE  = flag('verbose');
const QUIET    = flag('quiet');

if (!QUERY && !RESUME) {
  console.error('usage: node scripts/synth/run-loop.mjs --query "..." [--slug X] [--depth=N] [--dry-run]');
  console.error('       node scripts/synth/run-loop.mjs --resume <run-ts>  (re-runs Lane 3+ from existing artifacts)');
  process.exit(2);
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 50) || 'untitled';
}

// ── tiny logger ─────────────────────────────────────────────────────

const C = { reset: '\x1b[0m', dim: '\x1b[2m', cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m' };
const log  = (...m) => { if (!QUIET) console.log(...m); };
const dbg  = (...m) => { if (VERBOSE) console.log(C.dim, ...m, C.reset); };
const lane = (n, msg) => log(`${C.cyan}[lane ${n}]${C.reset} ${msg}`);
const ok   = (msg) => log(`  ${C.green}✓${C.reset} ${msg}`);
const warn = (msg) => log(`  ${C.yellow}⚠${C.reset} ${msg}`);
const err  = (msg) => console.error(`  ${C.red}✗${C.reset} ${msg}`);

// ── MCP transport (HTTP+SSE) ────────────────────────────────────────

let mcpId = 1;
async function mcpCall(method, params = {}, { timeoutMs = 20_000 } = {}) {
  const res = await fetch(`${MCP_BASE}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: mcpId++, method, params }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`MCP HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const text = await res.text();
  // Response is either plain JSON or SSE-wrapped (data: <json>)
  const line = text.split('\n').find(l => l.startsWith('{') || l.startsWith('data:'));
  const raw  = line?.startsWith('data:') ? line.slice(5).trim() : (line ?? text);
  const body = JSON.parse(raw);
  if (body.error) throw new Error(`MCP ${method} error: ${body.error.message}`);
  // Tools return { content: [{type:'text', text:'...'}] } — surface the text.
  const content = body.result?.content;
  if (Array.isArray(content) && content.length > 0 && content[0].type === 'text') {
    const txt = content.map(c => c.text ?? '').join('');
    try { return JSON.parse(txt); } catch { return { _raw: txt }; }
  }
  return body.result;
}

async function callTool(name, args, opts) { return mcpCall('tools/call', { name, arguments: args }, opts); }

// ── Gemma4 cascade (TurboQuant first, Ollama fallback) ──────────────

async function gemmaChat(messages, { maxTokens = 256, temperature = 0.2, timeoutMs = 60_000 } = {}) {
  // TurboQuant: OpenAI-compatible
  try {
    const r = await fetch(`${TURBO_BASE}/v1/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gemma4', messages, max_tokens: maxTokens, temperature, stream: false }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (r.ok) {
      const j = await r.json();
      const content = j?.choices?.[0]?.message?.content ?? '';
      return { backend: 'turboquant', content, usage: j?.usage ?? null };
    }
    dbg('turboquant', r.status);
  } catch (e) { dbg('turboquant fail', e.message); }
  // Ollama fallback
  const r = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: OLLAMA_MODEL, messages, stream: false, options: { temperature, num_predict: maxTokens } }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) throw new Error(`gemma cascade exhausted: ollama ${r.status}`);
  const j = await r.json();
  return { backend: 'ollama', content: j?.message?.content ?? '', usage: { prompt_tokens: j?.prompt_eval_count, completion_tokens: j?.eval_count } };
}

// ── run state ───────────────────────────────────────────────────────

function ts() {
  return new Date().toISOString().replace(/[:.]/g, '-').replace(/Z$/, '').slice(0, 19);
}

const RUN_TS  = RESUME ?? ts();
const RUN_DIR = resolve(ROOT, 'scratch', 'synthesis-runs', RUN_TS);

async function ensureDir(d) { await mkdir(d, { recursive: true }); }
async function writeJson(name, data) {
  await ensureDir(RUN_DIR);
  await writeFile(resolve(RUN_DIR, name), JSON.stringify(data, null, 2), 'utf8');
}
async function readJson(name) {
  return JSON.parse(await readFile(resolve(RUN_DIR, name), 'utf8'));
}
async function fileExists(p) { try { await stat(p); return true; } catch { return false; } }

// ── Lane 1 — Retrieval (TRACE MCP, no Claude tokens) ────────────────

async function lane1Retrieval() {
  lane(1, `retrieval — query="${QUERY?.slice(0, 60)}"`);
  const t0 = Date.now();
  const tools = [
    { name: 'trace.kag_search',          args: { query: QUERY, limit: MAX_LANE1_HITS } },
    { name: 'graph.pagerank_top',        args: { limit: 8 } },
    { name: 'context.build_kv_packet',   args: { query: QUERY, topK: 5 } },
  ];
  const results = {};
  for (const t of tools) {
    try {
      const r = await callTool(t.name, t.args);
      results[t.name] = r;
      ok(`${t.name} → ${typeof r === 'object' ? JSON.stringify(r).length : String(r).length} bytes`);
    } catch (e) {
      results[t.name] = { _error: e.message };
      warn(`${t.name} failed: ${e.message.slice(0, 80)}`);
    }
  }
  const out = { query: QUERY, started_at: new Date().toISOString(), duration_ms: Date.now() - t0, results };
  await writeJson('lane1-retrieval.json', out);
  ok(`saved → ${RUN_DIR}/lane1-retrieval.json (${Date.now() - t0}ms)`);
  return out;
}

// ── Lane 2 — Graph analysis (neighbors of top hits) ─────────────────

async function lane2Graph(lane1) {
  lane(2, `graph analysis — depth=${DEPTH}`);
  const t0 = Date.now();
  // Pull candidate stableKeys from Lane 1's KAG hits + PageRank top.
  const candidates = new Set();
  const kag = lane1.results['trace.kag_search'];
  const kagHits = Array.isArray(kag?.hits) ? kag.hits : Array.isArray(kag) ? kag : [];
  for (const h of kagHits.slice(0, 5)) {
    const key = h?.stableKey ?? h?.file_path ?? h?.path;
    if (key) candidates.add(key.startsWith('file:') ? key : `file:${key}`);
  }
  const pr = lane1.results['graph.pagerank_top'];
  const prFiles = Array.isArray(pr?.files) ? pr.files : Array.isArray(pr) ? pr : [];
  for (const f of prFiles.slice(0, 3)) {
    const key = f?.stableKey ?? f?.file_path ?? f?.path;
    if (key) candidates.add(key.startsWith('file:') ? key : `file:${key}`);
  }

  const neighbors = {};
  for (const center of [...candidates].slice(0, 5)) {
    try {
      const r = await callTool('graph.expand_neighborhood', { stableKey: center, depth: DEPTH, limit: 20 });
      neighbors[center] = r;
      ok(`expanded ${center}`);
    } catch (e) {
      neighbors[center] = { _error: e.message };
      warn(`expand ${center} failed: ${e.message.slice(0, 60)}`);
    }
  }
  const out = { candidates: [...candidates], neighbors, duration_ms: Date.now() - t0 };
  await writeJson('lane2-graph.json', out);
  ok(`saved → lane2-graph.json (${Date.now() - t0}ms, ${candidates.size} centers)`);
  return out;
}

// ── Lane 3 — Rerank with Gemma4, KAG fallback if low confidence ─────

async function lane3Rerank(lane1, lane2) {
  lane(3, `rerank + fallback (threshold ${RERANK_CONFIDENCE_THRESHOLD})`);
  const t0 = Date.now();
  // Build a candidate list: KAG hits flatten + neighbor stableKeys.
  const candidates = [];
  const seen = new Set();
  function add(item) {
    const key = item.stableKey ?? item.file_path ?? item.path ?? item.text?.slice(0, 50);
    if (!key || seen.has(key)) return;
    seen.add(key);
    candidates.push(item);
  }
  const kag = lane1.results['trace.kag_search'];
  for (const h of (Array.isArray(kag?.hits) ? kag.hits : Array.isArray(kag) ? kag : []).slice(0, 12)) add(h);
  for (const [center, exp] of Object.entries(lane2.neighbors)) {
    const arr = Array.isArray(exp?.neighbors) ? exp.neighbors : [];
    for (const n of arr.slice(0, 5)) add({ ...n, _from_neighbor_of: center });
  }

  // Gemma4 reranker prompt — ask for confidence per candidate.
  const reranked = [];
  if (candidates.length > 0) {
    const sys = `You are a precision reranker. The user's query is: """${QUERY}""".\n` +
                `For each candidate, output a single JSON line: {"i":<index>,"keep":true|false,"score":0..1,"why":"<6 words>"}\n` +
                `Keep only candidates that are directly load-bearing for implementing the query. Be strict.`;
    const usr = candidates.slice(0, 20).map((c, i) =>
      `${i}: ${c.stableKey ?? c.file_path ?? '?'} — ${(c.text ?? c.label ?? c.summary ?? JSON.stringify(c)).slice(0, 200)}`
    ).join('\n');
    try {
      const out = await gemmaChat([{ role: 'system', content: sys }, { role: 'user', content: usr }], { maxTokens: 800, temperature: 0 });
      for (const line of (out.content ?? '').split('\n')) {
        const m = line.match(/\{[^}]+\}/);
        if (!m) continue;
        try {
          const j = JSON.parse(m[0]);
          if (typeof j.i === 'number' && j.keep && typeof j.score === 'number') {
            const c = candidates[j.i];
            if (c) reranked.push({ ...c, _score: j.score, _why: j.why });
          }
        } catch { /* skip */ }
      }
      ok(`gemma4 (${out.backend}) reranked ${reranked.length}/${candidates.length}`);
    } catch (e) {
      warn(`rerank failed (${e.message.slice(0, 60)}) — keeping unranked candidates`);
      for (const c of candidates.slice(0, MAX_LANE3_KEEP)) reranked.push({ ...c, _score: 0.5, _why: 'rerank-skipped' });
    }
  }
  reranked.sort((a, b) => (b._score ?? 0) - (a._score ?? 0));
  const top = reranked.slice(0, MAX_LANE3_KEEP);

  const meanScore = top.length > 0 ? top.reduce((s, c) => s + (c._score ?? 0), 0) / top.length : 0;
  const lowConfidence = meanScore < RERANK_CONFIDENCE_THRESHOLD;
  if (lowConfidence) {
    warn(`mean rerank score ${meanScore.toFixed(2)} < ${RERANK_CONFIDENCE_THRESHOLD} — KAG fallback would fire (skipped in v1)`);
    // Phase C v1: stub. Future: call kag.expand or web_search MCP tool here.
  }

  const out = { meanScore, lowConfidence, candidate_count: candidates.length, kept: top, duration_ms: Date.now() - t0 };
  await writeJson('lane3-rerank.json', out);
  ok(`saved → lane3-rerank.json (${Date.now() - t0}ms, kept ${top.length})`);
  return out;
}

// ── Lane 4 — Synthesis (single Gemma4 shot → markdown brief) ────────

async function lane4Synthesis(lane3) {
  lane(4, 'synthesis — Gemma4 produces markdown brief');
  const t0 = Date.now();

  const sys =
`You write implementation briefs for Claude Code. The brief is the ONLY context Claude Code will see for this task.

Output a complete markdown document with EXACTLY these H2 sections, in order, no preamble, no trailing prose:
## Goal
## Files (all paths verified to exist)
## Constraints
## MCP context used
## Implementation steps
## Smoke tests
## Do not touch

Rules:
- Cite ONLY file paths that appear in the input candidates list. Do not invent paths.
- "Implementation steps" must be concrete (max 7), each naming the file + symbol it edits.
- "Constraints" must include any SSR / runes-only / no-raw-infra rules that apply to the listed files.
- "Smoke tests" must be commands the operator can copy-paste.
- "Do not touch" lists byte-frozen files (scene-compiler.ts, aesthetic-presets.json, demo-scene.py) if relevant.
- Do not include "Goal Description" or "Background" — be terse.`;

  const candidatesBlock = (lane3.kept ?? []).map((c, i) =>
    `${i + 1}. ${c.stableKey ?? c.file_path ?? '?'} (score=${c._score ?? '?'})\n   why: ${c._why ?? '-'}\n   excerpt: ${(c.text ?? c.label ?? c.summary ?? '').slice(0, 240).replace(/\n/g, ' ')}`
  ).join('\n\n');

  const usr =
`Query: ${QUERY}

Top reranked candidates (use ONLY these — do not invent paths):
${candidatesBlock || '(no candidates retrieved — write a brief asking the operator to widen the query)'}

Write the brief now.`;

  if (DRY_RUN) {
    warn('dry-run — skipping Gemma4 synthesis call');
    const out = { dryRun: true, prompt_chars: sys.length + usr.length, duration_ms: Date.now() - t0 };
    await writeJson('lane4-synthesis.json', out);
    return out;
  }

  const result = await gemmaChat(
    [{ role: 'system', content: sys }, { role: 'user', content: usr }],
    { maxTokens: SYNTHESIS_MAX_TOKENS, temperature: 0.2, timeoutMs: 120_000 }
  );
  const brief = result.content;

  // Lightweight verification: check that brief mentions at least one cited path.
  const citedPaths = (lane3.kept ?? [])
    .map(c => (c.stableKey ?? c.file_path ?? '').replace(/^file:/, ''))
    .filter(Boolean);
  const verifiedPaths = citedPaths.filter(p => brief.includes(p));

  // Write final brief
  const briefPath = resolve(ROOT, 'memory', 'implementation-briefs', `${RUN_TS}_${SLUG}.md`);
  await mkdir(dirname(briefPath), { recursive: true });
  const header =
`<!-- generated by scripts/synth/run-loop.mjs run=${RUN_TS} backend=${result.backend} usage=${JSON.stringify(result.usage ?? {})} -->
<!-- DO NOT EDIT — re-run the loop to regenerate -->

`;
  await writeFile(briefPath, header + brief, 'utf8');

  const out = {
    briefPath,
    backend: result.backend,
    usage: result.usage,
    cited_paths: citedPaths,
    verified_paths: verifiedPaths,
    verification_pct: citedPaths.length > 0 ? Math.round(100 * verifiedPaths.length / citedPaths.length) : 0,
    duration_ms: Date.now() - t0,
  };
  await writeJson('lane4-synthesis.json', out);
  ok(`saved → ${briefPath} (${result.backend}, ${Date.now() - t0}ms, ${out.verification_pct}% paths verified)`);
  return out;
}

// ── Lane 5 — Handoff hint ───────────────────────────────────────────

function lane5Handoff(lane4) {
  if (lane4.dryRun) return;
  lane(5, 'handoff');
  log('');
  log(`  Brief written to: ${C.green}${lane4.briefPath}${C.reset}`);
  log(`  ${C.dim}To hand off to Claude Code:${C.reset}`);
  log(`    claude code --prompt-file "${lane4.briefPath}"`);
  log(`  ${C.dim}Or paste the brief contents into the Claude Code chat panel.${C.reset}`);
}

// ── pre-flight ──────────────────────────────────────────────────────

async function preflight() {
  // Probe TRACE MCP /health up front. If down, fail fast with a clear
  // operator-facing message rather than letting every Lane 1 tool call
  // fail mysteriously with "fetch failed".
  try {
    const r = await fetch(`${MCP_BASE}/health`, { signal: AbortSignal.timeout(2000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const body = await r.json();
    if (body?.ok !== true) throw new Error('health body.ok != true');
    dbg(`trace MCP healthy (uptime=${body.uptime?.toFixed?.(0) ?? '?'}s)`);
  } catch (e) {
    err(`trace MCP not reachable at ${MCP_BASE} (${e.message})`);
    err(`start it with:  cd sveltekit-frontend && npm run mcp:trace`);
    err(`(or:           node scripts/ensure-mcp-server.mjs --spawn)`);
    process.exit(3);
  }

  // Probe TurboQuant + Ollama for Lane 3/4. Don't fail — just warn so the
  // operator knows ahead of time whether synthesis will work.
  let turbo = false, ollama = false;
  try { turbo  = (await fetch(`${TURBO_BASE}/health`, { signal: AbortSignal.timeout(1500) })).ok; } catch {}
  try { ollama = (await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(1500) })).ok; } catch {}
  if (!turbo && !ollama && !DRY_RUN) {
    warn(`neither TurboQuant (${TURBO_BASE}) nor Ollama (${OLLAMA_BASE}) reachable — Lane 3/4 will fail`);
    warn(`run with --dry-run to skip synthesis, or start at least one backend`);
  } else if (!DRY_RUN) {
    dbg(`backends: turboquant=${turbo ? 'up' : 'down'}, ollama=${ollama ? 'up' : 'down'}`);
  }
}

// ── orchestrator ────────────────────────────────────────────────────

(async () => {
  log(`${C.dim}run=${RUN_TS} slug=${SLUG} dry-run=${DRY_RUN} resume=${RESUME ? 'yes' : 'no'}${C.reset}`);

  if (!RESUME) await preflight();

  let l1, l2, l3, l4;
  try {
    if (RESUME && await fileExists(resolve(RUN_DIR, 'lane1-retrieval.json'))) {
      log(`${C.dim}resuming from ${RUN_DIR}${C.reset}`);
      l1 = await readJson('lane1-retrieval.json');
      l2 = await readJson('lane2-graph.json');
    } else {
      l1 = await lane1Retrieval();
      l2 = await lane2Graph(l1);
    }
    l3 = await lane3Rerank(l1, l2);
    l4 = await lane4Synthesis(l3);
    lane5Handoff(l4);
  } catch (e) {
    err(`loop failed: ${e.message}`);
    if (VERBOSE) console.error(e.stack);
    process.exit(1);
  }
})();
