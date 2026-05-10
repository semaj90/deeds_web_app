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

// ── Prior-fix recall helper (kag.recall_similar_fix) ────────────────
// Defensive: NEVER throws. Always returns a stable shape so Lane 1 can
// embed the result in its artifact and Lane 4 can read it without guards.
// The MCP tool's actual response shape (verified in trace-mcp-server.ts):
//   { exactMatch, similarMatches[], recallCount, hasPriorFix }
// Each match has { priorFix?: string, errorHash, ... }.
async function recallSimilarFix(toolName, errorMessage) {
  const fallback = { hasPriorFix: false, recallCount: 0, topFix: null, source: 'kag.recall_similar_fix' };
  try {
    const errText = `[${toolName}] ${String(errorMessage ?? '')}`.slice(0, 4000);
    const r = await callTool('kag.recall_similar_fix', { errorText: errText, limit: 3 }, { timeoutMs: 8000 });
    if (!r || typeof r !== 'object') return fallback;
    // mcpCall already unwrapped content[0].text → parsed JSON object.
    if (r._raw) return fallback; // unparseable response
    const exact = r.exactMatch ?? null;
    const similar = Array.isArray(r.similarMatches) ? r.similarMatches : [];
    const topFix = exact?.priorFix
      ?? similar.find(s => s?.priorFix)?.priorFix
      ?? null;
    return {
      hasPriorFix: Boolean(r.hasPriorFix) || Boolean(topFix),
      recallCount: typeof r.recallCount === 'number' ? r.recallCount : ((exact ? 1 : 0) + similar.length),
      topFix,
      source: 'kag.recall_similar_fix',
    };
  } catch (err) {
    return { ...fallback, error: err?.message?.slice(0, 200) ?? String(err) };
  }
}

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
  // Lane 1 tool calls. Tool names must match what TRACE MCP actually
  // registers (see `curl http://127.0.0.1:8788/mcp tools/list`). Required
  // args verified against inputSchema in src/mcp/trace-mcp-server.ts:
  //   - trace.kag_search           : { query, limit }
  //   - kag.multi_lane_search      : { query, isError?, topK? }   ← swapped from graph.pagerank_top (not registered)
  //                                  and clusters.get_summary_lenses (requires clusterId we don't have)
  //   - context.build_kv_packet    : { taskId, query, hotFiles?, hotSymbols? }
  //                                  taskId IS required (was previously missing → -32602)
  // STAGE 1: Parallel retrieval dispatch. Each tool has internal timeout.
  const retrievalTools = [
    { name: 'trace.kag_search',         args: { query: QUERY, limit: MAX_LANE1_HITS } },
    { name: 'kag.multi_lane_search',    args: { query: QUERY, topK: 8 } },
    { name: 'trace.graphrag_search',    args: { query: QUERY, denseTopK: 30, sparseTopK: 30, finalTopK: MAX_LANE1_HITS, graphDepth: 1 } },
    { name: 'kb.search_summary_tree',   args: { query: QUERY, clusterTopK: 5, dirTopK: 5, lensTopK: 5 } },
  ];

  const results = {};
  const retrievalSettled = await Promise.allSettled(
    retrievalTools.map(async (t) => ({ name: t.name, value: await callTool(t.name, t.args) })),
  );

  for (let i = 0; i < retrievalSettled.length; i += 1) {
    const s = retrievalSettled[i];
    const name = retrievalTools[i].name;
    const isThrownFailure = s.status === 'rejected';
    const looksLikeRawError = s.status === 'fulfilled' && s.value?.value && typeof s.value.value === 'object' && typeof s.value.value._raw === 'string' && /^MCP error|not found|isError\b/i.test(s.value.value._raw);
    if (!isThrownFailure && !looksLikeRawError) {
      results[name] = s.value.value;
      const sz = typeof s.value.value === 'object' ? JSON.stringify(s.value.value).length : String(s.value.value).length;
      ok(`${name} → ${sz} bytes`);
    } else {
      const errMsg = isThrownFailure ? (s.reason?.message ?? String(s.reason)) : s.value.value._raw;
      const similarFix = await recallSimilarFix(name, errMsg);
      results[name] = { tool: name, ok: false, error: errMsg, similarFix };
      const tag = similarFix.hasPriorFix ? ` [prior fix: yes, ${similarFix.recallCount}]` : '';
      warn(`${name} failed: ${errMsg.slice(0, 80)}${tag}`);
    }
  }

  // STAGE 2: Extract hot context from retrieval and call context.build_kv_packet.
  // This ensures the TOC/cards are grounded in actual hits from multi-lane/graph search.
  const hotFilesSet = new Set();
  const hotSymbolsSet = new Set();

  if (results['kag.multi_lane_search']?.topFiles) {
    results['kag.multi_lane_search'].topFiles.forEach(f => hotFilesSet.add(f));
  }
  if (results['kag.multi_lane_search']?.topSymbols) {
    results['kag.multi_lane_search'].topSymbols.forEach(s => hotSymbolsSet.add(s));
  }
  if (results['trace.graphrag_search']?.finalHits) {
    results['trace.graphrag_search'].finalHits.forEach(h => {
      if (h.filePath) hotFilesSet.add(h.filePath);
      else if (h.stableKey?.startsWith('file:')) hotFilesSet.add(h.stableKey.replace('file:', ''));
    });
  }

  const hotFiles = Array.from(hotFilesSet).slice(0, 8);
  const hotSymbols = Array.from(hotSymbolsSet).slice(0, 12);

  const kvpArgs = { taskId: `synth-${SLUG}-${RUN_TS}`, query: QUERY, hotFiles, hotSymbols, blockedAreas: [] };
  const kvpRes = await callTool('context.build_kv_packet', kvpArgs).catch(err => ({ ok: false, error: String(err) }));

  if (kvpRes && !(typeof kvpRes === 'object' && '_raw' in kvpRes)) {
    results['context.build_kv_packet'] = kvpRes;
    ok(`context.build_kv_packet → ${JSON.stringify(kvpRes).length} bytes (${hotFiles.length} files, ${hotSymbols.length} syms)`);
  } else {
    const errMsg = (typeof kvpRes === 'object' && '_raw' in kvpRes) ? kvpRes._raw : String(kvpRes);
    const similarFix = await recallSimilarFix('context.build_kv_packet', errMsg);
    results['context.build_kv_packet'] = { tool: 'context.build_kv_packet', ok: false, error: errMsg, similarFix };
    warn(`context.build_kv_packet failed: ${errMsg}`);
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
  // Pull candidate stableKeys from Lane 1's KAG hits + multi-lane top files.
  // graph.expand_neighborhood matches Neo4j on bare stableKey/path — no `file:` prefix.
  const candidates = new Set();
  const kag = lane1.results['trace.kag_search'];
  const kagHits = Array.isArray(kag?.hits) ? kag.hits : Array.isArray(kag) ? kag : [];
  for (const h of kagHits.slice(0, 5)) {
    const key = h?.stableKey ?? h?.file_path ?? h?.path;
    if (key) candidates.add(key);
  }
  // kag.multi_lane_search returns { lanes, merged, topFiles, topSymbols, ... }
  const mls = lane1.results['kag.multi_lane_search'];
  const topFiles = Array.isArray(mls?.topFiles) ? mls.topFiles
    : Array.isArray(mls?.merged) ? mls.merged : [];
  for (const f of topFiles.slice(0, 3)) {
    const key = (typeof f === 'string') ? f
      : (f?.stableKey ?? f?.file_path ?? f?.path ?? f?.file);
    if (key) candidates.add(key);
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

// ── Lane 3 helpers — rerank + agentic fallback ──────────────────────

/**
 * Re-rank a candidate list with a Gemma4 precision pass. Returns a NEW array
 * (does not mutate input). Skipped candidates are dropped, not assigned 0.5.
 * Used by Lane 3 inline + by the agentic fallback after it adds candidates.
 */
async function rerankCandidates(candidates) {
  const reranked = [];
  if (candidates.length === 0) return reranked;
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
  } catch (e) {
    // Caller decides how to handle — return what we have (possibly empty).
    reranked._error = e.message.slice(0, 60);
  }
  return reranked;
}

/**
 * Agentic KAG/DAG/GraphRAG fallback. Fires 3 MCP calls in parallel against
 * complementary datastores: PageRank-top from Neo4j, multi-lane KAG search,
 * and Qdrant semantic via kb.trace_search with the natural-language query.
 * Each result is normalized into the same { stableKey/file_path, text } shape
 * Lane 3 already understands and handed back via the `add()` dedup helper.
 *
 * Concurrent (Promise.all), bounded (MAX_FALLBACK_PER_TOOL each), tolerant
 * (per-tool failure → skip, don't abort the whole fallback).
 */
const MAX_FALLBACK_PER_TOOL = 8;
async function runAgenticFallback({ existingCandidates, lane1, lane2, add }) {
  const before = existingCandidates.length;
  const calls = [
    callTool('graph.pagerank_top', { limit: MAX_FALLBACK_PER_TOOL }, { timeoutMs: 12_000 })
      .then(r => ({ source: 'graph.pagerank_top', items: Array.isArray(r) ? r : (Array.isArray(r?.results) ? r.results : []) }))
      .catch(e => ({ source: 'graph.pagerank_top', items: [], error: e.message.slice(0, 80) })),
    callTool('kag.multi_lane_search', { query: QUERY, limit: MAX_FALLBACK_PER_TOOL }, { timeoutMs: 15_000 })
      .then(r => ({ source: 'kag.multi_lane_search', items: Array.isArray(r?.hits) ? r.hits : (Array.isArray(r) ? r : []) }))
      .catch(e => ({ source: 'kag.multi_lane_search', items: [], error: e.message.slice(0, 80) })),
    callTool('kb.trace_search', { query: QUERY, limit: MAX_FALLBACK_PER_TOOL }, { timeoutMs: 15_000 })
      .then(r => ({ source: 'kb.trace_search', items: Array.isArray(r?.hits) ? r.hits : (Array.isArray(r) ? r : []) }))
      .catch(e => ({ source: 'kb.trace_search', items: [], error: e.message.slice(0, 80) })),
  ];
  const results = await Promise.all(calls);
  const sources = {};
  for (const { source, items, error } of results) {
    sources[source] = { count: items.length, error: error ?? null };
    for (const item of items) add({ ...item, _from_fallback: source });
  }
  const added = existingCandidates.length - before;
  return { added, sources };
}

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
  // GraphRAG hits: composite-scored finalHits[] from trace.graphrag_search.
  // These come pre-ranked with scoreBreakdown (dense/sparse/graph/pagerank/karpathy)
  // and why[] reasons — the highest-quality candidate source for Lane 3.
  const grag = lane1.results['trace.graphrag_search'];
  for (const h of (Array.isArray(grag?.finalHits) ? grag.finalHits : []).slice(0, 12)) {
    add({
      stableKey:        h.stableKey,
      file_path:        h.filePath,
      _graphrag_score:  h.score,
      _graphrag_why:    h.why,
      _from_graphrag:   true,
    });
  }
  // RAPTOR cluster narratives: high-abstraction summaries that give Gemma4
  // dense conceptual context per token. Each narrative becomes a candidate
  // with text=summary so the reranker can judge conceptual relevance.
  const stree = lane1.results['kb.search_summary_tree'];
  for (const c of (Array.isArray(stree?.cluster_narratives) ? stree.cluster_narratives : []).slice(0, 5)) {
    add({
      stableKey:    `cluster:${c.clusterId}`,
      label:        c.purpose ?? `cluster ${c.clusterId}`,
      text:         c.summary,
      _summary_score: c.score,
      _from_summary_tree: 'cluster',
    });
  }
  for (const d of (Array.isArray(stree?.directory_cards) ? stree.directory_cards : []).slice(0, 3)) {
    add({
      stableKey:    `dir:${d.dirPath}`,
      file_path:    d.dirPath,
      text:         d.preview,
      _summary_score: d.score,
      _from_summary_tree: 'directory',
    });
  }
  for (const [center, exp] of Object.entries(lane2.neighbors)) {
    const arr = Array.isArray(exp?.neighbors) ? exp.neighbors : [];
    for (const n of arr.slice(0, 5)) add({ ...n, _from_neighbor_of: center });
  }

  // Gemma4 reranker (uses shared helper so the agentic fallback can rerun it).
  const reranked = await rerankCandidates(candidates);
  if (reranked._error) {
    warn(`rerank failed (${reranked._error}) — keeping unranked candidates`);
    for (const c of candidates.slice(0, MAX_LANE3_KEEP)) reranked.push({ ...c, _score: 0.5, _why: 'rerank-skipped' });
  } else if (candidates.length > 0) {
    ok(`gemma4 reranked ${reranked.length}/${candidates.length}`);
  }
  reranked.sort((a, b) => (b._score ?? 0) - (a._score ?? 0));
  const top = reranked.slice(0, MAX_LANE3_KEEP);

  let meanScore = top.length > 0 ? top.reduce((s, c) => s + (c._score ?? 0), 0) / top.length : 0;
  let lowConfidence = meanScore < RERANK_CONFIDENCE_THRESHOLD;
  let fallback = null;

  if (lowConfidence) {
    warn(`mean rerank score ${meanScore.toFixed(2)} < ${RERANK_CONFIDENCE_THRESHOLD} — firing agentic KAG/DAG/GraphRAG fallback`);
    fallback = await runAgenticFallback({ existingCandidates: candidates, lane1, lane2, add });
    // Re-rerank on the augmented candidate set if we got new evidence.
    if (fallback.added > 0) {
      const beforeCount = top.length;
      const reranked2 = await rerankCandidates(candidates);
      reranked2.sort((a, b) => (b._score ?? 0) - (a._score ?? 0));
      const top2 = reranked2.slice(0, MAX_LANE3_KEEP);
      const meanScore2 = top2.length > 0 ? top2.reduce((s, c) => s + (c._score ?? 0), 0) / top2.length : 0;
      ok(`fallback added ${fallback.added} candidates (${beforeCount} → ${top2.length} kept, mean score ${meanScore.toFixed(2)} → ${meanScore2.toFixed(2)})`);
      top.length = 0;
      for (const c of top2) top.push(c);
      meanScore = meanScore2;
      lowConfidence = meanScore < RERANK_CONFIDENCE_THRESHOLD;
    } else {
      warn(`fallback returned 0 new candidates — Lane 4 will see "evidence-thin" brief`);
    }
  }

  const out = { meanScore, lowConfidence, fallback, candidate_count: candidates.length, kept: top, duration_ms: Date.now() - t0 };
  await writeJson('lane3-rerank.json', out);
  ok(`saved → lane3-rerank.json (${Date.now() - t0}ms, kept ${top.length})`);
  return out;
}

// ── Lane 4 — Synthesis (single Gemma4 shot → markdown brief) ────────

async function lane4Synthesis(lane3, lane1) {
  lane(4, 'synthesis — Gemma4 produces markdown brief');
  const t0 = Date.now();

  // Collect prior-fix hits from Lane 1 failures (if any).
  const failedTools = Object.entries(lane1?.results ?? {})
    .filter(([, v]) => v && v.ok === false);
  const hasFailures = failedTools.length > 0;

  const priorFixes = failedTools.map(([tool, v]) => ({
    tool,
    fix: v.similarFix?.topFix ?? null,
    recallCount: v.similarFix?.recallCount ?? 0,
    hasPriorFix: Boolean(v.similarFix?.hasPriorFix)
  }));

  const baseSections = [
    '## Goal',
    '## Files (all paths verified to exist)',
    '## Constraints',
    '## MCP context used',
    '## Implementation steps',
    '## Smoke tests',
    '## Do not touch',
  ];
  // Insert "## Similar Prior Fixes" before "## Do not touch" only when present.
  const sectionList = hasFailures
    ? [...baseSections.slice(0, -1), '## Similar Prior Fixes', '## Do not touch']
    : baseSections;

  const priorFixRule = hasFailures
    ? `\n- "Similar Prior Fixes" must list each MCP failure as a sub-heading "### MCP failure: \`<tool>\`". If a fix exists, quote it as a blockquote. If no fix exists, output "No similar prior fix found." End the section with: "Use this as context only. Verify against current code before editing."`
    : '';

  const sys =
`You write implementation briefs for Claude Code. The brief is the ONLY context Claude Code will see for this task.

Output a complete markdown document with EXACTLY these H2 sections, in order, no preamble, no trailing prose:
${sectionList.join('\n')}

Rules:
- Cite ONLY file paths that appear in the input candidates list. Do not invent paths.
- "Implementation steps" must be concrete (max 7), each naming the file + symbol it edits.
- "Constraints" must include any SSR / runes-only / no-raw-infra rules that apply to the listed files.
- "Smoke tests" must be commands the operator can copy-paste.
- "Do not touch" lists byte-frozen files (scene-compiler.ts, aesthetic-presets.json, demo-scene.py) if relevant.${priorFixRule}
- Do not include "Goal Description" or "Background" — be terse.`;

  // Split candidates by type so Gemma4 doesn't list cluster:N or dir:X
  // under "## Files (all paths verified to exist)" — those are conceptual
  // context, not edit targets. File-level candidates go into the file pool;
  // cluster-narrative + directory-card candidates go into a separate
  // "Conceptual context" channel that informs the brief but isn't quoted as
  // a path.
  const fileCands = (lane3.kept ?? []).filter(c => !c._from_summary_tree);
  const conceptCands = (lane3.kept ?? []).filter(c => c._from_summary_tree);

  const candidatesBlock = fileCands.map((c, i) =>
    `${i + 1}. ${c.stableKey ?? c.file_path ?? '?'} (score=${c._score ?? '?'})\n   why: ${c._why ?? '-'}\n   excerpt: ${(c.text ?? c.label ?? c.summary ?? '').slice(0, 240).replace(/\n/g, ' ')}`
  ).join('\n\n');

  const conceptBlock = conceptCands.length > 0
    ? '\n\nConceptual context (RAPTOR cluster/directory summaries — DO NOT list under "## Files", DO NOT cite as paths; use to understand the domain only):\n' +
      conceptCands.map((c, i) =>
        `${i + 1}. [${c._from_summary_tree}] ${c.label ?? c.file_path ?? c.stableKey} (score=${c._score ?? '?'})\n   ${(c.text ?? '').slice(0, 280).replace(/\n/g, ' ')}`
      ).join('\n\n')
    : '';

  const priorFixBlock = hasFailures
    ? '\n\nSimilar prior fixes (context only — verify before applying):\n' +
      priorFixes.map(p => `- [${p.tool}] (hasPriorFix=${p.hasPriorFix}, recallCount=${p.recallCount}) ${p.fix ? String(p.fix).slice(0, 400).replace(/\n/g, ' ') : 'No similar prior fix found.'}`).join('\n')
    : '';

  const usr =
`Query: ${QUERY}

Top reranked file candidates (use ONLY these for "## Files" + implementation steps; do not invent paths):
${candidatesBlock || '(no file-level candidates — fall back to conceptual context below; brief should request operator widen the query)'}${conceptBlock}${priorFixBlock}

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
    l4 = await lane4Synthesis(l3, l1);
    lane5Handoff(l4);
  } catch (e) {
    err(`loop failed: ${e.message}`);
    if (VERBOSE) console.error(e.stack);
    process.exit(1);
  }
})();
