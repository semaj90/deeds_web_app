#!/usr/bin/env node
/**
 * mcp-trace-smoke.mjs
 *
 * Proves the TRACE MCP server at :8788 is reachable AND that the core
 * retrieval tools execute end-to-end without the SvelteKit dev server.
 *
 * Tests:
 *   1. /health — server up
 *   2. tools/list — 33+ tools registered, required set present
 *   3. trace.kag_search — returns chunks
 *   4. graph.pagerank_top — returns ranked files
 *   5. context.build_kv_packet — assembles a compressed context card
 *   6. graph.expand_neighborhood — expands a file's graph neighbors
 *
 * Usage:
 *   node scripts/smoke/mcp-trace-smoke.mjs
 *   node scripts/smoke/mcp-trace-smoke.mjs --strict   # exit 1 on any FAIL
 *   node scripts/smoke/mcp-trace-smoke.mjs --verbose
 */

const STRICT  = process.argv.includes('--strict');
const VERBOSE = process.argv.includes('--verbose');
const MCP_URL = process.env.TRACE_MCP_URL ?? 'http://127.0.0.1:8788';
const TIMEOUT = 15_000;
const TRACE_KAG_TIMEOUT = 30_000;

const REQUIRED_TOOLS = [
  'trace.kag_search',
  'trace.explain_retrieval',
  'graph.expand_neighborhood',
  'graph.pagerank_top',
  'topology.search_4d',
  'context.build_kv_packet',
  'context.get_compressed_card',
  'search.hybrid',
  'kag.ingest_error',
];

const c = {
  green:  s => `\x1b[32m${s}\x1b[0m`,
  red:    s => `\x1b[31m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  dim:    s => `\x1b[2m${s}\x1b[0m`,
  bold:   s => `\x1b[1m${s}\x1b[0m`,
};

const results = [];

async function mcpCall(method, params = {}) {
  const timeout = method === 'tools/call' && params?.name === 'trace.kag_search' ? TRACE_KAG_TIMEOUT : TIMEOUT;
  const res = await fetch(`${MCP_URL}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  // SSE or plain JSON
  const jsonLine = text.split('\n').find(l => l.startsWith('data:') || l.startsWith('{'));
  const raw = jsonLine?.startsWith('data:') ? jsonLine.slice(5).trim() : jsonLine ?? text;
  return JSON.parse(raw);
}

async function gate(id, label, fn) {
  const t0 = Date.now();
  try {
    const detail = await fn();
    const ms = Date.now() - t0;
    results.push({ id, label, status: 'PASS', detail: detail ?? '', ms });
    console.log(`  ${c.green('✓')} ${label}${detail ? c.dim(' — ' + detail) : ''}`);
  } catch (err) {
    const ms = Date.now() - t0;
    const warn = err.message?.startsWith('WARN:');
    const status = warn ? 'WARN' : 'FAIL';
    const msg = warn ? err.message.slice(5).trim() : err.message;
    results.push({ id, label, status, detail: msg, ms });
    const icon = warn ? c.yellow('○') : c.red('✗');
    console.log(`  ${icon} ${label} ${c.dim('— ' + msg)}`);
  }
}

console.log(`\n${c.bold(c.dim('smoke: TRACE MCP'))}\n`);

// 1. Health
await gate('T1', 'TRACE MCP /health reachable', async () => {
  const res = await fetch(`${MCP_URL}/health`, { signal: AbortSignal.timeout(5_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json().catch(() => ({}));
  return `uptime=${body.uptime ?? '?'}s`;
});

// 2. tools/list
let toolNames = [];
await gate('T2', 'tools/list returns required tool set', async () => {
  const data = await mcpCall('tools/list');
  const tools = data?.result?.tools ?? data?.tools ?? [];
  toolNames = tools.map(t => t.name);
  const missing = REQUIRED_TOOLS.filter(t => !toolNames.includes(t));
  if (missing.length) throw new Error(`missing: ${missing.join(', ')}`);
  return `${toolNames.length} tools, all required present`;
});

// 3. trace.kag_search
await gate('T3', 'trace.kag_search returns chunks', async () => {
  const data = await mcpCall('tools/call', {
    name: 'trace.kag_search',
    arguments: { query: 'src/mcp/trace-mcp-server.ts', limit: 1 },
  });
  const content = data?.result?.content ?? data?.content ?? [];
  const text = Array.isArray(content) ? content.map(c => c.text ?? '').join('') : String(content);
  if (!text || text.length < 10) throw new Error('empty response');
  if (VERBOSE) console.log(c.dim('    ' + text.slice(0, 120)));
  return `${text.length} chars`;
});

// 4. graph.pagerank_top
await gate('T4', 'graph.pagerank_top returns ranked files', async () => {
  const data = await mcpCall('tools/call', {
    name: 'graph.pagerank_top',
    arguments: { limit: 5 },
  });
  const content = data?.result?.content ?? data?.content ?? [];
  const text = Array.isArray(content) ? content.map(c => c.text ?? '').join('') : String(content);
  if (!text || text.length < 10) throw new Error('empty response');
  return `${text.length} chars`;
});

// 5. context.build_kv_packet
await gate('T5', 'context.build_kv_packet assembles card', async () => {
  const data = await mcpCall('tools/call', {
    name: 'context.build_kv_packet',
    arguments: { query: 'authentication middleware', topK: 3 },
  });
  const content = data?.result?.content ?? data?.content ?? [];
  const text = Array.isArray(content) ? content.map(c => c.text ?? '').join('') : String(content);
  if (!text || text.length < 10) throw new Error('empty response');
  return `${text.length} chars`;
});

// 6. graph.expand_neighborhood (use a known high-authority file)
await gate('T6', 'graph.expand_neighborhood returns neighbors', async () => {
  const data = await mcpCall('tools/call', {
    name: 'graph.expand_neighborhood',
    arguments: { filePath: 'src/lib/server/redis.ts', depth: 1 },
  });
  const content = data?.result?.content ?? data?.content ?? [];
  const text = Array.isArray(content) ? content.map(c => c.text ?? '').join('') : String(content);
  if (!text || text.length < 5) throw new Error('WARN: empty — file may not be in graph');
  return `${text.length} chars`;
});

// ── Summary ──────────────────────────────────────────────────────────────────

const pass = results.filter(r => r.status === 'PASS').length;
const warn = results.filter(r => r.status === 'WARN').length;
const fail = results.filter(r => r.status === 'FAIL').length;

console.log('');
if (fail === 0 && warn === 0) {
  console.log(c.green(`${pass}/${results.length} gates passed`));
} else {
  console.log(`${c.green(pass + ' PASS')}  ${warn ? c.yellow(warn + ' WARN') : ''}  ${fail ? c.red(fail + ' FAIL') : ''}`.trim());
}
console.log('');

if (STRICT && fail > 0) process.exit(1);
