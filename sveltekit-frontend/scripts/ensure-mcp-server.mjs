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

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');

const HOST = process.env.TRACE_MCP_HOST ?? '127.0.0.1';
const PORT = process.env.TRACE_MCP_PORT ?? '8788';
const BASE = `http://${HOST}:${PORT}`;
const TIMEOUT = 500;
const RETRIES = 60;
const REQUIRED_TOOLS = ['kag.record_agent_run', 'kag.ingest_memory_directory', 'runtime.simdjson_status', 'runtime.sse_probe'];

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
        } catch {}
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

    console.warn('[ensure-mcp-server] TRACE MCP is healthy but missing required tools; restarting listener...');
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
    if (await isTraceMcpHealthy()) return true;
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
  console.log(healthy ? 'TRACE MCP server: healthy' : 'TRACE MCP server: not running');
}
