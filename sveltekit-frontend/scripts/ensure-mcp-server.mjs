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

import { spawn }    from 'node:child_process';
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

export async function ensureTraceMcp() {
  if (await isTraceMcpHealthy()) return true;

  const serverEntry = path.join(projectRoot, 'src', 'mcp', 'trace-mcp-server.ts');
  if (!existsSync(serverEntry)) {
    console.error('[ensure-mcp-server] trace-mcp-server.ts not found:', serverEntry);
    return false;
  }

  const tsxBin = path.join(projectRoot, 'node_modules', '.bin', 'tsx');
  const runner = existsSync(tsxBin) ? tsxBin : 'tsx';

  const child = spawn(runner, [serverEntry], {
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
