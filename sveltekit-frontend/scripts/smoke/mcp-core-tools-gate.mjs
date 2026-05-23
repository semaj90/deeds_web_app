#!/usr/bin/env node
/**
 * mcp-core-tools-gate.mjs
 *
 * Startup gate for OpenCode MCP readiness:
 * - Core tools are REQUIRED (fail fast)
 * - Optional sidecars are WARN-only by default
 *
 * Usage:
 *   node scripts/smoke/mcp-core-tools-gate.mjs
 *   node scripts/smoke/mcp-core-tools-gate.mjs --strict-optional
 */

const STRICT_OPTIONAL = process.argv.includes('--strict-optional');

const TRACE_MCP_URL = process.env.TRACE_MCP_URL ?? 'http://127.0.0.1:8788';
const CORE_TIMEOUT_MS = Number(process.env.CORE_MCP_TIMEOUT_MS ?? 20_000);
const OPTIONAL_TIMEOUT_MS = Number(process.env.OPTIONAL_MCP_TIMEOUT_MS ?? 10_000);

const CORE_TOOLS = [
  {
    name: 'trace.kag_search',
    args: { query: 'auth route gaps', limit: 3 },
  },
  {
    name: 'context.build_kv_packet',
    args: { query: 'authentication middleware', topK: 3 },
  },
  {
    name: 'ace.compact_search',
    args: { query: 'mcp timeout retry', limit: 3, tokenBudget: 1200, includeFullText: false, useCache: true },
  },
];

const OPTIONAL_SIDECARS = [
  { name: 'turbovec-sidecar', url: process.env.TURBOVEC_MCP_URL ?? 'http://127.0.0.1:8791/mcp' },
  { name: 'engram-embed', url: process.env.ENGRAM_MCP_URL ?? 'http://127.0.0.1:8792/mcp' },
  { name: 'langextract', url: process.env.LANGEXTRACT_MCP_URL ?? 'http://127.0.0.1:8793/mcp' },
];

const c = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

async function postJson(url, body, timeoutMs) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const line = text
    .split('\n')
    .map((v) => v.trim())
    .find((v) => v.startsWith('data:') || v.startsWith('{'));
  const payload = line?.startsWith('data:') ? line.slice(5).trim() : (line ?? text);
  return JSON.parse(payload);
}

async function traceMcpCall(method, params, timeoutMs = CORE_TIMEOUT_MS) {
  return postJson(
    `${TRACE_MCP_URL}/mcp`,
    { jsonrpc: '2.0', id: Date.now(), method, params },
    timeoutMs,
  );
}

async function checkCoreHealth() {
  const health = await fetch(`${TRACE_MCP_URL}/health`, { signal: AbortSignal.timeout(5_000) });
  if (!health.ok) throw new Error(`/health HTTP ${health.status}`);
}

async function checkCoreTools() {
  const data = await traceMcpCall('tools/list', {});
  const tools = data?.result?.tools ?? data?.tools ?? [];
  const names = tools.map((t) => t.name);
  const missing = CORE_TOOLS.map((t) => t.name).filter((name) => !names.includes(name));
  if (missing.length > 0) {
    throw new Error(`missing core tools: ${missing.join(', ')}`);
  }

  for (const tool of CORE_TOOLS) {
    const result = await traceMcpCall('tools/call', {
      name: tool.name,
      arguments: tool.args,
    });
    const content = result?.result?.content ?? result?.content ?? [];
    const text = Array.isArray(content) ? content.map((v) => v.text ?? '').join('') : String(content);
    if (!text || text.length < 2) {
      throw new Error(`core tool returned empty response: ${tool.name}`);
    }
  }
}

async function checkOptionalSidecar(sidecar) {
  const init = await postJson(
    sidecar.url,
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'mcp-core-tools-gate', version: '1.0.0' },
      },
    },
    OPTIONAL_TIMEOUT_MS,
  );

  const list = await postJson(
    sidecar.url,
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    OPTIONAL_TIMEOUT_MS,
  );

  const toolCount = list?.result?.tools?.length ?? list?.tools?.length ?? 0;
  if (!init?.result || toolCount <= 0) {
    throw new Error('no initialize result or no tools');
  }

  return toolCount;
}

console.log(`\n${c.bold('OpenCode MCP startup gate')} ${c.dim('(core fail-fast, optional warn-only)')}\n`);

let coreFailures = 0;
let optionalFailures = 0;

try {
  await checkCoreHealth();
  await checkCoreTools();
  console.log(`  ${c.green('✓')} core MCP tools ready (trace/context/ace)`);
} catch (err) {
  coreFailures += 1;
  console.log(`  ${c.red('✗')} core MCP gate failed ${c.dim(`— ${String(err.message ?? err)}`)}`);
}

for (const sidecar of OPTIONAL_SIDECARS) {
  try {
    const count = await checkOptionalSidecar(sidecar);
    console.log(`  ${c.green('✓')} optional ${sidecar.name} ready ${c.dim(`(${count} tools)`)}`);
  } catch (err) {
    optionalFailures += 1;
    console.log(`  ${c.yellow('○')} optional ${sidecar.name} unavailable ${c.dim(`— ${String(err.message ?? err)}`)}`);
  }
}

console.log('');
if (coreFailures === 0) {
  console.log(c.green('PASS: core MCP startup gate passed'));
} else {
  console.log(c.red('FAIL: core MCP startup gate failed'));
}

if (optionalFailures > 0 && !STRICT_OPTIONAL) {
  console.log(c.yellow(`WARN: ${optionalFailures} optional sidecar(s) unavailable (warn-only mode)`));
}

if (coreFailures > 0 || (STRICT_OPTIONAL && optionalFailures > 0)) {
  process.exit(1);
}
