#!/usr/bin/env node
/**
 * mcp-probe.mjs — transport-aligned MCP health probe
 *
 * Probes the actual transport each surface uses:
 * - trace-mcp: HTTP health route
 * - turbovec-sidecar: JSON-RPC over HTTP
 * - engram-embed: stdio server health wrapper
 * - langextract: absent unless a local MCP server file exists
 * - ldr-mcp: stdio server health wrapper
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const IS_JSON = process.argv.includes('--json');
const IS_STRICT = process.argv.includes('--strict');
const REPO_ROOT = process.cwd();

const TRACE_HEALTH_URL = 'http://127.0.0.1:8788/health';
const TURBOVEC_RPC_URL = 'http://127.0.0.1:8791/mcp';
const ENGRAM_HEALTH_SCRIPT = path.resolve(REPO_ROOT, 'sveltekit-frontend', 'scripts', 'mcp', 'engram-embed-mcp.mjs');
const LANGEXTRACT_MCP_SCRIPT = path.resolve(REPO_ROOT, 'sveltekit-frontend', 'scripts', 'mcp', 'langextract-mcp.mjs');
const LDR_HEALTH_SCRIPT = path.resolve(REPO_ROOT, 'scripts', 'atlas', 'ldr-mcp-health.mjs');

const MCP_ENDPOINTS = [
  { name: 'trace-mcp', kind: 'http-health', url: TRACE_HEALTH_URL },
  { name: 'turbovec-sidecar', kind: 'jsonrpc', url: TURBOVEC_RPC_URL },
  { name: 'engram-embed', kind: 'stdio-health', script: ENGRAM_HEALTH_SCRIPT, args: ['--health'] },
  { name: 'langextract', kind: 'stdio-health', script: LANGEXTRACT_MCP_SCRIPT, args: ['--health'], optional: true },
  { name: 'ldr-mcp', kind: 'stdio-health', script: LDR_HEALTH_SCRIPT, args: [] },
];

const TIMEOUT_MS = 5000;

async function probeHttpHealth(name, url) {
  const result = { name, url, transport: 'http-health', status: 'DOWN', toolCount: 0, latencyMs: 0, error: null };
  const t0 = Date.now();
  try {
    const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(TIMEOUT_MS) });
    result.latencyMs = Date.now() - t0;
    if (res.ok) {
      result.status = 'UP';
      result.toolCount = -1;
    } else {
      result.error = `HTTP ${res.status}`;
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    result.latencyMs = Date.now() - t0;
  }
  return result;
}

async function probeJsonRpc(name, url) {
  const result = { name, url, transport: 'jsonrpc', status: 'DOWN', toolCount: 0, latencyMs: 0, error: null };
  const t0 = Date.now();

  try {
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

    const initData = await initRes.json().catch(() => ({}));
    if (initData?.error) {
      result.error = `initialize RPC error: ${initData.error.message}`;
      return result;
    }

    const listRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!listRes.ok) {
      result.error = `tools/list returned HTTP ${listRes.status}`;
      result.status = 'PARTIAL';
      result.latencyMs = Date.now() - t0;
      return result;
    }

    const listData = await listRes.json().catch(() => ({}));
    const tools = listData?.result?.tools ?? [];
    result.status = 'UP';
    result.toolCount = tools.length;
    result.latencyMs = Date.now() - t0;
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    result.latencyMs = Date.now() - t0;
  }

  return result;
}

async function probeStdioHealth(name, script, args = [], optional = false) {
  const result = { name, url: 'stdio', transport: 'stdio-health', status: 'DOWN', toolCount: 0, latencyMs: 0, error: null };
  if (optional && !fs.existsSync(script)) {
    return { ...result, status: 'SKIP', error: 'No local MCP script found' };
  }

  const t0 = Date.now();
  const proc = spawnSync(process.execPath, [script, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: TIMEOUT_MS,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  result.latencyMs = Date.now() - t0;

  if (proc.error) {
    result.error = proc.error.message;
    return result;
  }

  const stdout = (proc.stdout ?? '').trim();
  let parsed = null;
  if (stdout) {
    try {
      parsed = JSON.parse(stdout);
    } catch {
      parsed = { raw: stdout };
    }
  }

  if (proc.status === 0 && parsed?.ok !== false) {
    result.status = 'UP';
    if (Array.isArray(parsed?.toolNames)) {
      result.toolCount = parsed.toolNames.length;
    }
    result.error = null;
  } else {
    result.error = parsed?.error ?? (proc.stderr ? String(proc.stderr).trim() : `exit ${proc.status}`);
  }

  return result;
}

async function probeEndpoint(ep) {
  if (ep.kind === 'http-health') return probeHttpHealth(ep.name, ep.url);
  if (ep.kind === 'jsonrpc') return probeJsonRpc(ep.name, ep.url);
  if (ep.kind === 'stdio-health') return probeStdioHealth(ep.name, ep.script, ep.args, Boolean(ep.optional));
  return { name: ep.name, url: null, transport: ep.kind, status: 'SKIP', toolCount: 0, latencyMs: 0, error: 'Unknown transport kind' };
}

const results = await Promise.all(MCP_ENDPOINTS.map((ep) => probeEndpoint(ep)));

if (IS_JSON) {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), endpoints: results }, null, 2));
} else {
  console.log('\n=== MCP Endpoint Probe Results ===\n');
  for (const r of results) {
    const icon = r.status === 'UP' ? '✅' : r.status === 'PARTIAL' ? '⚠️ ' : r.status === 'SKIP' ? '⏭️ ' : '❌';
    const detail = r.status === 'UP'
      ? r.toolCount === -1 ? `health ok, ${r.latencyMs}ms` : `${r.toolCount} tools, ${r.latencyMs}ms`
      : r.status === 'SKIP' ? r.error
      : r.error ?? 'unknown error';
    console.log(`  ${icon} ${r.name.padEnd(20)} ${r.status.padEnd(8)} ${detail}`);
  }
  console.log('');
}

const failCount = results.filter((r) => r.status === 'DOWN').length;
const partialCount = results.filter((r) => r.status === 'PARTIAL').length;
const skipCount = results.filter((r) => r.status === 'SKIP').length;

if (!IS_JSON) {
  const upCount = results.length - failCount - partialCount - skipCount;
  console.log(`  Summary: ${upCount}/${results.length - skipCount} UP, ${partialCount} PARTIAL, ${failCount} DOWN, ${skipCount} SKIP\n`);
}

if (IS_STRICT && failCount > 0) {
  process.exit(1);
}
