#!/usr/bin/env node
/**
 * ensure-mcp-server.mjs
 *
 * Spawns trace-mcp-server.ts detached (same pattern as llama-server.exe).
 * Called from ensure-dev-runtime.mjs on `npm run dev`.
 *
 * Usage:
 *   node scripts/ensure-mcp-server.mjs [--spawn]
 *   isTraceMcpHealthy()  → exported health check
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path          from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir  = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');

const HOST    = process.env.TRACE_MCP_HOST ?? '127.0.0.1';
const PORT    = process.env.TRACE_MCP_PORT ?? '8788';
const BASE    = `http://${HOST}:${PORT}`;
const TIMEOUT = 500;
const RETRIES = 20;
const REQUIRED_TOOLS = ['kag.record_agent_run', 'kag.ingest_memory_directory'];

export async function isTraceMcpHealthy() {
  try {
    const res = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(TIMEOUT) });
    if (!res.ok) return false;
    const body = await res.json();
    return body?.ok === true;
  } catch {
    return false;
  }
}

async function getTraceMcpTools() {
  try {
    const res = await fetch(`${BASE}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok) return null;

    const raw = await res.text();
    let parsed = null;
    for (const line of raw.split('\n')) {
      if (line.startsWith('data: ')) {
        try {
          parsed = JSON.parse(line.slice(6));
          break;
        } catch { /* keep scanning */ }
      }
    }
    if (!parsed) {
      try { parsed = JSON.parse(raw); } catch { return null; }
    }

    const tools = parsed?.result?.tools;
    if (!Array.isArray(tools)) return null;
    return tools.map((tool) => typeof tool?.name === 'string' ? tool.name : null).filter(Boolean);
  } catch {
    return null;
  }
}

function stopTraceMcpListener() {
  if (process.platform !== 'win32') return false;

  try {
    const ps = spawnSync('powershell', [
      '-NoProfile',
      '-Command',
      `$tcp = Get-NetTCPConnection -LocalPort ${PORT} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($tcp) { Stop-Process -Id $tcp.OwningProcess -Force -ErrorAction SilentlyContinue }`,
    ], { stdio: 'ignore' });
    return ps.status === 0;
  } catch {
    return false;
  }
}

export async function ensureTraceMcp() {
  if (await isTraceMcpHealthy()) {
    const tools = await getTraceMcpTools();
    if (!tools || REQUIRED_TOOLS.every((tool) => tools.includes(tool))) return true;

    console.warn('[ensure-mcp-server] TRACE MCP is healthy but missing KAG tools; restarting listener...');
    stopTraceMcpListener();
    await new Promise((r) => setTimeout(r, 500));
  }

  const serverEntry = path.join(projectRoot, 'src', 'mcp', 'trace-mcp-server.ts');
  if (!existsSync(serverEntry)) {
    console.error('[ensure-mcp-server] trace-mcp-server.ts not found:', serverEntry);
    return false;
  }

  const tsxBin = process.platform === 'win32'
    ? path.join(projectRoot, 'node_modules', '.bin', 'tsx.cmd')
    : path.join(projectRoot, 'node_modules', '.bin', 'tsx');
  const runner = existsSync(tsxBin) ? tsxBin : 'tsx';

  const launchArgs = process.platform === 'win32'
    ? ['/d', '/c', runner, serverEntry]
    : [serverEntry];

  const child = spawn(process.platform === 'win32' ? 'cmd.exe' : runner, launchArgs, {
    detached:    true,
    stdio:       'ignore',
    windowsHide: true,
    env: { ...process.env },
    cwd: projectRoot,
  });
  child.unref();

  // Poll until healthy or timeout
  for (let i = 0; i < RETRIES; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await isTraceMcpHealthy()) return true;
  }
  console.error('[ensure-mcp-server] TRACE MCP server did not become healthy in time');
  return false;
}

// ── CLI ────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--spawn')) {
  const ok = await ensureTraceMcp();
  process.exit(ok ? 0 : 1);
} else {
  const healthy = await isTraceMcpHealthy();
  console.log(healthy ? 'TRACE MCP server: healthy' : 'TRACE MCP server: not running');
}
