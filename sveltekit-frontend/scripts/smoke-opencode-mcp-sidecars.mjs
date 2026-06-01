#!/usr/bin/env node
/**
 * smoke-opencode-mcp-sidecars.mjs
 *
 * Regression guard for the three OpenCode MCP sidecars.
 *
 * Error taxonomy (important — these are different failure modes):
 *   TRANSPORT_ERROR — sidecar is up but /mcp route returned 404 or non-JSON
 *                     (the specific regression: stdio-only sidecar missing HTTP transport)
 *   METHOD_ERROR    — HTTP transport alive but initialize/tools/call failed
 *   DOWN            — connection refused / timeout (sidecar not running — tolerated)
 *
 * Exit code 1 only on TRANSPORT_ERROR or METHOD_ERROR from a running sidecar.
 * A DOWN sidecar prints a warning but does not fail the smoke.
 */

const endpoints = [
  { name: 'turbovec-sidecar', url: 'http://127.0.0.1:8791/mcp' },
  { name: 'engram-embed',     url: 'http://127.0.0.1:8792/mcp', checkMemory: true },
  { name: 'langextract',      url: 'http://127.0.0.1:8793/mcp' }
];

// ── Transport probe — separates "sidecar missing HTTP" from "method failed" ──

async function probeTransport(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'opencode-sidecar-smoke', version: '1.0.0' } } }),
      signal: controller.signal
    });
    const text = await res.text().catch(() => '');

    if (res.status === 404) {
      return { ok: false, transportError: true, detail: `HTTP 404 — /mcp route missing (sidecar may be stdio-only, not HTTP)` };
    }
    if (!res.ok) {
      return { ok: false, transportError: true, detail: `HTTP ${res.status}: ${text.slice(0, 160)}` };
    }
    // Check content is JSON-shaped
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('json') && !text.trim().startsWith('{')) {
      return { ok: false, transportError: true, detail: `2xx but response is not JSON (content-type: ${ct}): ${text.slice(0, 80)}` };
    }
    let parsed = null;
    try { parsed = text.trim() ? JSON.parse(text) : null; } catch {
      return { ok: false, transportError: true, detail: `2xx but body is not valid JSON: ${text.slice(0, 80)}` };
    }
    return { ok: true, transportError: false, parsed, status: res.status };
  } catch (err) {
    if (err.name === 'AbortError') return { ok: false, down: true, detail: 'timeout after 10s' };
    const msg = err.message ?? String(err);
    if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
      return { ok: false, down: true, detail: `connection refused — sidecar not running` };
    }
    return { ok: false, down: true, detail: `network error: ${msg}` };
  } finally {
    clearTimeout(timeout);
  }
}

async function postJson(url, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 240)}`);
    if (!text.trim()) return null;
    return JSON.parse(text);
  } finally {
    clearTimeout(timeout);
  }
}

async function checkEndpoint(endpoint) {
  // Step 1: verify transport before running methods
  const transport = await probeTransport(endpoint.url);

  if (transport.down) {
    return { name: endpoint.name, status: 'DOWN', detail: transport.detail };
  }
  if (transport.transportError) {
    return { name: endpoint.name, status: 'TRANSPORT_ERROR', detail: transport.detail };
  }

  // Transport alive — now check initialize result
  const initialize = transport.parsed;
  if (!initialize?.result) {
    return { name: endpoint.name, status: 'METHOD_ERROR', detail: `initialize returned no result: ${JSON.stringify(initialize)}` };
  }

  // tools/list
  let tools;
  try {
    tools = await postJson(endpoint.url, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  } catch (err) {
    return { name: endpoint.name, status: 'METHOD_ERROR', detail: `tools/list failed: ${err.message}` };
  }

  const toolCount = tools?.result?.tools?.length ?? 0;
  if (toolCount === 0) {
    return { name: endpoint.name, status: 'METHOD_ERROR', detail: 'tools/list returned 0 tools' };
  }

  return {
    name: endpoint.name,
    status: 'OK',
    protocolVersion: initialize.result.protocolVersion,
    toolCount
  };
}

async function callTool(url, name, args, id) {
  const response = await postJson(url, { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
  if (response?.error) throw new Error(`${name} RPC error: ${response.error.message ?? JSON.stringify(response.error)}`);
  const text = response?.result?.content?.[0]?.text;
  if (typeof text !== 'string') throw new Error(`${name} returned no text content`);
  return JSON.parse(text);
}

async function checkEngramMemory(url) {
  const redis = await callTool(url, 'engram.redis_health', {}, 101);
  if (!redis.ok) return { ok: false, skipped: true, reason: `Redis unavailable: ${redis.error ?? 'unknown'}` };

  const runId = `smoke-${Date.now()}`;
  const packet = await callTool(url, 'engram.ace_packet_inject', { run_id: runId, context_blob: JSON.stringify({ ok: true, runId, source: 'smoke-opencode-mcp-sidecars' }), ttl_seconds: 120 }, 102);
  if (!packet.ok || packet.status !== 'written') throw new Error(`ace_packet_inject did not write: ${JSON.stringify(packet)}`);

  const readBack = await callTool(url, 'engram.ace_packet_read', { run_id: runId }, 103);
  if (!readBack.ok || readBack.status !== 'hit') throw new Error(`ace_packet_read did not hit: ${JSON.stringify(readBack)}`);

  const userId = `smoke-${runId}`;
  const memory = await callTool(url, 'engram.chat_memory_store', { user_id: userId, turn: { role: 'user', content: 'smoke memory write', metadata: { runId } }, max_turns: 5, ttl_seconds: 120 }, 104);
  if (!memory.ok || memory.status !== 'written') throw new Error(`chat_memory_store did not write: ${JSON.stringify(memory)}`);

  const recent = await callTool(url, 'engram.chat_memory_recent', { user_id: userId, limit: 1 }, 105);
  if (!recent.ok || recent.count < 1) throw new Error(`chat_memory_recent did not read back: ${JSON.stringify(recent)}`);

  return { ok: true, packetKey: packet.key, memoryKey: memory.redis_key, recentCount: recent.count };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const results = [];
let anyHardFailure = false;

for (const endpoint of endpoints) {
  let result;
  try {
    result = await checkEndpoint(endpoint);
  } catch (err) {
    result = { name: endpoint.name, status: 'METHOD_ERROR', detail: err.message };
  }

  if (result.status === 'OK' && endpoint.checkMemory) {
    try {
      result.memory = await checkEngramMemory(endpoint.url);
    } catch (err) {
      result.memoryError = err.message;
      result.status = 'METHOD_ERROR';
      result.detail = `memory check failed: ${err.message}`;
    }
  }

  results.push(result);

  if (result.status === 'TRANSPORT_ERROR') {
    console.error(`[TRANSPORT_ERROR] ${result.name}: ${result.detail}`);
    anyHardFailure = true;
  } else if (result.status === 'METHOD_ERROR') {
    console.error(`[METHOD_ERROR] ${result.name}: ${result.detail}`);
    anyHardFailure = true;
  } else if (result.status === 'DOWN') {
    console.warn(`[DOWN] ${result.name}: ${result.detail} (tolerated — start with: npm run mcp:opencode-sidecars)`);
  } else {
    console.log(`[PASS] ${result.name}: HTTP /mcp OK — protocol=${result.protocolVersion} tools=${result.toolCount}${result.memory ? ` memory=OK` : ''}`);
  }
}

if (results.length > 0) {
  console.log(JSON.stringify({ ok: !anyHardFailure, results }, null, 2));
}

if (anyHardFailure) {
  console.error('\n🧪 sidecar smoke FAILED — see TRANSPORT_ERROR or METHOD_ERROR above');
  console.error('   TRANSPORT_ERROR = sidecar running but /mcp route missing (stdio-only regression)');
  console.error('   METHOD_ERROR    = transport alive but JSON-RPC method failed');
  console.error('   Run: npm run mcp:sidecars:audit  for detailed diagnosis');
  process.exitCode = 1;
} else {
  const downCount = results.filter(r => r.status === 'DOWN').length;
  if (downCount > 0) {
    console.log(`\n🧪 sidecar smoke OK (${downCount} sidecar(s) DOWN — not an error)`);
  } else {
    console.log('\n🧪 sidecar smoke green');
  }
}
