#!/usr/bin/env node
/**
 * swap-lora-adapter.mjs
 *
 * LoRA adapter hot-swap watcher for llama-server / TurboQuant.
 * Watches scripts/lora-adapters/ for new .gguf files and POSTs them
 * to the running llama-server's /v1/lora-adapters endpoint — no restart needed.
 *
 * Usage:
 *   node scripts/swap-lora-adapter.mjs              # watch mode (poll every 30s)
 *   node scripts/swap-lora-adapter.mjs --list       # list active adapters
 *   node scripts/swap-lora-adapter.mjs --clear      # unload all adapters
 *   node scripts/swap-lora-adapter.mjs --once       # scan once and exit
 *   node scripts/swap-lora-adapter.mjs --scale 0.5  # override lora scale (default 0.8)
 *
 * tmux pattern:
 *   pane 0: llama-server --lora-init-without-apply  (so adapter slot stays open)
 *   pane 1: unsloth GRPO training  (writes adapters into scripts/lora-adapters/)
 *   pane 2: node scripts/swap-lora-adapter.mjs
 *
 * llama-server endpoint docs:
 *   GET  /v1/lora-adapters         → list active adapters
 *   POST /v1/lora-adapters         → load adapter  { id, path, scale }
 *   DELETE /v1/lora-adapters/{id}  → unload adapter
 */

import { readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// ── Config ────────────────────────────────────────────────────────────────────

const TURBO_URL  = process.env.TURBOQUANT_BASE_URL ?? process.env.LLAMA_SERVER_URL ?? 'http://127.0.0.1:8080';
const WATCH_DIR  = resolve(__dirname, 'lora-adapters');
const POLL_MS    = parseInt(process.env.LORA_POLL_MS ?? '30000', 10);

const args       = process.argv.slice(2);
const FLAG_LIST  = args.includes('--list');
const FLAG_CLEAR = args.includes('--clear');
const FLAG_ONCE  = args.includes('--once');
const SCALE      = parseFloat(args.find(a => a.startsWith('--scale'))?.split('=')[1] ?? '0.8');

// Track which adapters we've already loaded (path → id)
const loaded     = new Map();

// ── Helpers ───────────────────────────────────────────────────────────────────

async function listActive() {
  const res = await fetch(`${TURBO_URL}/v1/lora-adapters`).catch(() => null);
  if (!res?.ok) { console.error('[lora] server unreachable at', TURBO_URL); return []; }
  const json = await res.json().catch(() => []);
  return Array.isArray(json) ? json : [];
}

async function loadAdapter(adapterPath, scale = SCALE) {
  const name = basename(adapterPath);
  const id   = loaded.size;
  const res  = await fetch(`${TURBO_URL}/v1/lora-adapters`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ id, path: adapterPath, scale }),
  }).catch(() => null);

  if (!res?.ok) {
    const txt = await res?.text().catch(() => '');
    console.error(`[lora] FAIL loading ${name}: ${res?.status ?? 'ECONNREFUSED'} ${txt.slice(0, 120)}`);
    return false;
  }
  loaded.set(adapterPath, id);
  console.log(`[lora] Loaded ${name} → id=${id} scale=${scale}`);
  return true;
}

async function clearAdapters() {
  const active = await listActive();
  for (const a of active) {
    const res = await fetch(`${TURBO_URL}/v1/lora-adapters/${a.id}`, { method: 'DELETE' }).catch(() => null);
    console.log(`[lora] ${res?.ok ? 'Removed' : 'FAIL removing'} adapter id=${a.id} path=${a.path}`);
  }
  loaded.clear();
}

async function scanAndLoad() {
  if (!existsSync(WATCH_DIR)) {
    console.log(`[lora] Watch dir not found, creating: ${WATCH_DIR}`);
    await import('node:fs/promises').then(m => m.mkdir(WATCH_DIR, { recursive: true }));
    return;
  }

  const files = await readdir(WATCH_DIR);
  const gguf  = files.filter(f => f.endsWith('.gguf'));

  if (!gguf.length) {
    console.log('[lora] No .gguf adapters found in', WATCH_DIR);
    return;
  }

  for (const f of gguf) {
    const fullPath = join(WATCH_DIR, f);
    // Skip if already loaded (by path)
    if (loaded.has(fullPath)) continue;

    const s = await stat(fullPath).catch(() => null);
    if (!s || s.size < 1024) continue; // skip empty/incomplete writes

    await loadAdapter(fullPath);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

if (FLAG_LIST) {
  const active = await listActive();
  if (!active.length) { console.log('[lora] No active adapters'); }
  else { active.forEach(a => console.log(`  id=${a.id} scale=${a.scale ?? '?'} ${a.path}`)); }
  process.exit(0);
}

if (FLAG_CLEAR) {
  await clearAdapters();
  console.log('[lora] All adapters cleared');
  process.exit(0);
}

// Warm up from currently active adapters (survive watcher restart)
const existing = await listActive();
existing.forEach(a => { if (a.path) loaded.set(a.path, a.id); });
if (existing.length) console.log(`[lora] ${existing.length} adapter(s) already active`);

await scanAndLoad();

if (FLAG_ONCE) process.exit(0);

// Poll loop
console.log(`[lora] Watching ${WATCH_DIR} every ${POLL_MS / 1000}s — Ctrl+C to stop`);
setInterval(scanAndLoad, POLL_MS);