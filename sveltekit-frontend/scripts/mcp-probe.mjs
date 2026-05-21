#!/usr/bin/env node
/**
 * mcp-probe.mjs — Correct MCP JSON-RPC 2.0 health probe
 *
 * MCP over HTTP-SSE uses POST with JSON-RPC 2.0, NOT GET.
 * GET /mcp returns 405 or 406 (Method Not Allowed) — that is EXPECTED.
 *
 * Correct flow:
 *   1. POST /mcp  {jsonrpc:"2.0", method:"initialize", id:1, params:{...}}
 *   2. POST /mcp  {jsonrpc:"2.0", method:"tools/list",  id:2, params:{}}
 *
 * Usage:
 *   node scripts/mcp-probe.mjs [--json] [--strict]
 *
 * Exit codes:
 *   0 = all configured MCP endpoints healthy
 *   1 = one or more endpoints unhealthy (strict mode) or any error
 */

const IS_JSON = process.argv.includes('--json');
const IS_STRICT = process.argv.includes('--strict');

const MCP_ENDPOINTS = [
  // HTTP-SSE transport: GET /mcp with Accept: text/event-stream
  { name: 'trace-mcp',       url: 'http://127.0.0.1:8788/mcp', transport: 'sse' },
  // HTTP JSON-RPC 2.0 POST transport
  { name: 'turbovec-sidecar',url: 'http://127.0.0.1:8791/mcp', transport: 'jsonrpc' },
  { name: 'engram-embed',    url: 'http://127.0.0.1:8792/mcp', transport: 'jsonrpc' },
  { name: 'langextract',     url: 'http://127.0.0.1:8793/mcp', transport: 'jsonrpc' },
  { name: 'ldr-mcp',        url: 'http://127.0.0.1:3001/mcp', transport: 'jsonrpc' },
];

const TIMEOUT_MS = 5000;

/**
 * Probe SSE transport endpoints (e.g. trace-mcp on :8788).
 * These use GET with Accept: text/event-stream — a 200 with that content-type means UP.
 */
async function probeSSEEndpoint(name, url) {
  const result = { name, url, transport: 'sse', status: 'DOWN', toolCount: 0, latencyMs: 0, error: null };
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'text/event-stream' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    result.latencyMs = Date.now() - t0;
    const ct = res.headers.get('content-type') ?? '';
    if (res.ok && ct.includes('text/event-stream')) {
      result.status = 'UP';
      result.toolCount = -1; // SSE — tool count not available via simple probe
    } else {
      result.error = `HTTP ${res.status} content-type=${ct}`;
    }
  } catch (err) {
    result.error = err.message;
    result.latencyMs = Date.now() - t0;
  }
  return result;
}

async function probeEndpoint({ name, url, transport = 'jsonrpc' }) {
  if (transport === 'sse') return probeSSEEndpoint(name, url);

  const result = { name, url, status: 'DOWN', toolCount: 0, latencyMs: 0, error: null };
  const t0 = Date.now();

  try {
    // Step 1: initialize
    const initRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'mcp-probe', version: '1.0.0' },
        },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!initRes.ok) {
      result.error = `initialize returned HTTP ${initRes.status}`;
      return result;
    }

    const initData = await initRes.json();
    if (initData.error) {
      result.error = `initialize RPC error: ${initData.error.message}`;
      return result;
    }

    // Step 2: tools/list
    const listRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!listRes.ok) {
      result.error = `tools/list returned HTTP ${listRes.status}`;
      // Still partially UP — initialize succeeded
      result.status = 'PARTIAL';
      result.latencyMs = Date.now() - t0;
      return result;
    }

    const listData = await listRes.json();
    const tools = listData?.result?.tools ?? [];

    result.status = 'UP';
    result.toolCount = tools.length;
    result.latencyMs = Date.now() - t0;
  } catch (err) {
    result.error = err.message;
    result.latencyMs = Date.now() - t0;
  }

  return result;
}

const results = await Promise.all(MCP_ENDPOINTS.map((ep) => probeEndpoint(ep)));

if (IS_JSON) {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), endpoints: results }, null, 2));
} else {
  console.log('\n=== MCP Endpoint Probe Results ===\n');
  for (const r of results) {
    const icon = r.status === 'UP' ? '✅' : r.status === 'PARTIAL' ? '⚠️ ' : '❌';
    const detail = r.status === 'UP'
      ? `${r.toolCount} tools, ${r.latencyMs}ms`
      : r.error ?? 'unknown error';
    console.log(`  ${icon} ${r.name.padEnd(20)} ${r.status.padEnd(8)} ${detail}`);
  }
  console.log('');
}

const failCount = results.filter((r) => r.status === 'DOWN').length;
const partialCount = results.filter((r) => r.status === 'PARTIAL').length;

if (!IS_JSON) {
  const upCount = results.length - failCount - partialCount;
  console.log(`  Summary: ${upCount}/${results.length} UP, ${partialCount} PARTIAL, ${failCount} DOWN\n`);
}

if (IS_STRICT && failCount > 0) {
  process.exit(1);
}
