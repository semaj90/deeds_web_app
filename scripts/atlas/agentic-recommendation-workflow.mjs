#!/usr/bin/env node
/**
 * @file scripts/atlas/agentic-recommendation-workflow.mjs
 *
 * Parent Atlas Gate v2 — multi-stage identity-gated retrieval pipeline.
 *
 * Replaces the single checkParentAtlasRegistry() stub with a real 3-call
 * identity chain against the live TRACE MCP server, followed by hybrid
 * retrieval (BM25 + dense + graph) and bounded Gemma4 synthesis.
 *
 * Pipeline stages:
 *   L0  Intent classification
 *   L1  Local rg search
 *   L2  Canonical identity: atlas.source_refs → kag.feature_lookup → atlas.packet_search
 *   L3  Memory: engram.chat_memory_recent + kag.recall_similar_fix
 *   L4  Hybrid retrieval: kag.multi_lane_search + ace.compact_search + graph.expand_neighborhood
 *   L5  Rerank: turbovec.rank_chunks
 *   L6  Synthesis: Gemma4 (bounded by evidence — no identity invention)
 *   L7  Decision: patch_existing | merge_card | create_card | ask_permission
 *
 * Usage:
 *   node scripts/atlas/agentic-recommendation-workflow.mjs --query "fix atlas_higher_hop_index"
 *   node scripts/atlas/agentic-recommendation-workflow.mjs --source-ref "src/lib/server/ace/context-assembler.ts"
 *   node scripts/atlas/agentic-recommendation-workflow.mjs --dry-run --query "atlas tree nodes"
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../..');

const TRACE_MCP_URL = (process.env.TRACE_MCP_URL ?? 'http://127.0.0.1:8788').replace(/\/$/, '');
const TURBOQUANT_URL = (process.env.TURBOQUANT_BASE_URL ?? 'http://127.0.0.1:8090').replace(/\/$/, '');

function resolveLlamaServerModelId() {
  const explicit = String(process.env.LLAMA_MODEL ?? process.env.TURBOQUANT_MODEL ?? '').trim();
  if (explicit) return explicit;

  const modelPath = String(
    process.env.ROTORQUANT_MODEL_PATH ??
    process.env.TURBO_MODEL_PATH ??
    process.env.TURBOQUANT_MODEL_PATH ??
    '',
  ).trim();
  if (modelPath) {
    const base = path.basename(modelPath).trim();
    if (base) return base;
  }

  const gemma4 = String(process.env.GEMMA4_MODEL ?? '').trim();
  if (gemma4 && !/^gemma4-rotorquant(?::latest)?$/i.test(gemma4)) return gemma4;

  return 'gemma4-legal-iq4xs-direct.gguf';
}

const TURBOQUANT_MODEL = resolveLlamaServerModelId();

let VERBOSE = false;

function vlog(label, data) {
  if (!VERBOSE) return;
  console.log(`  [VERBOSE] ${label}:`, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
}

// ── TRACE MCP caller ──────────────────────────────────────────────────────────

async function callMcpTool(toolName, args = {}) {
  const res = await fetch(`${TRACE_MCP_URL}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: createHash('sha256').update(`${toolName}:${JSON.stringify(args)}`).digest('hex').slice(0, 8),
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    }),
    signal: AbortSignal.timeout(30_000),
  }).catch(err => { throw new Error(`MCP call ${toolName} failed: ${err.message}`); });

  if (!res.ok) throw new Error(`MCP ${toolName} returned HTTP ${res.status}`);

  const text = await res.text();
  let parsed = null;

  if (text.startsWith('data:') || text.includes('\ndata:')) {
    for (const line of text.split('\n')) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') break;
      try { parsed = JSON.parse(payload); break; } catch { /* next line */ }
    }
  } else {
    try { parsed = JSON.parse(text); } catch { /* non-JSON response */ }
  }

  if (!parsed) { vlog(`${toolName} raw (null parsed)`, text.slice(0, 500)); return null; }
  if (parsed.error) throw new Error(`MCP ${toolName} error: ${JSON.stringify(parsed.error)}`);

  const content = parsed?.result?.content;
  if (Array.isArray(content)) {
    const textBlock = content.find(c => c.type === 'text');
    if (textBlock?.text) {
      try {
        const decoded = JSON.parse(textBlock.text);
        vlog(`${toolName} response`, decoded);
        return decoded;
      } catch { return textBlock.text; }
    }
  }
  vlog(`${toolName} raw result`, parsed?.result);
  return parsed?.result ?? null;
}

// ── normalizeSourceRef ────────────────────────────────────────────────────────

export function normalizeSourceRef(sourceRef) {
  if (!sourceRef) return null;
  let s = String(sourceRef).trim();
  if (!s) return null;
  s = s.replace(/\\/g, '/');
  s = s.replace(/^file:\/\//i, '');
  s = s.replace(/^[a-zA-Z]:\//, '');
  while (s.startsWith('./') || s.startsWith('../')) {
    s = s.startsWith('./') ? s.slice(2) : s.slice(3);
  }
  s = s.replace(/^\/+/, '').replace(/\/+/g, '/').replace(/\/$/, '').toLowerCase();
  return s || null;
}

// ── L1: Local rg search ───────────────────────────────────────────────────────

function l1LocalSearch(query) {
  const result = spawnSync('rg', [query, 'src/', 'scripts/', '--type-add', 'mjs:*.mjs', '--type', 'ts', '--type', 'mjs', '-l', '--max-count', '1'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 10_000,
  });
  const files = (result.stdout ?? '').trim().split('\n').filter(Boolean).slice(0, 10);
  return files;
}

// ── L2: Canonical identity (3-call chain) ────────────────────────────────────

async function l2CanonicalIdentity(query, normalizedRef) {
  const identity = {
    source_ref: null,
    feature_id: null,
    feature_label: null,
    packet_key: null,
    identity_lane: 'unregistered',
    community_id: null,
    qdrant_point_id: null,
    tree_node_id: null,
  };

  // Call 1: atlas.source_refs — find by file path
  // Returns: { sourceRefs: string[], confidence: number, ... }
  try {
    const sourceRefArgs = { query: normalizedRef ?? query, limit: 3 };
    vlog('atlas.source_refs args', sourceRefArgs);
    const sourceRefs = await callMcpTool('atlas.source_refs', sourceRefArgs);
    vlog('atlas.source_refs raw', sourceRefs);
    // Response shape: { sourceRefs: string[] } or array of strings/objects
    const rawHits = sourceRefs?.sourceRefs ?? sourceRefs?.source_refs ?? sourceRefs?.results ?? (Array.isArray(sourceRefs) ? sourceRefs : []);
    const hits = rawHits.filter(h => h && typeof h === 'string' ? !h.includes('\\') && !h.includes('user.activity') : h?.source_ref);
    if (hits.length > 0) {
      const first = hits[0];
      identity.source_ref = typeof first === 'string' ? first : (first?.source_ref ?? first?.sourceRef ?? null);
    }
    vlog('atlas.source_refs resolved', { hits: hits.length, source_ref: identity.source_ref });
  } catch (e) {
    console.warn(`  [L2] atlas.source_refs: ${e.message}`);
  }

  // Call 2: kag.feature_lookup — find feature_id + feature_label
  // Schema: { featureName: string } → { ok: bool, results: [{feature_id, feature_label, ...}] }
  try {
    const lookupName = identity.source_ref ?? normalizedRef ?? query;
    vlog('kag.feature_lookup args', { featureName: lookupName });
    const featureRes = await callMcpTool('kag.feature_lookup', { featureName: lookupName });
    vlog('kag.feature_lookup raw', featureRes);
    const results = featureRes?.results ?? featureRes?.features ?? (Array.isArray(featureRes) ? featureRes : []);
    const f = results[0] ?? null;
    if (f?.feature_id) {
      identity.feature_id = f.feature_id;
      identity.feature_label = f.feature_label ?? f.label ?? null;
    }
    vlog('kag.feature_lookup resolved', { feature_id: identity.feature_id, feature_label: identity.feature_label });
  } catch (e) {
    console.warn(`  [L2] kag.feature_lookup: ${e.message}`);
  }

  // Call 3: atlas.packet_search — confirm full identity
  // Schema: { source_ref?: string, feature_id?: string, limit?: number }
  // Note: may return { ok: false, error: ... } if DB schema has drift — handle gracefully
  const searchRef = identity.source_ref ?? normalizedRef ?? query;
  try {
    const packetArgs = { source_ref: searchRef, limit: 3 };
    vlog('atlas.packet_search args', packetArgs);
    const packets = await callMcpTool('atlas.packet_search', packetArgs);
    vlog('atlas.packet_search raw', packets);
    const hits = Array.isArray(packets) ? packets : packets?.packets ?? packets?.results ?? packets?.hits ?? [];
    if (hits.length > 0 && !packets?.error) {
      const p = hits[0];
      identity.source_ref     = p.source_ref     ?? identity.source_ref;
      identity.feature_id     = p.feature_id     ?? identity.feature_id;
      identity.feature_label  = p.feature_label  ?? identity.feature_label;
      identity.packet_key     = p.packet_key      ?? p.id ?? null;
      identity.identity_lane  = p.identity_lane   ?? 'qdrant_chunk';
      identity.community_id   = p.community_id    ?? null;
      identity.qdrant_point_id = p.qdrant_point_id ?? null;
      identity.tree_node_id   = p.tree_node_id    ?? null;
    }
    vlog('atlas.packet_search resolved', { hits: hits.length, packet_key: identity.packet_key, error: packets?.error });
  } catch (e) {
    console.warn(`  [L2] atlas.packet_search: ${e.message}`);
  }

  return identity;
}

// ── L3: Memory lookup ─────────────────────────────────────────────────────────

async function l3MemoryLookup(featureId, query) {
  const results = { prior_fix: null, similar_fix: null };

  try {
    const mem = await callMcpTool('engram.chat_memory_recent', { query: `feature_id:${featureId ?? query}`, limit: 3 });
    const hits = Array.isArray(mem) ? mem : mem?.results ?? [];
    const successHit = hits.find(h => h?.status === 'success');
    if (successHit) results.prior_fix = successHit;
  } catch (e) {
    console.warn(`  [L3] engram.chat_memory_recent: ${e.message}`);
  }

  try {
    const similar = await callMcpTool('kag.recall_similar_fix', { query, limit: 1 });
    results.similar_fix = Array.isArray(similar) ? similar[0] : similar?.results?.[0] ?? null;
  } catch (e) {
    console.warn(`  [L3] kag.recall_similar_fix: ${e.message}`);
  }

  return results;
}

// ── L4: Hybrid retrieval ──────────────────────────────────────────────────────

async function l4HybridRetrieval(query, identity) {
  const evidence = { bm25_hits: [], dense_hits: [], graph_hits: [], qdrant_hits: 0, graph_hit_count: 0, cache_hits: 0 };

  // BM25 / pg_trgm / JSONB
  try {
    const bm25 = await callMcpTool('kag.multi_lane_search', { query, lanes: ['bm25', 'pg_trgm'], limit: 5 });
    evidence.bm25_hits = Array.isArray(bm25) ? bm25 : bm25?.results ?? [];
  } catch (e) {
    console.warn(`  [L4] kag.multi_lane_search: ${e.message}`);
  }

  // Dense ANN via ace.compact_search
  try {
    const denseArgs = { query, limit: 5 };
    if (identity.community_id) denseArgs.community_id = identity.community_id;
    const dense = await callMcpTool('ace.compact_search', denseArgs);
    const hits = Array.isArray(dense) ? dense : dense?.results ?? [];
    evidence.dense_hits = hits;
    evidence.qdrant_hits = hits.length;
  } catch (e) {
    console.warn(`  [L4] ace.compact_search: ${e.message}`);
  }

  // Neo4j graph expansion
  if (identity.packet_key) {
    try {
      const graph = await callMcpTool('graph.expand_neighborhood', { packet_key: identity.packet_key, depth: 2, limit: 10 });
      const hits = Array.isArray(graph) ? graph : graph?.neighbors ?? graph?.nodes ?? [];
      evidence.graph_hits = hits;
      evidence.graph_hit_count = hits.length;
    } catch (e) {
      console.warn(`  [L4] graph.expand_neighborhood: ${e.message}`);
    }
  }

  return evidence;
}

// ── L5: Rerank ────────────────────────────────────────────────────────────────

async function l5Rerank(query, evidence) {
  const allChunks = [
    ...evidence.bm25_hits.map(h => ({ ...h, lane: 'bm25' })),
    ...evidence.dense_hits.map(h => ({ ...h, lane: 'dense' })),
    ...evidence.graph_hits.map(h => ({ ...h, lane: 'graph' })),
  ].filter(h => h.packet_key || h.source_ref || h.content);

  if (allChunks.length === 0) return { ranked: [], top_score: 0 };

  try {
    const ranked = await callMcpTool('turbovec.rank_chunks', { query, chunks: allChunks.slice(0, 20), limit: 10 });
    const hits = Array.isArray(ranked) ? ranked : ranked?.results ?? allChunks;
    return { ranked: hits, top_score: hits[0]?.score ?? hits[0]?.rerank_score ?? 0 };
  } catch (e) {
    console.warn(`  [L5] turbovec.rank_chunks: ${e.message}`);
    return { ranked: allChunks.slice(0, 10), top_score: 0 };
  }
}

// ── L6: Gemma4 synthesis (bounded) ───────────────────────────────────────────

async function l6Synthesis(query, identity, ranked, memory) {
  const summaries = ranked.slice(0, 5)
    .map(h => h.summary ?? h.content ?? '')
    .filter(Boolean)
    .join('\n\n');

  const priorFix = memory.prior_fix
    ? `Prior solution: ${memory.prior_fix.solution ?? 'see Engram record'}`
    : '';

  const prompt = [
    'You are a code-analysis assistant. Respond with a JSON object only. No markdown fences.',
    '',
    'Evidence from the codebase retrieval system:',
    summaries || '(no retrieved summaries)',
    priorFix,
    '',
    `User query: ${query}`,
    `Source ref: ${identity.source_ref ?? 'unknown'}`,
    `Feature: ${identity.feature_id ?? 'unknown'} — ${identity.feature_label ?? ''}`,
    '',
    'Return ONLY this JSON (no explanation, no identity fields):',
    '{"summary":"2-3 sentences describing what this code does","risk":"what could break if patched","rationale":"why this file is the right target","priority":"high|medium|low"}',
  ].join('\n');

  try {
    const res = await fetch(`${TURBOQUANT_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: TURBOQUANT_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 256,
        temperature: 0.1,
        stream: true,
      }),
      signal: AbortSignal.timeout(90_000),
    });

    let assembled = '';
    const decoder = new TextDecoder();
    let buf = '';
    for await (const chunk of res.body) {
      buf += decoder.decode(chunk, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const p = line.slice(5).trim();
        if (p === '[DONE]') break;
        try {
          const d = JSON.parse(p);
          assembled += d.choices?.[0]?.delta?.content ?? '';
        } catch { /* skip */ }
      }
    }

    // Strip thinking blocks if present (use [\s\S] instead of (?s) — JS regex has no s flag in older runtimes)
    assembled = assembled.replace(/<\|channel>thought[\s\S]*?<\|channel>response\s*/g, '');
    assembled = assembled.replace(/<think>[\s\S]*?<\/think>\s*/g, '');

    // Extract JSON
    const jsonMatch = assembled.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.warn(`  [L6] Gemma4 synthesis: ${e.message}`);
  }

  return { summary: '(synthesis unavailable)', risk: 'unknown', rationale: '(no evidence synthesized)', priority: 'medium' };
}

// ── L7: Decision ─────────────────────────────────────────────────────────────

function l7Decision(identity, rerankResult, gemma4, memory) {
  if (!identity.packet_key) return 'ask_permission';
  if (gemma4.risk === 'high') return 'ask_permission';
  if (rerankResult.top_score < 0.4) return 'ask_permission';
  if (memory.prior_fix) return 'merge_card';
  if (rerankResult.top_score >= 0.65) return 'patch_existing';
  return 'create_card';
}

// ── Main export: checkParentAtlasRegistry (v2) ────────────────────────────────

/**
 * v2: Full multi-stage Parent Atlas Gate.
 * Replaces the old single-call stub with the 11-stage pipeline.
 *
 * @param {string} proposedSourceRef - file path or query string
 * @returns {Promise<Recommendation>}
 */
export async function checkParentAtlasRegistry(proposedSourceRef) {
  return runRecommendationWorkflow(proposedSourceRef, [proposedSourceRef]);
}

/**
 * Full pipeline entry point.
 * @param {string} userQuery
 * @param {string[]} initialSourceRefs
 */
export async function runRecommendationWorkflow(userQuery, initialSourceRefs = []) {
  console.log(`\n[GATE v2] Query: "${userQuery}"`);

  const normalized = normalizeSourceRef(initialSourceRefs[0] ?? userQuery);

  // L1 — Local search
  process.stdout.write('  [L1] Local rg search... ');
  const rgMatches = l1LocalSearch(userQuery);
  console.log(`${rgMatches.length} files`);

  // L2 — Canonical identity
  process.stdout.write('  [L2] Canonical identity (3 MCP calls)... ');
  const identity = await l2CanonicalIdentity(userQuery, normalized);
  console.log(identity.packet_key ? `FOUND: ${identity.packet_key}` : 'MISS (unregistered)');

  // L3 — Memory
  process.stdout.write('  [L3] Memory lookup... ');
  const memory = await l3MemoryLookup(identity.feature_id, userQuery);
  console.log(memory.prior_fix ? 'prior fix found' : 'no prior fix');

  // L4 — Hybrid retrieval
  process.stdout.write('  [L4] Hybrid retrieval (BM25 + dense + graph)... ');
  const l4Evidence = await l4HybridRetrieval(userQuery, identity);
  console.log(`bm25:${l4Evidence.bm25_hits.length} dense:${l4Evidence.qdrant_hits} graph:${l4Evidence.graph_hit_count}`);

  // L5 — Rerank
  process.stdout.write('  [L5] Reranking... ');
  const rerankResult = await l5Rerank(userQuery, l4Evidence);
  console.log(`top_score: ${rerankResult.top_score.toFixed(3)}, ${rerankResult.ranked.length} hits`);

  // L6 — Synthesis
  process.stdout.write('  [L6] Gemma4 synthesis (bounded)... ');
  const gemma4 = await l6Synthesis(userQuery, identity, rerankResult.ranked, memory);
  console.log(`priority: ${gemma4.priority}`);

  // L7 — Decision
  const decision = l7Decision(identity, rerankResult, gemma4, memory);
  console.log(`  [L7] Decision: ${decision}`);

  const recommendation = {
    source_id: createHash('sha256').update(userQuery).digest('hex').slice(0, 12),
    source_ref: identity.source_ref ?? normalized,
    normalized_source_ref: normalized,
    feature_id: identity.feature_id,
    feature_label: identity.feature_label,
    packet_key: identity.packet_key,
    identity_lane: identity.identity_lane,
    community_id: identity.community_id,
    tree_node_id: identity.tree_node_id,
    qdrant_point_id: identity.qdrant_point_id,
    kanban_card_id: null,
    decision,
    permission_level: decision === 'patch_existing' ? 'patch_allowed' : 'read_only',
    target_files: rgMatches.slice(0, 5),
    evidence: {
      rg_matches: rgMatches,
      ast_matches: [],
      qdrant_hits: l4Evidence.qdrant_hits,
      graph_hits: l4Evidence.graph_hit_count,
      cache_hits: l4Evidence.cache_hits,
      rerank_score: rerankResult.top_score,
    },
    gemma4,
    validation_commands: [
      `node --check ${rgMatches[0] ?? '<target_file>'}`,
      'npm run atlas:lineage:verify',
    ],
    supersedes: [],
    merged_from: [],
    do_not_do: [],
  };

  return recommendation;
}

// ── generateGatedRecommendation (compat wrapper) ──────────────────────────────

export async function generateGatedRecommendation(userQuery, initialSourceRefs) {
  const rec = await runRecommendationWorkflow(userQuery, initialSourceRefs);
  const isCanonical = !!rec.packet_key;
  return {
    status: isCanonical ? 'READY_TO_PROPOSE' : 'PENDING_APPROVAL',
    message: isCanonical
      ? `Ready — found canonical identity: ${rec.packet_key}`
      : 'No existing canonical identity found. Set decision to ask_permission.',
    sourceRefs: initialSourceRefs,
    canonicalId: rec.feature_id,
    recommendation: rec,
  };
}

// ── CLI entrypoint ────────────────────────────────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--verbose') || args.includes('-v')) VERBOSE = true;
  const queryIdx = args.indexOf('--query');
  const sourceIdx = args.indexOf('--source-ref');
  const query = queryIdx >= 0 ? args[queryIdx + 1] : (sourceIdx >= 0 ? args[sourceIdx + 1] : args[0] ?? 'atlas identity spine');

  runRecommendationWorkflow(query, [query])
    .then(rec => {
      console.log('\n' + JSON.stringify(rec, null, 2));
    })
    .catch(err => {
      console.error('Fatal:', err.message);
      process.exit(1);
    });
}
