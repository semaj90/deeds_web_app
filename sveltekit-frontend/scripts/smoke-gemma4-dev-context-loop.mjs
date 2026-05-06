#!/usr/bin/env node
/**
 * Smoke test: Gemma4 agentic tool-calling loop (end-to-end via live dev server).
 *
 * Tests the full pipeline:
 *   VS Code → POST /api/v1/chat/completions → openai-facade → gemma4-agent
 *   → LLAMA_TOOL_DEFINITIONS → parseLlamaToolCall → MCP tools (:8788)
 *   → search.dev_context / trace.kag_search → yorha metadata
 *
 * Requires: dev server at :5173 + MCP server at :8788
 *
 * Usage (from sveltekit-frontend/):
 *   node scripts/smoke-gemma4-dev-context-loop.mjs
 *
 * Exits 0 on pass, 1 on failure.
 */

const BASE     = 'http://localhost:5173';
const MCP_BASE = 'http://localhost:8788';
const TIMEOUT  = 120_000;

const WRITE_TOOLS = ['qdrant.upsert', 'neo4j.write', 'redis.set', 'delete', 'index.write', 'db.insert'];

async function fetchWithTimeout(url, opts, timeout = TIMEOUT) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), timeout);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(tid);
  }
}

// ── 1. Check prerequisites ─────────────────────────────────────────────────────

async function checkDevServer() {
  try {
    const res = await fetchWithTimeout(`${BASE}/api/health`, {}, 5_000);
    return res.ok;
  } catch { return false; }
}

async function checkMcpServer() {
  try {
    const res = await fetchWithTimeout(`${MCP_BASE}/health`, {}, 3_000);
    if (!res.ok) return false;
    const body = await res.json();
    return body?.ok === true;
  } catch { return false; }
}

// ── 2. POST to /api/v1/chat/completions ───────────────────────────────────────

async function callChatCompletions(query, filePath) {
  const body = {
    model: 'yorha-legal',
    messages: [{ role: 'user', content: query }],
    stream: false,
    ...(filePath ? { file_path: filePath } : {}),
  };
  const res = await fetchWithTimeout(`${BASE}/api/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// ── 3. Validate response shape ────────────────────────────────────────────────

function validateResponse(data, label) {
  if (!data?.choices?.[0]?.message?.content) {
    console.error(`  ✗ ${label}: missing choices[0].message.content`);
    return false;
  }
  const content = data.choices[0].message.content;
  console.log(`  ✓ ${label}: response ${content.length} chars`);

  const yorha = data.yorha;
  if (!yorha) {
    console.error(`  ✗ ${label}: missing yorha metadata block`);
    return false;
  }
  console.log(`  ✓ yorha.aceUsed=${yorha.aceUsed}, yorha.durationMs=${yorha.durationMs}`);

  if (!Array.isArray(yorha.toolsUsed)) {
    console.warn(`  ⚠ ${label}: yorha.toolsUsed not present (agent may not have called tools)`);
  } else {
    console.log(`  ✓ yorha.toolsUsed=[${yorha.toolsUsed.join(', ')}]`);
    const leaked = yorha.toolsUsed.filter(t => WRITE_TOOLS.some(w => t.includes(w)));
    if (leaked.length) {
      console.error(`  ✗ Write tool in toolsUsed: ${leaked.join(', ')}`);
      return false;
    }
  }

  if (typeof yorha.contextHitCount === 'number') {
    console.log(`  ✓ yorha.contextHitCount=${yorha.contextHitCount}`);
  }
  if (Array.isArray(yorha.selectedStableKeys)) {
    console.log(`  ✓ yorha.selectedStableKeys (${yorha.selectedStableKeys.length} keys)`);
  }

  const resultStr = JSON.stringify(data);
  if (resultStr.length > 200_000) {
    console.error(`  ✗ Response too large (${resultStr.length} chars)`);
    return false;
  }
  return true;
}

// ── main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Gemma4 Agentic Tool-Calling Loop Smoke Test ===\n');

  // Prerequisites
  console.log('0. Prerequisites');
  const devOk = await checkDevServer();
  const mcpOk = await checkMcpServer();
  console.log(`  ${devOk ? '✓' : '✗'} SvelteKit dev server :5173`);
  console.log(`  ${mcpOk ? '✓' : '✗'} TRACE MCP server :8788`);
  if (!devOk) {
    console.error('\n✗ FAIL — dev server not running (start with: npm run dev)');
    process.exit(1);
  }
  if (!mcpOk) {
    console.error('\n✗ FAIL — MCP server not running (start with: node scripts/ensure-mcp-server.mjs --spawn)');
    process.exit(1);
  }

  let allPass = true;

  // Test 1: coding prompt with file_path (triggers coding pipeline)
  console.log('\n1. Coding prompt with file_path (coding pipeline → LLAMA tools)');
  try {
    const data = await callChatCompletions(
      'Fix the TypeScript error in the authentication component — getSession returns undefined',
      'src/lib/server/auth/session.ts',
    );
    if (!validateResponse(data, 'coding prompt')) allPass = false;
  } catch (e) {
    console.error(`  ✗ Request failed: ${e.message}`);
    allPass = false;
  }

  // Test 2: general coding query (no file_path, still coding pipeline via 'coding' pipeline param)
  console.log('\n2. General coding query (openai-facade pipeline)');
  try {
    const data = await callChatCompletions(
      'How does the Qdrant vector search work in the codebase retrieval pipeline?',
    );
    if (!validateResponse(data, 'general coding query')) allPass = false;
  } catch (e) {
    console.error(`  ✗ Request failed: ${e.message}`);
    allPass = false;
  }

  // Test 3: raw passthrough (skips ACE entirely)
  console.log('\n3. raw=true passthrough (skips ACE)');
  try {
    const body = {
      model: 'yorha-fast',
      messages: [{ role: 'user', content: 'hello' }],
      stream: false,
      raw: true,
    };
    const res = await fetchWithTimeout(`${BASE}/api/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error(`  ✗ raw=true HTTP ${res.status}`);
      allPass = false;
    } else {
      const data = await res.json();
      const cacheHit = data.yorha?.cacheHit;
      const aceUsed = data.yorha?.aceUsed;
      console.log(`  ✓ raw passthrough OK — aceUsed=${aceUsed}, cacheHit=${cacheHit}`);
      if (aceUsed !== false) {
        console.warn(`  ⚠ yorha.aceUsed should be false for raw=true`);
      }
    }
  } catch (e) {
    console.error(`  ✗ raw passthrough failed: ${e.message}`);
    allPass = false;
  }

  console.log(allPass
    ? '\n=== PASS — Gemma4 agentic tool-calling loop healthy ==='
    : '\n✗ FAIL — one or more checks failed');
  process.exit(allPass ? 0 : 1);
}

main().catch(e => {
  console.error('\n✗ FATAL:', e.message);
  process.exit(1);
});
