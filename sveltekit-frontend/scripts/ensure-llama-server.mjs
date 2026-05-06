#!/usr/bin/env node
/**
 * ensure-llama-server.mjs
 *
 * Ensures llama-server.exe is running on :8090 (TurboQuant / Gemma4 GGUF).
 * Same pattern as ensure-mcp-server.mjs / ensure-search-engine.mjs.
 *
 * Usage:
 *   node scripts/ensure-llama-server.mjs           # health check only
 *   node scripts/ensure-llama-server.mjs --spawn   # spawn if not running
 */

import { spawn }    from 'node:child_process';
import { existsSync } from 'node:fs';
import path          from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir   = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');

const HOST    = process.env.LLAMA_SERVER_HOST ?? '127.0.0.1';
const PORT    = parseInt(process.env.LLAMA_SERVER_PORT ?? '8090', 10);
const BASE    = `http://${HOST}:${PORT}`;
const TIMEOUT = 1_000;
const RETRIES = 20;

const LLAMA_EXE = path.join(projectRoot, 'bin', 'llama-server.exe');
const MODEL     = path.join(projectRoot, 'models', 'gemma4-legal-q4_k_m.gguf');
const MMPROJ    = path.join(projectRoot, 'models', 'mmproj-BF16.gguf');

export async function isLlamaServerHealthy() {
  try {
    const res = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(TIMEOUT) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function ensureLlamaServer() {
  if (await isLlamaServerHealthy()) return true;

  if (!existsSync(LLAMA_EXE)) {
    console.warn('[ensure-llama-server] llama-server.exe not found at', LLAMA_EXE, '— skipping');
    return false;
  }

  if (!existsSync(MODEL)) {
    console.warn('[ensure-llama-server] model not found at', MODEL, '— skipping');
    return false;
  }

  const args = [
    '-m', MODEL,
    '--host', HOST,
    '--port', String(PORT),
    '-c', '65536',
    '-ngl', '99',
    '--cache-prompt',
    '-ctk', 'q8_0',
    '-ctv', 'q8_0',
  ];
  if (existsSync(MMPROJ)) args.push('--mmproj', MMPROJ);

  const child = spawn(LLAMA_EXE, args, {
    detached:    true,
    stdio:       'ignore',
    windowsHide: true,
    cwd:         projectRoot,
  });
  child.unref();

  for (let i = 0; i < RETRIES; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await isLlamaServerHealthy()) return true;
  }
  console.error('[ensure-llama-server] llama-server did not become healthy in time');
  return false;
}

// ── CLI ────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
if (args.includes('--spawn')) {
  const ok = await ensureLlamaServer();
  process.exit(ok ? 0 : 1);
} else {
  const healthy = await isLlamaServerHealthy();
  console.log(healthy
    ? `llama-server: healthy (${BASE})`
    : `llama-server: not running (${BASE})`);
}
