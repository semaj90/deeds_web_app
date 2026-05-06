#!/usr/bin/env node
/**
 * ensure-search-engine.mjs
 *
 * Shared helper — ensures the topology search engine is reachable.
 * Same pattern as ensure-inference.mjs for llama-server.exe.
 *
 * Priority:
 *   1. Already running on :8101 → return immediately
 *   2. Spawn topology-search-server.mjs detached → wait up to 10s
 *   3. Return { ok: false } if spawn fails
 *
 * Usage:
 *   import { ensureSearchEngine } from './ensure-search-engine.mjs';
 *   const se = await ensureSearchEngine();
 *   if (se.ok) console.log('Search engine at', se.baseUrl);
 */

import { spawn }      from 'node:child_process';
import { existsSync } from 'node:fs';
import path           from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SERVER_SCRIPT = path.join(__dirname, 'topology-search-server.mjs');
const DEFAULT_PORT  = Number(process.env.TOPOLOGY_SEARCH_PORT ?? 8101);
const DEFAULT_HOST  = process.env.TOPOLOGY_SEARCH_HOST ?? '127.0.0.1';
const VERSION       = '1.0.0';

// ── Health check ──────────────────────────────────────────────────────────────

export async function isSearchEngineHealthy(baseUrl = `http://${DEFAULT_HOST}:${DEFAULT_PORT}`) {
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(2_500) });
    if (!res.ok) return false;
    const body = await res.json();
    return body.ok === true;
  } catch { return false; }
}

// ── Spawn detached ────────────────────────────────────────────────────────────

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Ensure the topology search engine is running.
 *
 * @param {{ spawn?: boolean, requireEngine?: boolean, baseUrl?: string }} opts
 * @returns {Promise<{ ok: boolean, backend: string, baseUrl?: string, reason?: string }>}
 */
export async function ensureSearchEngine({
  spawn:       trySpawn    = true,
  requireEngine            = false,
  baseUrl                  = `http://${DEFAULT_HOST}:${DEFAULT_PORT}`,
} = {}) {

  // 1. Already up?
  if (await isSearchEngineHealthy(baseUrl)) {
    return { ok: true, backend: 'existing', baseUrl, version: VERSION };
  }

  if (!trySpawn) {
    const result = { ok: false, backend: 'none', reason: 'Not running and spawn disabled.' };
    if (requireEngine) throw new Error(result.reason);
    return result;
  }

  if (!existsSync(SERVER_SCRIPT)) {
    const result = { ok: false, backend: 'none', reason: `Server script not found: ${SERVER_SCRIPT}` };
    if (requireEngine) throw new Error(result.reason);
    return result;
  }

  // 2. Spawn detached — process outlives the parent script
  const child = spawn(
    process.execPath,  // node executable
    [SERVER_SCRIPT],
    {
      detached:    true,
      stdio:       'ignore',
      windowsHide: true,
      env: {
        ...process.env,
        TOPOLOGY_SEARCH_PORT: String(DEFAULT_PORT),
        TOPOLOGY_SEARCH_HOST: DEFAULT_HOST,
      },
    },
  );
  child.unref();

  // 3. Wait up to 10s for /health
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    if (await isSearchEngineHealthy(baseUrl)) {
      return { ok: true, backend: 'spawned', baseUrl, version: VERSION, pid: child.pid };
    }
  }

  const result = {
    ok:     false,
    backend: 'spawn-timeout',
    reason: 'topology-search-server.mjs launched but did not respond within 10s.',
  };
  if (requireEngine) throw new Error(result.reason);
  return result;
}

// ── Convenience: POST to /search/hybrid ──────────────────────────────────────

/**
 * Query the search engine directly — handles ensure + fetch in one call.
 * Returns null if engine unavailable (non-fatal).
 *
 * @param {string} query
 * @param {{ radius?: number, limit?: number, somCluster?: number }} opts
 */
export async function queryTopology(query, opts = {}) {
  const baseUrl = `http://${DEFAULT_HOST}:${DEFAULT_PORT}`;
  const up = await isSearchEngineHealthy(baseUrl);
  if (!up) return null;

  try {
    const res = await fetch(`${baseUrl}/search/hybrid`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ query, ...opts }),
      signal:  AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ── CLI: node ensure-search-engine.mjs [--spawn] [--wait] ────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const doSpawn = process.argv.includes('--spawn');
  const result  = await ensureSearchEngine({ spawn: doSpawn });
  console.log(result.ok
    ? `✅  Search engine ${result.backend} at ${result.baseUrl}`
    : `❌  ${result.reason}`
  );
  process.exit(result.ok ? 0 : 1);
}
