#!/usr/bin/env node
/**
 * ensure-mcp-server.mjs
 *
 * Spawns trace-mcp-server.ts detached.
 * Uses the local TS loader instead of tsx so Windows startup does not depend
 * on spawning esbuild.exe.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadRuntimeEnv } from '../src/lib/server/config/load-runtime-env.js';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const dotenvMode = process.env.DOTENV_LOAD_MODE ?? (process.env.NODE_ENV === 'production' ? 'process' : 'development');
loadRuntimeEnv({ cwd: projectRoot, mode: dotenvMode });

const TIMEOUT = 500;
const RETRIES = 60;
const REQUIRED_TOOLS = [
  'kag.record_agent_run',
  'kag.ingest_memory_directory',
  'runtime.simdjson_status',
  'runtime.sse_probe',
  'hypergraph.explain_activation',
  'trace.kag_search',
];

function getTraceMcpBase() {
  const host = process.env.TRACE_MCP_HOST ?? '127.0.0.1';
  const port = process.env.TRACE_MCP_PORT ?? '8788';
  return {
    host,
    port,
    base: process.env.TRACE_MCP_URL?.replace(/\/$/, '') ?? `http://${host}:${port}`,
  };
}

export async function isTraceMcpHealthy() {
  try {
    const { base } = getTraceMcpBase();
    const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(TIMEOUT) });
    if (!res.ok) return false;
    const body = await res.json();
    return body?.ok === true && body?.dependencies?.mcp === true;
  } catch {
    return false;
  }
}

/**
 * Capability readiness is a distinct gate from /health.
 * Initialize a real MCP session, inspect tool input schemas and follow
 * pagination. Fail closed on protocol errors, empty/malformed inventories,
 * missing tools, or missing authorization.
 */
export async function probeTraceMcpCapabilities() {
  const { base } = getTraceMcpBase();
  let sessionId;
  let rpcId = 0;
  const request = async (method, params = {}, notification = false) => {
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
      ...(process.env.TRACE_MCP_AUTH_TOKEN ? { Authorization: `Bearer ${process.env.TRACE_MCP_AUTH_TOKEN}` } : {}),
    };
    const payload = { jsonrpc: '2.0', method, params, ...(!notification ? { id: ++rpcId } : {}) };
    const res = await fetch(`${base}/mcp`, {
      method: 'POST', headers, body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`MCP_HTTP_${res.status}`);
    sessionId = res.headers.get('mcp-session-id') ?? sessionId;
    if (notification || res.status === 202 || res.status === 204) return null;
    const raw = await res.text();
    const messages = [];
    if (res.headers.get('content-type')?.includes('text/event-stream')) {
      for (const line of raw.split(/\r?\n/)) {
        if (!line.startsWith('data:')) continue;
        try { messages.push(JSON.parse(line.slice(5).trim())); } catch { /* ignore non-JSON event */ }
      }
    } else {
      messages.push(JSON.parse(raw));
    }
    const response = messages.find((value) => value?.id === rpcId);
    if (!response || response.error) throw new Error(response?.error?.message ?? 'MCP_RPC_RESPONSE_MISSING');
    return response.result;
  };
  const fail = (reason, discovered = []) => ({
    schema: 'TraceCapabilityReceiptV1',
    server: 'trace', port: Number(getTraceMcpBase().port),
    health: 'PASS', mcp_initialized: false, tool_discovery: 'FAIL',
    required_tools: REQUIRED_TOOLS, discovered_tools: discovered,
    missing_tools: REQUIRED_TOOLS.filter((name) => !discovered.includes(name)),
    production_ready: false, reason,
  });
  try {
    const initialized = await request('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'trace-startup-capability-check', version: '1.0.0' },
    });
    if (!initialized?.capabilities?.tools) return fail('MCP_TOOLS_CAPABILITY_NOT_ADVERTISED');
    await request('notifications/initialized', {}, true);
    const names = new Set();
    const cursors = new Set();
    let cursor;
    for (let page = 0; page < 100; page++) {
      const result = await request('tools/list', cursor ? { cursor } : {});
      if (!Array.isArray(result?.tools)) return fail('MCP_TOOL_LIST_INVALID', [...names]);
      for (const tool of result.tools) {
        if (typeof tool?.name !== 'string' || !tool.name ||
            !tool.inputSchema || tool.inputSchema.type !== 'object')
          return fail('MCP_TOOL_SCHEMA_INVALID', [...names]);
        names.add(tool.name);
      }
      if (!result.nextCursor) {
        const discovered = [...names].sort();
        const missing = REQUIRED_TOOLS.filter((name) => !names.has(name));
        return {
          schema: 'TraceCapabilityReceiptV1', server: 'trace',
          port: Number(getTraceMcpBase().port), health: 'PASS',
          mcp_initialized: true, tool_discovery: 'PASS',
          required_tools: REQUIRED_TOOLS, discovered_tools: discovered,
          missing_tools: missing, production_ready: missing.length === 0,
          reason: missing.length ? 'REQUIRED_TOOLS_MISSING' : null,
        };
      }
      if (cursors.has(result.nextCursor)) return fail('MCP_PAGINATION_CYCLE', [...names]);
      cursors.add(result.nextCursor);
      cursor = result.nextCursor;
    }
    return fail('MCP_PAGINATION_LIMIT', [...names]);
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'MCP_CAPABILITY_PROBE_FAILED');
  } finally {
    if (sessionId) {
      try {
        await fetch(`${base}/mcp`, {
          method: 'DELETE', headers: { 'Mcp-Session-Id': sessionId },
          signal: AbortSignal.timeout(1000),
        });
      } catch { /* session teardown is best effort */ }
    }
  }
}

function stopTraceMcpListener() {
  if (process.platform !== 'win32') return false;
  const { port } = getTraceMcpBase();

  try {
    const ps = spawnSync('powershell', [
      '-NoProfile',
      '-Command',
      `$tcp = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($tcp) { Stop-Process -Id $tcp.OwningProcess -Force -ErrorAction SilentlyContinue }`,
    ], { stdio: 'ignore' });
    return ps.status === 0;
  } catch {
    return false;
  }
}

function hasTraceMcpListener() {
  if (process.platform !== 'win32') return false;
  const { port } = getTraceMcpBase();

  try {
    const ps = spawnSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `$tcp = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($tcp) { exit 0 } else { exit 1 }`,
      ],
      { stdio: 'ignore' }
    );
    return ps.status === 0;
  } catch {
    return false;
  }
}

export async function ensureTraceMcp() {
  if (await isTraceMcpHealthy()) {
    const receipt = await probeTraceMcpCapabilities();
    if (receipt.production_ready) return true;
    console.warn('[ensure-mcp-server] capability gate:', receipt.reason, receipt.missing_tools);

    console.warn('[ensure-mcp-server] TRACE MCP is healthy but missing required tools; restarting listener...');
    stopTraceMcpListener();
    await new Promise((r) => setTimeout(r, 500));
  } else if (hasTraceMcpListener()) {
    console.warn('[ensure-mcp-server] TRACE MCP listener exists but health check failed; replacing listener...');
    stopTraceMcpListener();
    await new Promise((r) => setTimeout(r, 500));
  }

  const serverEntry = path.join(projectRoot, 'src', 'mcp', 'trace-mcp-server.ts');
  if (!existsSync(serverEntry)) {
    console.error('[ensure-mcp-server] trace-mcp-server.ts not found:', serverEntry);
    return false;
  }

  const { mkdirSync, openSync, readFileSync } = await import('node:fs');
  const logDir = path.join(projectRoot, 'logs', 'trace-mcp');
  mkdirSync(logDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const errPath = path.join(logDir, `launch-${stamp}.err`);
  const outPath = path.join(logDir, `launch-${stamp}.out`);
  const errFd = openSync(errPath, 'a');
  const outFd = openSync(outPath, 'a');

  const localLoader = path.join(projectRoot, 'scripts', 'node-ts-loader.mjs');
  const localLoaderUrl = pathToFileURL(localLoader).href;
  if (!existsSync(localLoader)) {
    console.error('[ensure-mcp-server] local TS loader missing:', localLoader);
    return false;
  }

  const nodeArgs = ['--loader', localLoaderUrl, serverEntry];
  const child = spawn(process.execPath, nodeArgs, {
    detached: true,
    stdio: ['ignore', outFd, errFd],
    windowsHide: true,
    env: { ...process.env },
    cwd: projectRoot,
  });
  child.unref();

  for (let i = 0; i < RETRIES; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await isTraceMcpHealthy()) {
      const receipt = await probeTraceMcpCapabilities();
      if (receipt.production_ready) return true;
      if (i === RETRIES - 1) console.error('[ensure-mcp-server] capability gate failed:', JSON.stringify(receipt));
    }
    if (child.exitCode !== null) {
      console.error(`[ensure-mcp-server] TRACE MCP exited code=${child.exitCode} after ${(i + 1) * 500}ms`);
      try {
        const tail = readFileSync(errPath, 'utf8').split('\n').slice(-15).join('\n');
        if (tail.trim()) console.error('  stderr (tail):\n  ' + tail.replace(/\n/g, '\n  '));
        console.error(`  full log: ${errPath}`);
      } catch {}
      return false;
    }
  }

  console.error(`[ensure-mcp-server] TRACE MCP server did not become healthy in ${RETRIES * 500}ms`);
  console.error(`  stderr log: ${errPath}`);
  return false;
}

const args = process.argv.slice(2);
if (args.includes('--spawn')) {
  const ok = await ensureTraceMcp();
  process.exit(ok ? 0 : 1);
} else {
  const healthy = await isTraceMcpHealthy();
  const receipt = healthy ? await probeTraceMcpCapabilities() : null;
  console.log(JSON.stringify({ healthy, capability: receipt }, null, 2));
  if (healthy && !receipt?.production_ready) process.exitCode = 1;
}
