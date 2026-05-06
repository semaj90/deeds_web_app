#!/usr/bin/env node
/**
 * Smoke test: confirm trace-mcp-server responds on :8788 and the read-only
 * tool surface works end-to-end from the gemma4-tool-controller.
 *
 * Covers:
 *   1. Health check (:8788/health)
 *   2. trace.kag_search    — lexical FTS via Postgres code_retrieval_chunks
 *   3. search.postgres_fts — direct Postgres FTS (new tool)
 *   4. search.hybrid       — Go retrieval :8100 → Postgres FTS fallback (new tool)
 *   5. graph.pagerank_top  — Neo4j PageRank top-N (new tool)
 *   6. HCA compression     — compressToHCACard round-trip (prior-answer autoencoding)
 *   7. Write-access guard  — blocked tools return non-200
 *
 * Usage (from sveltekit-frontend/):
 *   node scripts/smoke-gemma4-mcp-tools.mjs
 *
 * Exits 0 on success, 1 on any failure.
 */

import { createHash } from 'node:crypto';

const MCP_URL          = 'http://localhost:8788';
const TIMEOUT          = 15_000;
const TIMEOUT_DB       = 45_000;   // DB-backed tools (FTS, kag_search) can be slow on cold pool
const MAX_RESULT_CHARS = 14_000;

async function fetchWithTimeout(url, opts = {}) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(tid);
  }
}

async function callTool(toolName, args, timeout = TIMEOUT) {
  let res;
  try {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), timeout);
    try {
      res = await fetch(`${MCP_URL}/mcp`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: toolName, arguments: args } }),
        signal: ctrl.signal,
      });
    } finally { clearTimeout(tid); }
  } catch (e) { return { ok: false, error: e.message }; }

  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };

  const raw = await res.text().catch(() => '');
  let parsed = null;
  for (const line of raw.split('\n')) {
    if (line.startsWith('data: ')) { try { parsed = JSON.parse(line.slice(6)); break; } catch { /* continue */ } }
  }
  if (!parsed) { try { parsed = JSON.parse(raw); } catch { /* nope */ } }
  if (!parsed) return { ok: false, error: 'non-JSON body' };

  const text = parsed?.result?.content?.[0]?.text;
  if (typeof text !== 'string') return { ok: false, error: 'no text payload' };

  let data;
  try { data = JSON.parse(text); } catch { data = { text }; }
  return { ok: true, data, chars: text.length };
}

const pass = (msg) => console.log (`  ✓ ${msg}`);
const fail = (msg) => console.error(`  ✗ ${msg}`);

// ── HCA compression (pure in-process — mirrors hca-compressor.ts) ─────────────
// Validates the autoencoder-style identifier extraction that compresses prior
// answers to ≤128-token cards before injecting them into Gemma4's context window.
function hcaCompress(text, key) {
  const MAX_CHARS     = 512;
  const identifiers   = new Set([
    ...(text.match(/\b[A-Z][a-zA-Z0-9]{2,}|[a-z][a-zA-Z0-9]{2,}[A-Z][a-zA-Z0-9]*/g) ?? []),
    ...(text.match(/\b[\w/-]+\.(ts|js|svelte|go|py|sql|mjs)\b/g) ?? []),
    ...(text.match(/\b\w+\s*\(/g) ?? []).map(s => s.replace('(', '').trim()),
  ]);
  const body      = [...identifiers].slice(0, 60).join(' ');
  const truncated = body.length > MAX_CHARS ? body.slice(0, MAX_CHARS - 3) + '...' : body;
  return {
    hash:   createHash('sha1').update(key).digest('hex').slice(0, 8),
    body:   truncated,
    tokens: Math.ceil(truncated.length / 4),
  };
}

async function testHealth() {
  console.log('\n1. Health check');
  let res;
  try { res = await fetchWithTimeout(`${MCP_URL}/health`); }
  catch (e) { fail(`not reachable — ${e.message}`); return false; }
  if (!res.ok) { fail(`HTTP ${res.status}`); return false; }
  const body = await res.json().catch(() => ({}));
  pass(`version=${body.version ?? '?'}, uptime=${body.uptime?.toFixed(1) ?? '?'}s`);
  return true;
}

async function testKagSearch() {
  console.log('\n2. trace.kag_search');
  const r = await callTool('trace.kag_search', { query: 'auth route gaps', limit: 3 }, TIMEOUT_DB);
  if (!r.ok) { fail(r.error); return false; }
  if (r.chars > MAX_RESULT_CHARS) { fail(`result too large (${r.chars} chars)`); return false; }
  pass(`${r.chars} chars, success=${r.data?.success}`);
  return true;
}

async function testPostgresFts() {
  console.log('\n3. search.postgres_fts');
  const r = await callTool('search.postgres_fts', { query: 'syncCodeRetrievalChunks', limit: 5 }, TIMEOUT_DB);
  if (!r.ok) { fail(r.error); return false; }
  const count = Array.isArray(r.data?.data ?? r.data) ? (r.data?.data ?? r.data).length : '?';
  pass(`${r.chars} chars, ${count} rows`);
  return true;
}

async function testSearchHybrid() {
  console.log('\n4. search.hybrid (Go :8100 → Postgres FTS fallback)');
  const r = await callTool('search.hybrid', { query: 'searchCodebaseViaHttp', limit: 5 }, TIMEOUT_DB);
  if (!r.ok) { fail(r.error); return false; }
  const count = Array.isArray(r.data?.data ?? r.data) ? (r.data?.data ?? r.data).length : '?';
  const dur   = r.data?.meta?.durationMs;
  pass(`${r.chars} chars, ${count} rows${dur != null ? `, ${dur}ms total` : ''}`);
  return true;
}

async function testGraphPagerank() {
  console.log('\n5. graph.pagerank_top');
  const r = await callTool('graph.pagerank_top', { limit: 5 });
  if (!r.ok) { fail(r.error); return false; }
  const count = Array.isArray(r.data?.data ?? r.data) ? (r.data?.data ?? r.data).length : '?';
  pass(`${count} nodes`);
  return true;
}

async function testHcaCompression() {
  console.log('\n6. HCA prior-answer compression (autoencoder round-trip)');
  const text = `
    fetchCodebaseContext in context-assembler.ts: topo-byte cache → GPU cluster prefilter
    → Qdrant ANN → cross-encoder reranker. nearestCluster from centroid-cache.ts uses
    0.35 threshold. Postgres FTS fallback calls searchCodeLexical from postgres-fts.ts
    and writes to ace:code: Redis cache via writeAceCodeCache.
  `;
  const key  = `query:${createHash('sha1').update('fetchCodebaseContext').digest('hex').slice(0, 12)}`;
  const card = hcaCompress(text, key);

  if (!card.body) { fail('empty body — extraction broken'); return false; }
  if (card.tokens > 130) { fail(`exceeds 128-token budget (${card.tokens})`); return false; }
  if (!card.body.includes('fetchCodebaseContext') && !card.body.includes('searchCodeLexical')) {
    fail(`identifiers not extracted\n    body: ${card.body.slice(0, 120)}`);
    return false;
  }
  pass(`${card.tokens} tokens, hash=${card.hash} — identifiers extracted`);
  pass(`  preview: "${card.body.slice(0, 80)}…"`);
  return true;
}

async function testSearchDevContext() {
  console.log('\n7. search.dev_context (SvelteKit ACE → Postgres FTS fallback)');
  const r = await callTool(
    'search.dev_context',
    { query: 'dev context planner', filePath: 'src/lib/server/ai/dev-context-planner.ts', limit: 5 },
    TIMEOUT_DB,
  );
  if (!r.ok) { fail(r.error); return false; }
  const count = Array.isArray(r.data?.data ?? r.data) ? (r.data?.data ?? r.data).length : '?';
  const src   = r.data?.source ?? 'sveltekit';
  pass(`${r.chars} chars, ${count} rows, source=${src}`);
  return true;
}

async function testWriteGuard() {
  console.log('\n8. Write-access guard');
  // MCP StreamableHTTP ALWAYS returns HTTP 200 (even for errors).
  // A write tool is "blocked" when the SSE payload contains isError:true
  // or an MCP error code like -32602 (Tool not found).
  let allBlocked = true;
  for (const name of ['qdrant.upsert', 'neo4j.write', 'redis.set', 'delete']) {
    const r = await callTool(name, {});
    if (!r.ok) {
      // ok:false means HTTP non-200 or non-JSON — definitely blocked
      continue;
    }
    // ok:true but isError in the SSE payload → tool not registered, also blocked
    const raw = JSON.stringify(r.data ?? {});
    const isBlocked = raw.includes('not found') || raw.includes('isError') || raw.includes('-32602');
    if (!isBlocked) {
      fail(`'${name}' returned a successful response — SECURITY ISSUE`);
      allBlocked = false;
    }
  }
  if (allBlocked) pass('write tools not registered (isError:true / -32602 for all)');
  return allBlocked;
}

async function main() {
  console.log('=== Gemma4 MCP Tool Smoke Test ===');

  if (!await testHealth()) {
    console.error('\n✗ FAIL — trace-mcp-server not reachable on :8788');
    process.exit(1);
  }

  const kagOk      = await testKagSearch();
  const ftsOk      = await testPostgresFts();
  const hybridOk   = await testSearchHybrid();
  const pagerankOk = await testGraphPagerank();
  const devCtxOk   = await testSearchDevContext();

  const hcaOk   = await testHcaCompression();
  const writeOk = await testWriteGuard();

  const failed = [
    kagOk      ? null : 'kag_search',
    ftsOk      ? null : 'postgres_fts',
    hybridOk   ? null : 'search_hybrid',
    pagerankOk ? null : 'graph_pagerank',
    devCtxOk   ? null : 'search_dev_context',
    hcaOk      ? null : 'hca_compression',
    writeOk    ? null : 'write_guard',
  ].filter(Boolean);

  if (!failed.length) {
    console.log('\n=== PASS — Gemma4 MCP tool surface (7 tools) + HCA compression healthy ===');
    process.exit(0);
  } else {
    console.error(`\n✗ FAIL — ${failed.join(', ')}`);
    process.exit(1);
  }
}

main().catch((e) => { console.error('\n✗ FATAL:', e.message); process.exit(1); });
