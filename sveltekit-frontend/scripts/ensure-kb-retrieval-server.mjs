#!/usr/bin/env node
/**
 * ensure-kb-retrieval-server.mjs
 *
 * Spawns kb-retrieval-server.ts detached.
 * Called from ensure-dev-runtime.mjs on `npm run dev`.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');

const host = process.env.KB_MCP_HOST ?? '127.0.0.1';
const port = process.env.KB_MCP_PORT ?? '8789';
const baseUrl = `http://${host}:${port}`;
const timeoutMs = 500;
const retries = 20;
const requiredTools = ['kb.search_cards', 'kb.get_card', 'kb.expand_neighbors'];

async function isHealthy() {
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return false;
    const body = await res.json();
    return body?.ok === true;
  } catch {
    return false;
  }
}

async function getTools() {
  try {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
      signal: AbortSignal.timeout(timeoutMs),
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function ensureKbRetrievalServer() {
  if (await isHealthy()) {
    const tools = await getTools();
    if (!tools || requiredTools.every((tool) => tools.includes(tool))) return true;
  }

  const serverEntry = path.join(projectRoot, 'src', 'mcp', 'kb-retrieval-server.ts');
  if (!existsSync(serverEntry)) {
    console.error('[ensure-kb-retrieval-server] kb-retrieval-server.ts not found:', serverEntry);
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
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env },
    cwd: projectRoot,
  });
  child.unref();

  for (let i = 0; i < retries; i++) {
    await sleep(500);
    if (await isHealthy()) return true;
  }

  console.error('[ensure-kb-retrieval-server] KB retrieval server did not become healthy in time');
  return false;
}

const args = process.argv.slice(2);

if (args.includes('--spawn')) {
  const ok = await ensureKbRetrievalServer();
  process.exit(ok ? 0 : 1);
} else {
  const healthy = await isHealthy();
  console.log(healthy ? 'KB retrieval server: healthy' : 'KB retrieval server: not running');
}
